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
  if (idx >= 0) {
    out[idx] = Object.assign({}, out[idx], entry, { at: Date.now() });
    return out;
  }
  out.push(entry);
  if (out.length > MAX_ENTRIES) return out.slice(out.length - MAX_ENTRIES);
  return out;
}

function buildIndex(list, ttlMs) {
  const ids = new Set();
  const raws = new Set();
  if (Array.isArray(list)) {
    const now = Date.now();
    for (const e of list) {
      if (!e) continue;
      const expiresAt = Number(e.at || 0) + (Number(ttlMs) > 0 ? Number(ttlMs) : Infinity);
      if (Number.isFinite(expiresAt) && expiresAt < now) continue;
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

function ttlFromHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return h * 3600 * 1000;
}

function filterConfigs(configs, list, ttlMs) {
  if (!Array.isArray(list) || list.length === 0) return configs || [];
  const index = buildIndex(list, ttlMs);
  return (configs || []).filter((c) => !isBlockedIndexed(index, c));
}

function prune(list, ttlMs) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const ttl = Number(ttlMs) || 0;
  if (ttl <= 0) return list.slice();
  const now = Date.now();
  const kept = list.filter((e) => e && Number(e.at || 0) + ttl >= now);
  return kept.length === list.length ? list.slice() : kept;
}

function isBlocked(list, cfg, ttlMs) {
  return isBlockedIndexed(buildIndex(list, ttlMs), cfg);
}

module.exports = { makeEntry, addEntry, isBlocked, isBlockedIndexed, buildIndex, filterConfigs, prune, ttlFromHours, MAX_ENTRIES };
