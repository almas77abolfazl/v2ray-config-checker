'use strict';
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const net = require('net');

const ROOT = path.join(__dirname, '..', '..');
const BIN_DIR = path.join(ROOT, 'bin');
const TMP_DIR = path.join(os.tmpdir(), 'vcc-xray');
const FALLBACK_VERSION = 'v1.8.24';
const GH_REPO = 'XTLS/Xray-core';

function exeName() {
  if (process.platform === 'win32') return 'xray.exe';
  return 'xray';
}

function archiveName() {
  if (process.platform === 'win32') return 'Xray-windows-64.zip';
  if (process.platform === 'darwin') return 'Xray-macos-64.zip';
  if (process.arch === 'arm64') return 'Xray-linux-arm64-v8a.zip';
  return 'Xray-linux-64.zip';
}

function appDataDir() {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return app.getPath('userData');
  } catch (_) { }
  return path.join(ROOT, 'data');
}

function binDir() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) return path.join(app.getPath('userData'), 'bin');
  } catch (_) { }
  return BIN_DIR;
}

function binPath() { return path.join(binDir(), exeName()); }

function extraExeCandidates() {
  const out = [];
  try {
    const { app } = require('electron');
    if (!app || !app.getPath) return out;
    if (app.isPackaged) {
      const exeDir = path.dirname(app.getPath('exe'));
      out.push(path.join(exeDir, 'bin', exeName()));
      out.push(path.join(exeDir, exeName()));
      out.push(path.join(app.getPath('userData'), 'bin', exeName()));
    }
  } catch (_) { }
  return out;
}

function isBinAvailable() {
  if (fs.existsSync(binPath())) return true;
  for (const c of extraExeCandidates()) { try { if (fs.existsSync(c)) return true; } catch (_) { } }
  return false;
}

function resolveXray(settings) {
  const custom = settings && settings.xrayPath;
  if (custom && fs.existsSync(custom)) return custom;
  for (const c of [binPath(), ...extraExeCandidates()]) {
    try { if (fs.existsSync(c)) return c; } catch (_) { }
  }
  return null;
}

async function latestVersion() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'V2RayConfigChecker', Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && j.tag_name) return String(j.tag_name);
  } catch (_) { }
  return FALLBACK_VERSION;
}

async function candidateUrls(settings) {
  const out = [];
  if (settings && settings.xrayDownloadUrl && /^https?:\/\//i.test(settings.xrayDownloadUrl)) out.push(settings.xrayDownloadUrl);
  const version = await latestVersion();
  const asset = archiveName();
  const base = `https://github.com/${GH_REPO}/releases/download/${version}/${asset}`;
  out.push(base);
  out.push(`https://ghfast.top/${base}`);
  out.push(`https://ghproxy.net/${base}`);
  out.push(`https://gh-proxy.com/${base}`);
  out.push(`https://mirror.ghproxy.com/${base}`);
  out.push(`https://github.moeyy.xyz/${base}`);
  out.push(`https://hub.nuaa.cf/${base}`);
  return out;
}

function downloadFile(url, dest, onPercent) {
  return new Promise((resolve, reject) => {
    let file = null;
    const close = () => { try { if (file) file.destroy(); } catch (_) { } };
    fetch(url, { headers: { 'User-Agent': 'V2RayConfigChecker' }, redirect: 'follow' })
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const total = Number(res.headers.get('content-length') || 0);
        file = fs.createWriteStream(dest);
        let received = 0;
        let lastPercent = -5;
        for await (const chunk of Readable.fromWeb(res.body)) {
          file.write(chunk);
          received += chunk.length;
          if (total > 0) {
            const p = Math.floor((received / total) * 100);
            if (p >= lastPercent + 5) { lastPercent = p; onPercent(p); }
          }
        }
        await new Promise((r, j) => { file.end(); file.on('finish', r); file.on('error', j); });
        onPercent(100);
        resolve(received);
      })
      .catch((e) => { close(); reject(e); });
  });
}

function runUnzip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32') {
      const script = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 180000 }, (err, so, se) => {
        if (err) return reject(new Error(String(se || err.message).slice(0, 300)));
        resolve();
      });
    } else {
      execFile('unzip', ['-o', zipPath, '-d', destDir], { timeout: 180000 }, (err, so, se) => {
        if (err) return reject(new Error(String(se || err.message).slice(0, 300)));
        resolve();
      });
    }
  });
}

function findBinary(dir, name) {
  let found = null;
  const walk = (current) => {
    if (found) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === name) { found = full; return; }
    }
  };
  walk(dir);
  return found;
}

