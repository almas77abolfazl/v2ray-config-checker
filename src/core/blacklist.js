'use strict';

const MAX_ENTRIES = 5000;

function makeEntry(cfg) {
  return {
    id: String(cfg.id || ''),
    raw: String(cfg.raw || ''),
    address: String(cfg.address || ''),
    port: Number(cfg.port || 0),
    protocol: String(cfg.protocol || ''),
    at: Date.now()
  };
}

function addEntry(list, entry) {
  const out = Array.isArray(list) ? list.slice() : [];
  const key = entry.id || entry.raw;
  const idx = out.findIndex((e) => (e.id || e.raw) === key);
  if (idx >= 0) return out;
  out.push(entry);
  if (out.length > MAX_ENTRIES) return out.slice(out.length - MAX_ENTRIES);
  return out;
}

function buildIndex(list) {
  const ids = new Set();
  const raws = new Set();
  if (Array.isArray(list)) {
    for (const e of list) {
      if (!e) continue;
      if (e.id) ids.add(e.id);
      if (e.raw) raws.add(String(e.raw).split('#')[0]);
    }
  }
  return { ids, raws };
}

function isBlockedIndexed(index, cfg) {
  if (!index || !cfg) return false;
  if (cfg.id && index.ids.has(cfg.id)) return true;
  if (cfg.raw) {
    const rawKey = String(cfg.raw).split('#')[0];
    if (rawKey && index.raws.has(rawKey)) return true;
  }
  return false;
}

function isBlocked(list, cfg) {
  return isBlockedIndexed(buildIndex(list), cfg);
}

function filterConfigs(configs, list) {
  if (!Array.isArray(list) || list.length === 0) return configs || [];
  const index = buildIndex(list);
  return (configs || []).filter((c) => !isBlockedIndexed(index, c));
}

module.exports = { makeEntry, addEntry, isBlocked, isBlockedIndexed, buildIndex, filterConfigs, MAX_ENTRIES };
