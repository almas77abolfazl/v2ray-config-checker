'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./src/core/store');
const collector = require('./src/core/collector');
const engine = require('./src/core/testEngine');
const blacklist = require('./src/core/blacklist');
const session = require('./src/core/session');
const xrayCore = require('./src/core/xrayCore');
const checker = require('./src/core/checker');
const { parseConfigsFromText, parseUri } = require('./src/core/protocols');

let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0a0d13',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try { return { ok: true, data: await fn(payload || {}, event) }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
}

function sanitizeXrayPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!fs.existsSync(raw)) return '';
  const base = path.basename(raw).toLowerCase();
  if (base !== 'xray.exe' && base !== 'xray') return '';
  return raw;
}

function registerIpc() {
  handle('sources:list', () => store.getSources());
  handle('sources:add', ({ url, name, protocol }) => {
    const clean = String(url || '').trim();
    if (!/^https?:\/\//i.test(clean)) throw new Error('آدرس منبع باید با http:// یا https:// شروع شود');
    const list = store.getSources();
    if (list.some((s) => s.url === clean)) throw new Error('این منبع قبلاً اضافه شده است');
    const proto = ['vless', 'vmess', 'trojan', 'ss', 'all'].includes(String(protocol)) ? String(protocol) : 'all';
    list.push({ url: clean, name: String(name || '').trim() || clean, protocol: proto, enabled: true });
    store.saveSources(list);
    return list;
  });
  handle('sources:remove', ({ url }) => {
    const list = store.getSources().filter((s) => s.url !== url);
    store.saveSources(list);
    return list;
  });
  handle('sources:toggle', ({ url, enabled }) => {
    const list = store.getSources();
    const item = list.find((s) => s.url === url);
    if (item) item.enabled = !!enabled;
    store.saveSources(list);
    return list;
  });
  handle('sources:reset', () => {
    const def = store.DEFAULT_SOURCES.map((s) => ({ ...s }));
    store.saveSources(def);
    return def;
  });

  handle('collect', async ({ urls }) => {
    const settings = store.getSettings();
    let sources = store.getSources().filter((s) => s.enabled !== false);
    if (Array.isArray(urls) && urls.length > 0) sources = sources.filter((s) => urls.includes(s.url));
    if (sources.length === 0) throw new Error('هیچ منبع فعالی وجود ندارد');
    const results = await collector.collect(sources, settings, (p) => send('collect:progress', p));
    const seen = new Set();
    const configs = [];
    let errors = 0;
    for (const r of results) {
      if (r.error) errors += 1;
      for (const cfg of r.list) {
        if (!seen.has(cfg.id)) { seen.add(cfg.id); configs.push(cfg); }
      }
    }
    const blocked = store.getBlacklist();
    const filtered = blacklist.filterConfigs(configs, blocked);
    return { configs: filtered, blocked: configs.length - filtered.length, errors, sources: sources.length };
  });

  handle('configs:import', ({ text }) => {
    const parsed = parseConfigsFromText(text, { name: 'لیست دستی' });
    if (parsed.length === 0) throw new Error('هیچ کانفیگ معتبری در متن وارد‌شده پیدا نشد');
    const existing = store.getCustomConfigs();
    const known = new Set(existing.map((c) => c.raw));
    for (const c of parsed) {
      if (!known.has(c.raw)) { known.add(c.raw); existing.push({ raw: c.raw, name: c.name }); }
    }
    store.saveCustomConfigs(existing);
    return parsed;
  });

  handle('configs:parse', ({ items }) => {
    const blocked = store.getBlacklist();
    const out = [];
    for (const item of Array.isArray(items) ? items : []) {
      const name = String(item.name || '').trim();
      let uri = String(item.raw || '').trim();
      if (name && uri.indexOf('#') < 0) uri = uri + '#' + encodeURIComponent(name);
      const cfg = parseUri(uri, { name: name || 'لیست دستی' });
      cfg.id = cfg.id || String(Date.now()) + Math.random().toString(36).slice(2, 8);
      if (blacklist.isBlocked(blocked, cfg)) continue;
      out.push(cfg);
    }
    return out;
  });

  handle('custom:list', () => store.getCustomConfigs());
  handle('custom:remove', ({ index }) => {
    const list = store.getCustomConfigs();
    list.splice(Number(index), 1);
    store.saveCustomConfigs(list);
    return list;
  });

  handle('tests:run', async ({ configs, options }) => {
    const settings = store.getSettings();
    const exe = xrayCore.resolveXray(settings);
    if (!exe) throw new Error('Xray-core نصب نیست. ابتدا از بخش تنظیمات آن را دانلود کنید.');
    const merged = {
      concurrency: settings.concurrency,
      timeoutMs: settings.timeoutMs,
      ...(options || {})
    };
    const byId = new Map((configs || []).map((c) => [c.id, c]));
    let blacklistChanged = false;
    let list = store.getBlacklist();
    let index = blacklist.buildIndex(list);
    const summary = await engine.run(configs, merged, (p) => {
      if (settings.autoBlacklist !== false && p && p.status === 'offline') {
        const cfg = byId.get(p.id);
        if (cfg && !blacklist.isBlockedIndexed(index, cfg)) {
          list = blacklist.addEntry(list, blacklist.makeEntry(cfg));
          index = blacklist.buildIndex(list);
          blacklistChanged = true;
        }
      }
      send('test:update', p);
    }, exe);
    if (blacklistChanged) store.saveBlacklist(list);
    send('test:blacklist', { count: list.length });
    return summary;
  });
  handle('tests:stop', () => engine.stop());

  handle('blacklist:list', () => store.getBlacklist());
  handle('blacklist:clear', () => {
    store.saveBlacklist([]);
    return [];
  });

  handle('settings:get', () => store.getSettings());
  handle('settings:set', (p) => {
    const next = { ...p };
    if ('xrayPath' in next) next.xrayPath = sanitizeXrayPath(next.xrayPath);
    if ('xrayDownloadUrl' in next && next.xrayDownloadUrl && !/^https?:\/\//i.test(String(next.xrayDownloadUrl))) delete next.xrayDownloadUrl;
    const merged = { ...store.getSettings(), ...next };
    store.saveSettings(merged);
    return store.getSettings();
  });

  handle('xray:status', () => {
    const settings = store.getSettings();
    const resolved = xrayCore.resolveXray(settings);
    return { available: !!resolved, path: resolved || '' };
  });
  handle('xray:ensure', () => {
    const settings = store.getSettings();
    return xrayCore.ensureXray((p) => send('xray:progress', p), settings);
  });
  handle('xray:select', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const r = await dialog.showOpenDialog(win, {
      title: 'انتخاب فایل xray',
      properties: ['openFile'],
      filters: [{ name: 'Xray', extensions: ['exe', '*'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const settings = store.getSettings();
    settings.xrayPath = r.filePaths[0];
    store.saveSettings(settings);
    return settings;
  });

  handle('session:connect', async ({ raw }) => {
    const settings = store.getSettings();
    const result = await session.connect(raw, settings);
    send('session:changed', result);
    return result;
  });
  handle('session:disconnect', async () => {
    const result = await session.disconnect();
    send('session:changed', result);
    return result;
  });
  handle('session:status', () => session.status());

  handle('cache:get', () => {
    const cache = store.getCache();
    if (cache && Array.isArray(cache.configs)) {
      const blocked = store.getBlacklist();
      cache.configs = blacklist.filterConfigs(cache.configs, blocked);
    }
    return cache;
  });
  handle('cache:save', (p) => store.saveCache(p));

  handle('file:save', async ({ content, defaultName }) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const r = await dialog.showSaveDialog(win, { defaultName: defaultName || 'configs.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, content, 'utf8');
    return r.filePath;
  });

  handle('window:minimize', () => mainWindow && mainWindow.minimize());
  handle('window:maximize', () => {
    if (!mainWindow) return null;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  handle('window:close', () => mainWindow && mainWindow.close());
}

app.whenReady().then(() => {
  registerIpc();
  xrayCore.sweepTemp();
  checker.sweepTempDir();
  session.recoverStaleSession().then((res) => {
    if (res && res.recovered) {
      setTimeout(() => send('session:recovered', res), 800);
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', (e) => {
  engine.stop();
  if (session.isConnected()) {
    e.preventDefault();
    session.disconnect()
      .catch(() => { })
      .then(() => { app.exit(0); });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
