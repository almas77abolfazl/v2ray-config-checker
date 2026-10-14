'use strict';
const { parseConfigsFromText } = require('./protocols');
const store = require('./store');

const SOURCE_TIMEOUT_MS = 30000;
const CONCURRENCY = 4;

function isTelegramSource(src) {
  return src && (src.type === 'telegram' || /^https?:\/\/(t\.me|telegram\.me)\/s\//i.test(String(src.url || '')));
}

function telegramPageToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|pre|code|span)>/gi, '\n')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const READER_MIRRORS = [
  (u) => 'https://r.jina.ai/' + u
];

function readerText(markdown) {
  return String(markdown || '')
    .replace(/```[a-zA-Z0-9]*\n?/g, '\n')
    .replace(/`/g, '\n');
}

async function fetchTelegramWithReader(src, signal, timeoutMs) {
  let lastError = null;
  for (const makeUrl of READER_MIRRORS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
      const res = await fetch(makeUrl(src.url), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) V2RayConfigChecker/1.0', Accept: 'text/plain' },
        redirect: 'follow'
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.text();
      return readerText(body);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('reader mirror failed');
}

async function fetchOne(src, settings, onProgress) {
  onProgress({ url: src.url, name: src.name, state: 'fetching' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', Accept: '*/*' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const fetched = await res.text();
    const text = isTelegramSource(src) ? telegramPageToText(fetched) : fetched;
    let list = parseConfigsFromText(text, src);
    const want = String(src.protocol || 'all').toLowerCase();
    if (want && want !== 'all') list = list.filter((c) => c.protocol === want);
    const max = Math.max(10, Number(settings && settings.maxPerSource) || store.DEFAULT_SETTINGS.maxPerSource);
    const total = list.length;
    if (list.length > max) list = list.slice(0, max);
    onProgress({ url: src.url, name: src.name, state: 'done', count: list.length, total });
    return { src, list, error: null };
  } catch (err) {
    const directMsg = err && err.name === 'AbortError' ? 'تایم‌اوت' : String((err && err.message) || err);
    const useReader = isTelegramSource(src) && !(settings && settings.telegramNoReader);
    if (useReader) {
      try {
        const body = await fetchTelegramWithReader(src, ctrl.signal, SOURCE_TIMEOUT_MS);
        const text = telegramPageToText(body);
        let list = parseConfigsFromText(text, src);
        const want = String(src.protocol || 'all').toLowerCase();
        if (want && want !== 'all') list = list.filter((c) => c.protocol === want);
        const max = Math.max(10, Number(settings && settings.maxPerSource) || store.DEFAULT_SETTINGS.maxPerSource);
        const total = list.length;
        if (list.length > max) list = list.slice(0, max);
        onProgress({ url: src.url, name: src.name, state: 'done', count: list.length, total, via: 'reader' });
        return { src, list, error: null, via: 'reader', directError: directMsg };
      } catch (readerErr) {
        onProgress({ url: src.url, name: src.name, state: 'error', error: directMsg + ' (reader: ' + String((readerErr && readerErr.message) || readerErr) + ')' });
        return { src, list: [], error: directMsg };
      }
    }
    onProgress({ url: src.url, name: src.name, state: 'error', error: directMsg });
    return { src, list: [], error: directMsg };
  } finally {
    clearTimeout(timer);
  }
}

async function collect(sources, settings, onProgress) {
  const active = sources.filter((s) => s.enabled !== false);
  let done = 0;
  const results = [];
  let index = 0;
  const worker = async () => {
    while (index < active.length) {
      const src = active[index++];
      const res = await fetchOne(src, settings, onProgress);
      done += 1;
      onProgress({ url: src.url, name: src.name, state: 'progress', done, total: active.length });
      results.push(res);
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, Math.max(1, active.length)); i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

module.exports = { collect, fetchOne, isTelegramSource, telegramPageToText };