async function downloadXray(send, settings) {
  send({ phase: 'version' });
  const urls = await candidateUrls(settings);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const target = binDir();
  const stageDir = path.join(TMP_DIR, 'stage');
  const zipPath = path.join(TMP_DIR, 'xray.zip');
  let lastError = null;
  for (const url of urls) {
    try {
      send({ phase: 'download', url, percent: 0 });
      fs.rmSync(zipPath, { force: true });
      fs.rmSync(stageDir, { recursive: true, force: true });
      await downloadFile(url, zipPath, (percent) => send({ phase: 'download', url, percent }));
      send({ phase: 'extract', url });
      await runUnzip(zipPath, stageDir);
      const binary = findBinary(stageDir, exeName());
      if (!binary) throw new Error('فایل اجرایی xray در آرشیو پیدا نشد');
      const finalPath = path.join(target, exeName());
      const previous = fs.existsSync(finalPath) ? finalPath : null;
      const keepOld = path.join(TMP_DIR, 'xray-previous');
      fs.rmSync(keepOld, { force: true });
      if (previous) {
        try { fs.renameSync(finalPath, keepOld); } catch (_) { fs.rmSync(finalPath, { force: true }); }
      }
      try {
        fs.mkdirSync(target, { recursive: true });
        fs.copyFileSync(binary, finalPath);
        fs.chmodSync(finalPath, 0o755);
      } catch (e) {
        if (fs.existsSync(keepOld)) fs.renameSync(keepOld, finalPath);
        throw e;
      }
      fs.rmSync(keepOld, { force: true });
      try { fs.rmSync(zipPath, { force: true }); } catch (_) { }
      fs.rmSync(stageDir, { recursive: true, force: true });
      send({ phase: 'done', url });
      return finalPath;
    } catch (e) {
      lastError = e;
      send({ phase: 'retry', url, error: String((e && e.message) || e) });
    } finally {
      try { fs.rmSync(zipPath, { force: true }); } catch (_) { }
    }
  }
  throw lastError || new Error('دانلود ناموفق');
}

function ensureXray(send, settings) {
  const existing = resolveXray(settings);
  if (existing) return Promise.resolve(existing);
  return downloadXray(send || (() => { }), settings);
}

function buildInbounds(specs) {
  return specs.map((spec) => {
    if (spec.protocol === 'socks') {
      return { tag: 'socks-in', listen: '127.0.0.1', port: spec.port, protocol: 'socks', settings: { auth: 'noauth', udp: true }, sniffing: { enabled: false } };
    }
    return { tag: 'http-in', listen: '127.0.0.1', port: spec.port, protocol: 'http', settings: {}, sniffing: { enabled: false } };
  });
}

function start(outbound, port, xrayExe) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const cfgPath = path.join(TMP_DIR, `cfg-${port}-${Date.now()}.json`);
  const cfg = {
    log: { loglevel: 'warning' },
    inbounds: buildInbounds([{ protocol: 'socks', port }]),
    outbounds: [outbound]
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  const proc = spawn(xrayExe || binPath(), ['run', '-c', cfgPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let dead = false;
  proc.stderr.on('data', (d) => { stderr = (stderr + String(d)).slice(-800); });
  proc.on('error', () => { dead = true; });
  proc.on('exit', () => { dead = true; });
  return { proc, cfgPath, port, dead: () => dead, exited: () => proc.exitCode !== null || proc.signalCode !== null, getError: () => stderr };
}

function startSession(outbound, socksPort, httpPort, xrayExe) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const cfgPath = path.join(TMP_DIR, `session-${Date.now()}.json`);
  const cfg = {
    log: { loglevel: 'warning' },
    inbounds: buildInbounds([{ protocol: 'socks', port: socksPort }, { protocol: 'http', port: httpPort }]),
    outbounds: [outbound]
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  const proc = spawn(xrayExe || binPath(), ['run', '-c', cfgPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let dead = false;
  proc.stderr.on('data', (d) => { stderr = (stderr + String(d)).slice(-800); });
  proc.on('error', () => { dead = true; });
  proc.on('exit', () => { dead = true; });
  return { proc, cfgPath, port: socksPort, httpPort, session: true, dead: () => dead, exited: () => proc.exitCode !== null || proc.signalCode !== null, getError: () => stderr };
}

function stop(handle) {
  if (!handle) return;
  try { handle.proc.kill(); } catch (_) { }
  if (process.platform === 'win32' && handle.proc.pid) {
    try {
      spawn('taskkill', ['/PID', String(handle.proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch (_) { }
  }
  const removeCfg = () => { try { fs.rmSync(handle.cfgPath, { force: true }); } catch (_) { } };
  if (handle.exited && handle.exited()) removeCfg();
  else setTimeout(removeCfg, 1500);
}

function waitReady(handle, timeoutMs) {
  return new Promise((resolve) => {
    if (!handle || !handle.proc) return resolve(false);
    const started = Date.now();
    const attempt = () => {
      if (handle.exited && handle.exited()) return resolve(false);
      if (Date.now() - started > timeoutMs) return resolve(false);
      const sock = net.connect({ host: '127.0.0.1', port: handle.port });
      sock.setTimeout(500);
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error', () => { sock.destroy(); setTimeout(attempt, 120); });
      sock.once('timeout', () => { sock.destroy(); setTimeout(attempt, 120); });
    };
    attempt();
  });
}

function sweepTemp() {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    for (const entry of fs.readdirSync(TMP_DIR)) {
      if (entry.startsWith('cfg-') || entry.startsWith('session-')) fs.rmSync(path.join(TMP_DIR, entry), { force: true });
    }
  } catch (_) { }
}

module.exports = { binPath, binDir, isBinAvailable, resolveXray, ensureXray, downloadXray, start, startSession, stop, waitReady, sweepTemp, archiveName, latestVersion, BIN_DIR };
