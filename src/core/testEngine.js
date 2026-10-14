'use strict';
const dns = require('dns');
const net = require('net');
const xrayCore = require('./xrayCore');
const checker = require('./checker');
const { parseUri } = require('./protocols');

const PORT_BASE = 20800;
const PORT_SPAN = 900;
const TCP_TIMEOUT_MS = 3000;
const READY_TIMEOUT_MS = 4000;
let portCounter = 0;
const busyPorts = new Set();
const pendingPorts = new Set();
const activeHandles = new Set();

let running = false;

function tcpReachable(address, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!address || !port) return resolve(false);
    const cap = Math.max(400, Number(timeoutMs) || 0);
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    const overall = setTimeout(() => done(false), cap);
    dns.lookup(address, { all: true, verbatim: false }, (err, addresses) => {
      if (settled) return;
      if (err || !addresses || addresses.length === 0) { clearTimeout(overall); return done(false); }
      let pending = addresses.length;
      let ok = false;
      const finish = (success) => {
        if (success && !ok) { ok = true; clearTimeout(overall); done(true); return; }
        if (!success && --pending === 0 && !ok) { clearTimeout(overall); done(false); }
      };
      for (const addr of addresses) {
        const sock = net.connect({ host: addr.address, port, family: addr.family });
        sock.setTimeout(cap);
        sock.once('connect', () => { sock.destroy(); finish(true); });
        sock.once('error', () => { sock.destroy(); finish(false); });
        sock.once('timeout', () => { sock.destroy(); finish(false); });
      }
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function allocPort() {
  for (let i = 0; i < PORT_SPAN; i += 1) {
    portCounter += 1;
    const p = PORT_BASE + (portCounter % PORT_SPAN);
    if (busyPorts.has(p) || pendingPorts.has(p)) continue;
    pendingPorts.add(p);
    const free = await isPortFree(p);
    pendingPorts.delete(p);
    if (free) { busyPorts.add(p); return p; }
  }
  throw new Error('پورت آزاد نیست');
}

function releasePort(p) { busyPorts.delete(p); }

async function testOne(cfg, budgetMs, xrayExe) {
  let parsed = cfg;
  if (cfg && typeof cfg.raw === 'string' && (!cfg.outbound || !cfg.outbound.settings)) {
    parsed = parseUri(cfg.raw, { name: cfg.origin || 'لیست دستی' });
    parsed.id = cfg.id || parsed.id;
    parsed.name = cfg.name || parsed.name;
    parsed.origin = cfg.origin || parsed.origin;
  }
  if (!parsed.outbound) {
    return { status: 'offline', gemini: 'error', youtube: 'error', note: parsed.reason || 'پشتیبانی نمی‌شود' };
  }
  const budget = Math.max(6000, Number(budgetMs) || 12000);
  const deadline = Date.now() + budget;
  const left = () => deadline - Date.now();
  let handle = null;
  let port = null;
  try {
    const tcpLeft = Math.min(TCP_TIMEOUT_MS, left());
    if (tcpLeft <= 0) return { status: 'offline', gemini: 'error', youtube: 'error', note: 'بودجه زمان تمام شد' };
    const reachable = await tcpReachable(parsed.address, parsed.port, tcpLeft);
    if (!reachable) {
      return { status: 'offline', gemini: 'error', youtube: 'error', note: 'سرور از این دستگاه قابل دسترسی نیست' };
    }
    port = await allocPort();
    handle = xrayCore.start(parsed.outbound, port, xrayExe);
    activeHandles.add(handle);
    const ready = await xrayCore.waitReady(handle, Math.min(READY_TIMEOUT_MS, Math.max(800, left() * 0.4)));
    if (!ready) {
      const err = handle.getError();
      return { status: 'offline', gemini: 'error', youtube: 'error', note: err ? `xray: ${err.trim().split('\n').slice(-1)[0].slice(0, 110)}` : 'xray بالا نیامد' };
    }
    const conn = await checker.checkConnection(port, Math.max(1200, left() * 0.5));
    if (!conn.ok) {
      return { status: 'offline', gemini: 'error', youtube: 'error', latencyMs: conn.ms, note: conn.reason };
    }
    const gemBudget = Math.max(800, left() * 0.3);
    const gem = await checker.checkGemini(port, gemBudget);
    const result = { status: 'online', gemini: gem.state, httpStatus: gem.httpStatus, latencyMs: conn.ms, exitIp: conn.ip, note: gem.note };
    const ytBudget = left() - 400;
    if (ytBudget >= 1200) {
      const yt = await checker.checkYoutube(port, ytBudget);
      result.youtube = yt.state;
      result.youtubeHttpStatus = yt.httpStatus;
    } else {
      result.youtube = 'unknown';
    }
    return result;
  } catch (e) {
    return { status: 'offline', gemini: 'error', youtube: 'error', note: String((e && e.message) || e).slice(0, 160) };
  } finally {
    if (handle) { activeHandles.delete(handle); xrayCore.stop(handle); }
    if (port != null) releasePort(port);
  }
}

async function run(configs, options, onUpdate, xrayExe) {
  const list = (configs || []).filter(Boolean);
  if (list.length === 0) {
    return { total: 0, tested: 0, online: 0, offline: 0, geminiOpen: 0, geminiCountry: 0, geminiBlocked: 0, youtubeOpen: 0, offlineIds: [], onlineIds: [], skipped: true };
  }
  running = true;
  const concurrency = Math.max(1, Math.min(16, Number(options && options.concurrency) || 6));
  const timeoutMs = Math.max(6000, Number(options && options.timeoutMs) || 12000);
  const summary = {
    total: list.length, tested: 0, online: 0, offline: 0,
    geminiOpen: 0, geminiCountry: 0, geminiBlocked: 0, youtubeOpen: 0,
    offlineIds: [], onlineIds: []
  };
  let index = 0;
  const worker = async () => {
    while (running) {
      const i = index;
      index += 1;
      if (i >= list.length) return;
      const cfg = list[i];
      if (onUpdate) onUpdate({ id: cfg.id, status: 'testing' });
      const res = await testOne(cfg, timeoutMs, xrayExe);
      summary.tested += 1;
      if (res.status === 'online') { summary.online += 1; summary.onlineIds.push(cfg.id); }
      else { summary.offline += 1; summary.offlineIds.push(cfg.id); }
      if (res.gemini === 'open') summary.geminiOpen += 1;
      else if (res.gemini === 'country') summary.geminiCountry += 1;
      else if (res.gemini === 'blocked') summary.geminiBlocked += 1;
      if (res.youtube === 'open') summary.youtubeOpen += 1;
      if (onUpdate) onUpdate({ id: cfg.id, ...res });
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, list.length); i += 1) workers.push(worker());
  await Promise.all(workers);
  running = false;
  return summary;
}

function stop() {
  running = false;
  for (const handle of activeHandles) xrayCore.stop(handle);
  activeHandles.clear();
}

module.exports = { run, stop, testOne };
