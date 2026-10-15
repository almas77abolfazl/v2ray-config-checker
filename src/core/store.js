'use strict';
const fs = require('fs');
const path = require('path');

let electronApp = null;
try { electronApp = require('electron').app; } catch (_) { electronApp = null; }

const ROOT = path.join(__dirname, '..', '..');
const IS_PACKAGED = electronApp ? electronApp.isPackaged : false;
const DATA_DIR = IS_PACKAGED ? path.join(electronApp.getPath('userData'), 'data') : path.join(ROOT, 'data');

const DEFAULT_SOURCES = [
  { name: 'Epodonios · VLESS', url: 'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/Splitted-By-Protocol/vless.txt', protocol: 'vless', enabled: true },
  { name: 'Telegram Collector · VLESS', url: 'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/vless', protocol: 'vless', enabled: true },
  { name: 'Mahdibland Aggregator', url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt', protocol: 'all', enabled: true },
  { name: 'Epodonios · All', url: 'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt', protocol: 'all', enabled: true },
  { name: 'aiboxx · Daily', url: 'https://raw.githubusercontent.com/aiboxx/v2rayfree/main/v2ray', protocol: 'all', enabled: true },
  { name: 'Pawdroid · Free Servers', url: 'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub', protocol: 'all', enabled: true },
  { name: 'تلگرام iranconnecting', url: 'https://t.me/s/iranconnecting', protocol: 'all', type: 'telegram', enabled: true },
  { name: 'تلگرام v2rayng_org', url: 'https://t.me/s/v2rayng_org', protocol: 'all', type: 'telegram', enabled: true }
];

const DEFAULT_SETTINGS = {
  xrayPath: '',
  xrayDownloadUrl: '',
  concurrency: 6,
  timeoutMs: 12000,
  autoTest: false,
  autoBlacklist: true,
  removeOffline: true,
  skipUnsupported: true,
  blacklistHours: 24,
  telegramNoReader: false,
  maxPerSource: 250
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch (_) { return fallback; }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
    return true;
  } catch (_) { return false; }
}

function getSources() {
  const list = readJson('sources.json', null);
  if (!Array.isArray(list)) return DEFAULT_SOURCES.map((s) => ({ ...s }));
  return list;
}

function saveSources(list) { return writeJson('sources.json', list); }

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(readJson('settings.json', {}) || {}) };
}

function saveSettings(s) { return writeJson('settings.json', { ...s }); }

function getCustomConfigs() {
  const list = readJson('custom.json', []);
  return Array.isArray(list) ? list : [];
}

function saveCustomConfigs(list) { return writeJson('custom.json', list); }

function getCache() { return readJson('cache.json', null); }

function saveCache(data) { return writeJson('cache.json', data); }

function getBlacklist() {
  const list = readJson('blacklist.json', []);
  return Array.isArray(list) ? list : [];
}

function saveBlacklist(list) { return writeJson('blacklist.json', list || []); }

module.exports = {
  DATA_DIR, DEFAULT_SOURCES, DEFAULT_SETTINGS,
  getSources, saveSources,
  getSettings, saveSettings,
  getCustomConfigs, saveCustomConfigs,
  getCache, saveCache,
  getBlacklist, saveBlacklist
};
