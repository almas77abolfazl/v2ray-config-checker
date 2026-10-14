'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const xrayCore = require('./xrayCore');
const checker = require('./checker');
const { parseUri } = require('./protocols');

const DEFAULT_SOCKS = 10808;
const DEFAULT_HTTP = 10809;
const REG_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

let state = {
  connected: false,
  cfg: null,
  handle: null,
  connectedAt: 0,
  exitIp: '',
  socksPort: DEFAULT_SOCKS,
  httpPort: DEFAULT_HTTP,
  latencyMs: null
};

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs || 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message || err).slice(0, 200)));
      else resolve(String(stdout || ''));
    });
  });
}

function powershell(script) {
  return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 45000);
}

function dataDir() {
  const { app } = require('electron');
  const root = app && app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(__dirname, '..', '..', 'data');
  return root;
}

function markerPath() { return path.join(dataDir(), 'session-active.json'); }

function writeMarker(previous, ports) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(markerPath(), JSON.stringify({ previous, ports, at: Date.now() }));
  } catch (_) { }
}

function clearMarker() {
  try { fs.rmSync(markerPath(), { force: true }); } catch (_) { }
}

function readMarker() {
  try {
    if (!fs.existsSync(markerPath())) return null;
    return JSON.parse(fs.readFileSync(markerPath(), 'utf8'));
  } catch (_) { return null; }
}

function isFreePort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickPorts() {
  let socks = DEFAULT_SOCKS;
  for (let i = 0; i < 50; i += 1) {
    const http = socks + 1;
    if ((await isFreePort(socks)) && (await isFreePort(http))) return { socks, http };
    socks += 2;
  }
  return { socks: DEFAULT_SOCKS, http: DEFAULT_HTTP };
}

async function readProxySettings() {
  const out = await powershell(`(Get-ItemProperty -Path '${REG_KEY}' -ErrorAction SilentlyContinue | Select-Object ProxyEnable,ProxyServer,ProxyOverride | ConvertTo-Json -Compress)`);
  try {
    const j = JSON.parse(out.trim());
    return {
      enable: Number(j.ProxyEnable || 0),
      server: String(j.ProxyServer || ''),
      override: String(j.ProxyOverride == null ? '' : j.ProxyOverride)
    };
  } catch (_) {
    return { enable: 0, server: '', override: '' };
  }
}

const WININET_REFRESH = `
$code = '[DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l);';
try { Add-Type -MemberDefinition $code -Name WInetX -Namespace VCCX -PassThru | Out-Null; } catch {}
try {
  [VCCX.WInetX]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null;
  [VCCX.WInetX]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null;
  [VCCX.WInetX]::InternetSetOption([IntPtr]::Zero, 95, [IntPtr]::Zero, 0) | Out-Null;
} catch {}
`;

async function applySystemProxy(server) {
  await powershell(
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyServer -Value '${server}';` +
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyEnable -Value 1;` +
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyOverride -Value '<local>';` +
    WININET_REFRESH
  );
}

async function disableSystemProxy() {
  await powershell(
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyEnable -Value 0;` +
    WININET_REFRESH
  );
}

async function restoreSystemProxy(prev) {
  const override = String((prev && prev.override) || '').replace(/'/g, "''") || '<local>';
  await powershell(
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyEnable -Value ${prev && prev.enable ? 1 : 0};` +
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyServer -Value '${String((prev && prev.server) || '').replace(/'/g, "''")}';` +
    `Set-ItemProperty -Path '${REG_KEY}' -Name ProxyOverride -Value '${override}';` +
    WININET_REFRESH
  );
}

async function recoverStaleSession() {
  const marker = readMarker();
  if (!marker) return null;
  clearMarker();
  try {
    if (marker.previous && marker.previous.enable && marker.previous.server) await restoreSystemProxy(marker.previous);
    else await disableSystemProxy();
    return { recovered: true, previous: marker.previous || null };
  } catch (_) {
    try { await disableSystemProxy(); } catch (_) { }
    return { recovered: true, previous: null };
  }
}

let previousProxy = { enable: 0, server: '', override: '' };

async function connect(raw, settings) {
  await disconnect();
  if (process.platform !== 'win32') {
    throw new Error('تنظیم خودکار پروکسی سیستمی فقط روی ویندوز پشتیبانی می‌شود');
  }
  const cfg = parseUri(raw, { name: 'اتصال' });
  if (!cfg.outbound) throw new Error(cfg.reason || 'این کانفیگ قابل اتصال نیست');
  const exe = xrayCore.resolveXray(settings);
  if (!exe) throw new Error('Xray-core نصب نیست. ابتدا آن را دانلود یا مسیرش را ثبت کنید.');
  previousProxy = await readProxySettings().catch(() => ({ enable: 0, server: '', override: '' }));
  const { socks, http } = await pickPorts();
  const handle = xrayCore.startSession(cfg.outbound, socks, http, exe);
  const ready = await xrayCore.waitReady(handle, 6000);
  if (!ready) {
    xrayCore.stop(handle);
    throw new Error(handle.getError() ? `xray بالا نیامد: ${handle.getError().trim().split('\n').slice(-1)[0].slice(0, 110)}` : 'xray بالا نیامد');
  }
  const conn = await checker.checkConnection(socks, 12000);
  if (!conn.ok) {
    xrayCore.stop(handle);
    throw new Error('اتصال برقرار نشد — ' + conn.reason);
  }
  await applySystemProxy(`127.0.0.1:${http}`);
  const exit = await checker.exitIp(socks, 8000).catch(() => '');
  writeMarker(previousProxy, { socks, http });
  state = {
    connected: true,
    cfg: { id: cfg.id, name: cfg.name, raw: cfg.raw, protocol: cfg.protocol, address: cfg.address, port: cfg.port, network: cfg.network, security: cfg.security, origin: cfg.origin },
    handle,
    connectedAt: Date.now(),
    exitIp: exit,
    socksPort: socks,
    httpPort: http,
    latencyMs: conn.ms
  };
  return status();
}

function status() {
  if (!state.connected) return { connected: false };
  return {
    connected: true,
    config: state.cfg,
    exitIp: state.exitIp,
    socksPort: state.socksPort,
    httpPort: state.httpPort,
    latencyMs: state.latencyMs,
    since: state.connectedAt
  };
}

async function disconnect() {
  if (!state.connected) return { connected: false };
  const { handle } = state;
  state.connected = false;
  const cfg = state.cfg;
  state.cfg = null;
  clearMarker();
  if (handle) xrayCore.stop(handle);
  try {
    if (previousProxy && previousProxy.enable && previousProxy.server) await restoreSystemProxy(previousProxy);
    else await disableSystemProxy();
  } catch (_) {
    try { await disableSystemProxy(); } catch (_) { }
  }
  return { connected: false, previous: cfg };
}

function isConnected() { return state.connected; }

module.exports = { connect, disconnect, status, isConnected, recoverStaleSession, DEFAULT_SOCKS, DEFAULT_HTTP };
