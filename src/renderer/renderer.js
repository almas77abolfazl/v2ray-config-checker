'use strict';

const ICONS = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5 9.5-12H12z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="13" rx="2"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0V7zm5 9v5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h8l1-13"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3.6 2.8 14.4 0 18M12 3c-2.8 3.6-2.8 14.4 0 18"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>'
};

const FILTERS = [
  { id: 'all', label: 'همه' },
  { id: 'online', label: 'آنلاین' },
  { id: 'gemini-open', label: 'جمنای باز' },
  { id: 'youtube-open', label: 'یوتیوب باز' },
  { id: 'gemini-issue', label: 'محدود / بسته' },
  { id: 'offline', label: 'آفلاین' },
  { id: 'untested', label: 'تست‌نشده' }
];

const MAX_VISIBLE = 120;
const PAGE_STEP = 120;

const state = {
  configs: new Map(),
  sources: [],
  settings: {},
  custom: [],
  blacklist: [],
  filter: 'all',
  query: '',
  selectedId: null,
  collecting: false,
  testing: false,
  xrayAvailable: false,
  session: { connected: false },
  testTotal: 0,
  testDone: 0,
  renderCount: MAX_VISIBLE,
  pending: new Map(),
  flushTimer: null,
  searchTimer: null,
  uptimeTimer: null,
  cacheTimer: null
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function errText(e) { return String((e && e.message) || e || 'خطای نامشخص'); }

async function call(promise) {
  const r = await promise;
  if (!r || !r.ok) throw new Error((r && r.error) || 'خطای نامشخص');
  return r.data;
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = 'all .3s ease'; }, 3600);
  setTimeout(() => el.remove(), 4000);
}

function fmtLatency(ms) {
  if (ms == null) return '<span class="latency">—</span>';
  const cls = ms < 800 ? 'fast' : ms < 2200 ? 'med' : 'slow';
  return '<span class="latency ' + cls + '">' + ms + ' ms</span>';
}

function protocolBadge(p) {
  const v = String(p || '').toLowerCase();
  const known = ['vless', 'vmess', 'trojan', 'ss'].includes(v) ? v : 'unknown';
  return '<span class="badge badge-' + known + '">' + esc(String(p || '?').toUpperCase()) + '</span>';
}

function statusPill(c) {
  if (c.supported === false) return '<span class="pill pill-muted" title="' + esc(c.reason || 'پشتیبانی نمی‌شود') + '">پشتیبانی نشده</span>';
  if (c.status === 'testing') return '<span class="pill pill-info">در حال تست…</span>';
  if (c.status === 'online') return '<span class="pill pill-ok" title="' + esc(c.exitIp || '') + '">آنلاین</span>';
  if (c.status === 'offline') return '<span class="pill pill-bad" title="' + esc(c.note || '') + '">آفلاین</span>';
  return '<span class="pill pill-muted">—</span>';
}

function servicePill(c, key) {
  const label = key === 'gemini' ? 'جمنای' : 'یوتیوب';
  switch (c[key]) {
    case 'open': return '<span class="pill pill-ok" title="' + esc(c.note || '') + '">' + label + ' باز</span>';
    case 'country': return '<span class="pill pill-warn" title="' + esc(c.note || '') + '">محدود کشور</span>';
    case 'blocked': return '<span class="pill pill-bad" title="' + esc(c.note || '') + '">403 / بلاک</span>';
    case 'error': return '<span class="pill pill-muted" title="' + esc(c.note || '') + '">نامشخص</span>';
    default: return '<span class="pill pill-muted">—</span>';
  }
}

function matchesFilter(c) {
  if (state.filter === 'online') return c.status === 'online';
  if (state.filter === 'gemini-open') return c.gemini === 'open';
  if (state.filter === 'youtube-open') return c.youtube === 'open';
  if (state.filter === 'gemini-issue') return c.gemini === 'country' || c.gemini === 'blocked' || c.youtube === 'country' || c.youtube === 'blocked';
  if (state.filter === 'offline') return c.status === 'offline';
  if (state.filter === 'untested') return !c.status || c.status === 'pending';
  return true;
}

function visibleConfigs(sorted) {
  const q = state.query.trim().toLowerCase();
  let list = Array.from(state.configs.values());
  if (q) list = list.filter((c) => (c.name + ' ' + c.address + ' ' + c.raw + ' ' + c.origin).toLowerCase().includes(q));
  list = list.filter(matchesFilter);
  if (sorted !== false) {
    const rank = (c) => {
      if (c.gemini === 'open' && c.youtube === 'open') return 0;
      if (c.gemini === 'open' || c.youtube === 'open') return 1;
      if (c.status === 'online') return 2;
      if (c.status) return 3;
      return 4;
    };
    list.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (a.latencyMs != null && b.latencyMs != null) return a.latencyMs - b.latencyMs;
      if (a.latencyMs != null) return -1;
      if (b.latencyMs != null) return 1;
      return String(a.name).localeCompare(String(b.name), 'fa');
    });
  }
  return list;
}

function countBy(pred) { return Array.from(state.configs.values()).filter(pred).length; }

function renderStats() {
  const total = state.configs.size;
  const online = countBy((c) => c.status === 'online');
  const geminiOpen = countBy((c) => c.gemini === 'open');
  const youtubeOpen = countBy((c) => c.youtube === 'open');
  const issue = countBy((c) => c.gemini === 'country' || c.gemini === 'blocked' || c.youtube === 'country' || c.youtube === 'blocked');
  const offline = countBy((c) => c.status === 'offline');
  const cards = [
    { cls: 'total', filter: 'all', num: total, lbl: 'کل کانفیگ‌ها' },
    { cls: 'ok', filter: 'online', num: online, lbl: 'آنلاین' },
    { cls: 'ok', filter: 'gemini-open', num: geminiOpen, lbl: 'جمنای باز' },
    { cls: 'ok', filter: 'youtube-open', num: youtubeOpen, lbl: 'یوتیوب باز' },
    { cls: 'warn', filter: 'gemini-issue', num: issue, lbl: 'محدود / بسته' },
    { cls: 'bad', filter: 'offline', num: offline, lbl: 'آفلاین' }
  ];
  $('#stats').innerHTML = cards
    .map((c) =>
      '<button type="button" class="stat ' + c.cls + (state.filter === c.filter ? ' active' : '') + '" data-stat-filter="' + c.filter + '" title="فیلتر لیست بر اساس این مورد">' +
      '<span class="num">' + c.num + '</span><span class="lbl">' + c.lbl + '</span></button>'
    )
    .join('');
}

function renderFilters() {
  const counts = {
    all: state.configs.size,
    online: countBy((c) => c.status === 'online'),
    'gemini-open': countBy((c) => c.gemini === 'open'),
    'youtube-open': countBy((c) => c.youtube === 'open'),
    'gemini-issue': countBy((c) => c.gemini === 'country' || c.gemini === 'blocked' || c.youtube === 'country' || c.youtube === 'blocked'),
    offline: countBy((c) => c.status === 'offline'),
    untested: state.configs.size - countBy((c) => c.status === 'online' || c.status === 'offline')
  };
  $('#filters').innerHTML = FILTERS
    .map((f) => '<button class="filter-chip' + (state.filter === f.id ? ' active' : '') + '" data-filter="' + f.id + '">' + f.label + '<span class="cnt">' + counts[f.id] + '</span></button>')
    .join('');
}

function connectedId() {
  return state.session.connected && state.session.config ? state.session.config.id : null;
}

function rowHtml(c, i) {
  const cid = connectedId();
  const rowCls = [c.id === cid ? 'is-connected' : '', c.id === state.selectedId ? 'selected' : ''].join(' ').trim();
  const connBtn = c.supported === false
    ? ''
    : cid === c.id
      ? '<button class="icon-btn stop" data-act="disconnect" title="قطع اتصال">' + ICONS.stop + '</button>'
      : '<button class="icon-btn connect" data-act="connect" title="اتصال و تنظیم پروکسی سیستمی">' + ICONS.plug + '</button>';
  return (
    '<tr data-id="' + c.id + '"' + (rowCls ? ' class="' + rowCls + '"' : '') + '>' +
    '<td class="col-index">' + (i + 1) + '</td>' +
    '<td><div class="cell-name"><span class="n" title="' + esc(c.name) + '">' + esc(c.name) + '</span><span class="o">' + esc(c.origin) + '</span></div></td>' +
    '<td>' + protocolBadge(c.protocol) + '</td>' +
    '<td><span class="addr" title="' + esc(c.address) + '">' + esc(c.address) + '</span></td>' +
    '<td class="col-port">' + esc(c.port) + '</td>' +
    '<td><div class="net"><span>' + esc(c.network || '—') + '</span><span>' + esc(c.security || '—') + '</span></div></td>' +
    '<td class="col-latency" data-cell="latency">' + fmtLatency(c.latencyMs) + '</td>' +
    '<td data-cell="status">' + statusPill(c) + '</td>' +
    '<td data-cell="gemini">' + servicePill(c, 'gemini') + '</td>' +
    '<td data-cell="youtube">' + servicePill(c, 'youtube') + '</td>' +
    '<td class="col-actions"><div class="actions">' +
    (c.supported === false ? '' : '<button class="icon-btn" data-act="test" title="تست این کانفیگ">' + ICONS.play + '</button>') +
    connBtn +
    '<button class="icon-btn" data-act="copy" title="کپی لینک کانفیگ">' + ICONS.copy + '</button>' +
    '</div></td>' +
    '</tr>'
  );
}

function renderTable(sorted) {
  const list = visibleConfigs(sorted === false ? false : true);
  const shown = Math.min(list.length, state.renderCount);
  const body = $('#tbody');
  const empty = $('#empty');
  if (list.length === 0) {
    body.innerHTML = '';
    $('#table').style.display = 'none';
    empty.classList.add('show');
    $('#row-count').textContent = '';
    return;
  }
  empty.classList.remove('show');
  $('#table').style.display = 'table';
  let html = '';
  for (let i = 0; i < shown; i += 1) html += rowHtml(list[i], i);
  body.innerHTML = html;
  $('#row-count').textContent = shown < list.length
    ? list.length + ' کانفیگ — نمایش ' + shown + ' (برای بیشتر اسکرول کنید)'
    : list.length + ' کانفیگ';
}

function setRowConnectedClass(id, on) {
  const tr = document.querySelector('tr[data-id="' + id + '"]');
  if (tr) tr.classList.toggle('is-connected', on);
}

function patchRow(id) {
  const c = state.configs.get(id);
  const tr = document.querySelector('tr[data-id="' + id + '"]');
  if (!c || !tr) return;
  const lat = tr.querySelector('[data-cell="latency"]');
  const st = tr.querySelector('[data-cell="status"]');
  const gm = tr.querySelector('[data-cell="gemini"]');
  const yt = tr.querySelector('[data-cell="youtube"]');
  if (lat) lat.innerHTML = fmtLatency(c.latencyMs);
  if (st) st.innerHTML = statusPill(c);
  if (gm) gm.innerHTML = servicePill(c, 'gemini');
  if (yt) yt.innerHTML = servicePill(c, 'youtube');
  tr.classList.toggle('is-connected', id === connectedId());
}

function renderConnectBar() {
  const bar = $('#connect-bar');
  const clearTimer = () => { if (state.uptimeTimer) { clearInterval(state.uptimeTimer); state.uptimeTimer = null; } };
  if (!state.session.connected) {
    bar.classList.add('hidden');
    clearTimer();
    return;
  }
  bar.classList.remove('hidden');
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - (state.session.since || Date.now())) / 1000));
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    let meta = 'زمان: ' + pad(Math.floor(secs / 3600)) + ':' + pad(Math.floor((secs % 3600) / 60)) + ':' + pad(secs % 60);
    if (state.session.exitIp) meta += '  |  آی‌پی خروجی: ' + state.session.exitIp;
    if (state.session.latencyMs != null) meta += '  |  ' + state.session.latencyMs + ' ms';
    if (state.session.httpPort) meta += '  |  پروکسی سیستمی 127.0.0.1:' + state.session.httpPort + '  |  SOCKS5 127.0.0.1:' + state.session.socksPort;
    $('#conn-name').textContent = (state.session.config && state.session.config.name) || '—';
    $('#conn-meta').textContent = meta;
  };
  tick();
  clearTimer();
  state.uptimeTimer = setInterval(tick, 1000);
}

function renderSources() {
  $('#sources-list').innerHTML = state.sources
    .map((s) =>
      '<div class="source-item">' +
      '<input type="checkbox" data-source-toggle="' + esc(s.url) + '"' + (s.enabled !== false ? ' checked' : '') + ' title="فعال / غیرفعال">' +
      '<div class="s-body"><span class="s-name">' + esc(s.name) + '</span><span class="s-url" title="' + esc(s.url) + '">' + esc(s.url) + '</span></div>' +
      (s.protocol && s.protocol !== 'all' ? '<span class="proto-tag">' + esc(String(s.protocol).toUpperCase()) + '</span>' : '') +
      '<button class="icon-btn" data-source-remove="' + esc(s.url) + '" title="حذف منبع">' + ICONS.trash + '</button>' +
      '</div>'
    )
    .join('');
}

function renderCustom() {
  $('#custom-count').textContent = String(state.custom.length);
  $('#custom-list').innerHTML = state.custom.length
    ? state.custom
        .map((c, i) =>
          '<div class="source-item">' +
          '<div class="s-body"><span class="s-name">' + esc(c.name || 'کانفیگ دستی') + '</span><span class="s-url" title="' + esc(c.raw) + '">' + esc(String(c.raw).slice(0, 90)) + '</span></div>' +
          '<button class="icon-btn" data-custom-remove="' + i + '" title="حذف">' + ICONS.trash + '</button>' +
          '</div>'
        )
        .join('')
    : '<p class="hint">هنوز لیست دستی وارد نشده.</p>';
}

function renderSettings() {
  const s = state.settings || {};
  $('#xray-path').value = s.xrayPath || '';
  $('#set-concurrency').value = String(s.concurrency || 6);
  $('#set-timeout').value = String(s.timeoutMs || 12000);
  $('#set-autotest').checked = !!s.autoTest;
  $('#set-autoblacklist').checked = s.autoBlacklist !== false;
  $('#set-blacklist-hours').value = String(s.blacklistHours == null ? 24 : s.blacklistHours);
  $('#set-skip-unsupported').checked = s.skipUnsupported !== false;
  $('#chk-remove-offline').checked = s.removeOffline !== false;
  $('#set-telegram-reader').checked = !s.telegramNoReader;
  $('#blacklist-count').textContent = state.blacklist.length + ' کانفیگ در لیست سیاه';
}

function renderToolbarState() {
  $('#btn-collect').innerHTML = ICONS.download + '<span>' + (state.collecting ? 'در حال جمع‌آوری…' : 'جمع‌آوری کانفیگ‌ها') + '</span>';
  $('#btn-test').innerHTML = ICONS.play + '<span>' + (state.testing ? 'در حال تست…' : state.selectedId ? 'تست انتخاب‌شده' : 'تست همه') + '</span>';
  $('#btn-connect').innerHTML = ICONS.plug + '<span>اتصال به انتخاب‌شده</span>';
  $('#btn-export').innerHTML = ICONS.download + '<span>برون‌ریزی سالم‌ها</span>';
  $('#btn-copy').innerHTML = ICONS.copy + '<span>کپی سالم‌ها</span>';
  $('#btn-collect').disabled = state.collecting;
  $('#btn-test').disabled = state.testing;
  $('#btn-connect').classList.toggle('hidden', !state.selectedId);
  $('#btn-connect').disabled = !state.selectedId;
  $('#btn-stop').classList.toggle('hidden', !state.testing);
}

function renderXrayChip() {
  const chip = $('#xray-chip');
  chip.dataset.state = state.xrayAvailable ? 'ok' : 'bad';
  chip.textContent = state.xrayAvailable ? 'هسته Xray آماده' : 'Xray نصب نیست — دانلود کنید';
  chip.style.cursor = state.xrayAvailable ? 'default' : 'pointer';
  chip.title = state.xrayAvailable ? '' : 'برای نصب Xray اینجا کلیک کنید (تنظیمات)';
  $('#xray-banner').classList.toggle('hidden', state.xrayAvailable);
}

function renderAll() {
  renderStats();
  renderFilters();
  renderTable();
  renderSources();
  renderCustom();
  renderSettings();
  renderConnectBar();
  renderToolbarState();
  renderXrayChip();
  scheduleCacheSave();
}

function mergeConfigs(list) {
  for (const src of list || []) {
    if (!src || !src.id) continue;
    const old = state.configs.get(src.id) || {};
    state.configs.set(src.id, {
      id: src.id,
      raw: src.raw,
      name: src.name,
      protocol: src.protocol,
      address: src.address,
      port: src.port,
      network: src.network,
      security: src.security,
      origin: src.origin,
      supported: src.supported !== false,
      reason: src.reason || old.reason || '',
      status: src.status || old.status || null,
      gemini: src.gemini || old.gemini || null,
      youtube: src.youtube != null ? src.youtube : (old.youtube != null ? old.youtube : null),
      latencyMs: src.latencyMs != null ? src.latencyMs : old.latencyMs != null ? old.latencyMs : null,
      note: src.note || old.note || '',
      exitIp: src.exitIp || old.exitIp || '',
      httpStatus: src.httpStatus != null ? src.httpStatus : null
    });
  }
}

function scheduleCacheSave() {
  if (state.cacheTimer) clearTimeout(state.cacheTimer);
  state.cacheTimer = setTimeout(() => {
    const payload = Array.from(state.configs.values()).map((c) => ({
      id: c.id, raw: c.raw, name: c.name, protocol: c.protocol, address: c.address, port: c.port,
      network: c.network, security: c.security, origin: c.origin, supported: c.supported, reason: c.reason,
      status: c.status, gemini: c.gemini, youtube: c.youtube, latencyMs: c.latencyMs, note: c.note, exitIp: c.exitIp
    }));
    call(api.cache.save({ configs: payload }));
  }, 1500);
}

function showProgress(text, percent) {
  $('#progress').classList.remove('hidden');
  $('#progress-text').textContent = text;
  $('#progress-bar').style.width = (percent == null ? 8 : Math.max(4, Math.min(100, percent))) + '%';
}

function hideProgress() {
  $('#progress').classList.add('hidden');
  $('#progress-bar').style.width = '0%';
}

async function collectNow() {
  if (state.collecting) return;
  state.collecting = true;
  renderToolbarState();
  showProgress('شروع جمع‌آوری…', 2);
  try {
    const data = await call(api.collect());
    mergeConfigs(data.configs);
    const failNote = data.errors ? ' (' + data.errors + ' منبع ناموفق)' : '';
    const blockedNote = data.blocked ? ' — ' + data.blocked + ' کانفیگ در لیست سیاه بود' : '';
    const skippedNote = data.skippedUnsupported ? ' — ' + data.skippedUnsupported + ' کانفیگ پشتیبانی‌نشده نادیده گرفته شد' : '';
    toast('جمع‌آوری شد: ' + data.configs.length + ' کانفیگ تازه' + failNote + blockedNote + skippedNote, data.errors ? 'info' : 'ok');
    if (state.settings.autoTest && data.configs.length) {
      renderAll();
      runTests(Array.from(state.configs.values()));
    }
  } catch (e) {
    toast('خطا در جمع‌آوری: ' + errText(e), 'err');
  } finally {
    state.collecting = false;
    hideProgress();
    renderAll();
  }
}

async function runTests(targetList) {
  if (state.testing) return;
  const source = targetList && targetList.length ? targetList : Array.from(state.configs.values());
  const list = source.filter((c) => c && c.supported !== false);
  if (!list.length) {
    const total = source.length;
    const unsupported = source.filter((c) => c && c.supported === false);
    if (unsupported.length > 0 && unsupported.length === total) {
      toast('هیچ‌کدام از ' + total + ' کانفیگ لیست قابل تست نیستند — پروتکل‌شان پشتیبانی نمی‌شود (مثل HY2/Hysteria2)', 'err');
      return;
    }
    return toast('کانفیگ قابل تستی وجود ندارد', 'err');
  }
  if (!state.xrayAvailable) {
    toast('ابتدا هسته Xray را دانلود کنید (تنظیمات)', 'err');
    $('.tab[data-tab="settings"]').click();
    return;
  }
  state.testing = true;
  state.testTotal = list.length;
  state.testDone = 0;
  renderToolbarState();
  showProgress('آماده‌سازی تست — 0 از ' + state.testTotal, 2);
  let summary = null;
  try {
    summary = await call(api.runTests(list.map((c) => ({ id: c.id, raw: c.raw, origin: c.origin }))));
    toast(
      'تست تمام شد — آنلاین: ' + summary.online + ' | جمنای باز: ' + summary.geminiOpen +
      ' | یوتیوب باز: ' + summary.youtubeOpen + ' | محدود/بسته: ' + (summary.geminiCountry + summary.geminiBlocked) + ' | آفلاین: ' + summary.offline,
      summary.geminiOpen + summary.youtubeOpen > 0 ? 'ok' : 'info'
    );
  } catch (e) {
    toast('خطا در تست: ' + errText(e), 'err');
  }
  state.testing = false;
  hideProgress();
  flushPending();
  const isFullRun = !(targetList && targetList.length);
  if (isFullRun) {
    const g = unwantedGroups();
    const removeIds = [...new Set([...(summary ? summary.offlineIds || [] : []), ...g.unsupported, ...g.untested, ...g.offline])];
    if (state.settings.removeOffline !== false && removeIds.length > 0) {
      const onlineCount = state.configs.size - removeIds.length;
      const parts = [];
      if (g.offline.length) parts.push(g.offline.length + ' وصل‌نشده');
      if (g.unsupported.length) parts.push(g.unsupported.length + ' پشتیبانی‌نشده');
      if (g.untested.length) parts.push(g.untested.length + ' تست‌نشده');
      const msg = removeIds.length + ' کانفیگ قابل استفاده نبود (' + parts.join(' + ') + ').\nحذف شوند؟ ' + onlineCount + ' کانفیگ آنلاین می‌ماند.';
      if (window.confirm(msg)) removeConfigs(removeIds);
    }
  } else if (summary && state.settings.removeOffline !== false && summary.offlineIds && summary.offlineIds.length > 0) {
    const ids = summary.offlineIds;
    if (window.confirm(ids.length + ' کانفیگ وصل نشد.\nاز لیست حذف شوند؟ (به لیست سیاه هم می‌روند تا در جمع‌آوری بعدی نیایند)')) {
      removeConfigs(ids);
    }
  }
  renderAll();
}

function unwantedGroups() {
  const offline = [];
  const unsupported = [];
  const untested = [];
  for (const c of state.configs.values()) {
    if (c.supported === false) unsupported.push(c.id);
    else if (c.status === 'offline') offline.push(c.id);
    else if (!c.status || c.status === 'pending') untested.push(c.id);
  }
  return { offline, unsupported, untested };
}

function removeConfigs(ids) {
  const set = new Set(ids || []);
  for (const id of set) state.configs.delete(id);
  if (set.has(state.selectedId)) state.selectedId = null;
  state.renderCount = MAX_VISIBLE;
  renderAll();
  return set.size;
}

async function cleanupUnwanted() {
  const g = unwantedGroups();
  const total = g.offline.length + g.unsupported.length + g.untested.length;
  if (total === 0) {
    toast('چیزی برای پاکسازی نیست — همه کانفیگ‌ها آنلاین هستند', 'ok');
    return;
  }
  const parts = [];
  if (g.offline.length) parts.push(g.offline.length + ' آفلاین');
  if (g.unsupported.length) parts.push(g.unsupported.length + ' پشتیبانی‌نشده');
  if (g.untested.length) parts.push(g.untested.length + ' تست‌نشده');
  const online = state.configs.size - total;
  const msg = total + ' کانفیگ حذف شوند؟ (' + parts.join(' + ') + ')\nفقط ' + online + ' کانفیگ آنلاین می‌ماند.';
  if (!window.confirm(msg)) return;
  const removed = removeConfigs([...g.offline, ...g.unsupported, ...g.untested]);
  toast(removed + ' کانفیگ پاک شد — ' + online + ' کانفیگ آنلاین باقی ماند', 'info');
}

function flushPending() {
  if (state.pending.size === 0) return;
  let needSort = false;
  for (const [id, patch] of state.pending) {
    const c = state.configs.get(id);
    if (c) Object.assign(c, patch);
    patchRow(id);
    if (state.filter !== 'all' || state.query) needSort = true;
  }
  state.pending.clear();
  renderStats();
  renderFilters();
}

async function connectTo(id) {
  const c = state.configs.get(id);
  if (!c) return;
  if (c.supported === false) return toast('این کانفیگ قابل اتصال نیست: ' + (c.reason || ''), 'err');
  if (connectedId() === id) return disconnectNow();
  state.selectedId = id;
  showProgress('در حال اتصال…', 40);
  try {
    const st = await call(api.session.connect(c.raw));
    state.session = st;
    setRowConnectedClass(id, true);
    toast('وصل شد — ' + (st.config ? st.config.name : ''), 'ok');
    renderToolbarState();
  } catch (e) {
    state.session = { connected: false };
    renderConnectBar();
    toast('اتصال ناموفق: ' + errText(e), 'err');
  } finally {
    hideProgress();
    renderTable(false);
  }
}

async function disconnectNow() {
  showProgress('قطع اتصال…', 40);
  try {
    await call(api.session.disconnect());
    state.session = { connected: false };
    toast('اتصال قطع شد', 'info');
  } catch (e) {
    toast('خطا در قطع اتصال: ' + errText(e), 'err');
  } finally {
    hideProgress();
    renderAll();
  }
}

function goodConfigs() {
  const both = Array.from(state.configs.values()).filter((c) => c.gemini === 'open' || c.youtube === 'open');
  if (both.length) return both;
  return Array.from(state.configs.values()).filter((c) => c.status === 'online');
}

async function exportGood() {
  const list = goodConfigs();
  if (!list.length) return toast('هیچ کانفیگ سالمی برای خروجی نیست', 'err');
  try {
    const file = await call(api.saveFile({ content: list.map((c) => c.raw).join('\n'), defaultName: 'vcc-working-configs.txt' }));
    if (file) toast('ذخیره شد: ' + file, 'ok');
  } catch (e) { toast('خطا در ذخیره: ' + errText(e), 'err'); }
}

async function copyGood() {
  const list = goodConfigs();
  if (!list.length) return toast('هیچ کانفیگ سالمی برای کپی نیست', 'err');
  try {
    await navigator.clipboard.writeText(list.map((c) => c.raw).join('\n'));
    toast(list.length + ' لینک کپی شد', 'ok');
  } catch (_) {
    toast('دسترسی به کلیپ‌بورد ممکن نشد', 'err');
  }
}

async function addSource(e) {
  e.preventDefault();
  const url = $('#new-source-url').value.trim();
  if (!url) return;
  try {
    state.sources = await call(api.addSource({ url, name: $('#new-source-name').value.trim(), protocol: $('#new-source-proto').value }));
    $('#new-source-url').value = '';
    $('#new-source-name').value = '';
    renderSources();
    toast('منبع اضافه شد', 'ok');
  } catch (err) {
    toast(errText(err), 'err');
  }
}

async function removeSource(url) {
  const item = state.sources.find((s) => s.url === url);
  if (item && !window.confirm('منبع «' + (item.name || url) + '» حذف شود؟')) return;
  state.sources = await call(api.removeSource(url));
  renderSources();
}

async function toggleSource(url, enabled) {
  try {
    state.sources = await call(api.toggleSource({ url, enabled }));
    renderSources();
  } catch (e) { toast(errText(e), 'err'); }
}

async function importText() {
  const text = $('#import-text').value;
  if (!text.trim()) return toast('متنی وارد نشده', 'err');
  try {
    const list = await call(api.importText(text));
    mergeConfigs(list);
    $('#import-text').value = '';
    state.custom = await call(api.customList());
    renderAll();
    toast(list.length + ' کانفیگ به لیست اضافه شد', 'ok');
  } catch (e) { toast('خطا در پردازش متن: ' + errText(e), 'err'); }
}

async function removeCustom(index) {
  state.custom = await call(api.customRemove(index));
  renderCustom();
}

function readSettingsForm() {
  return {
    xrayPath: state.settings.xrayPath || '',
    xrayDownloadUrl: state.settings.xrayDownloadUrl || '',
    concurrency: Number($('#set-concurrency').value),
    timeoutMs: Number($('#set-timeout').value),
    autoTest: $('#set-autotest').checked,
    autoBlacklist: $('#set-autoblacklist').checked,
    blacklistHours: Number($('#set-blacklist-hours').value),
    skipUnsupported: $('#set-skip-unsupported').checked,
    removeOffline: $('#chk-remove-offline').checked,
    telegramNoReader: !$('#set-telegram-reader').checked
  };
}

async function saveSettings() {
  try {
    state.settings = await call(api.settings.set(readSettingsForm()));
    await refreshXrayStatus();
    renderAll();
    toast('تنظیمات ذخیره شد', 'ok');
  } catch (e) { toast(errText(e), 'err'); }
}

async function pickXrayPath() {
  try {
    const settings = await call(api.xray.selectPath());
    if (settings) {
      state.settings = settings;
      await refreshXrayStatus();
      renderAll();
      toast('مسیر Xray ذخیره شد', 'ok');
    }
  } catch (e) { toast(errText(e), 'err'); }
}

async function downloadXray() {
  const note = $('#xray-dl-note');
  note.textContent = 'در حال دانلود…';
  $('#btn-xray-download').disabled = true;
  try {
    const p = await call(api.xray.ensure());
    note.textContent = '';
    await refreshXrayStatus();
    renderAll();
    toast('Xray آماده است: ' + p, 'ok');
  } catch (e) {
    note.textContent = '';
    toast('دانلود ناموفق: ' + errText(e) + ' — فایل را دستی از GitHub بگیرید', 'err');
  } finally {
    $('#btn-xray-download').disabled = false;
  }
}

async function refreshXrayStatus() {
  state.settings = await call(api.settings.get());
  const st = await call(api.xray.status());
  state.xrayAvailable = !!st.available;
}

async function refreshBlacklist() {
  try {
    state.blacklist = await call(api.blacklist.list());
    renderSettings();
  } catch (_) { }
}

function bindEvents() {
  $('#btn-collect').addEventListener('click', collectNow);
  $('#btn-test').addEventListener('click', () => {
    runTests(state.selectedId ? [state.configs.get(state.selectedId)].filter(Boolean) : null);
  });
  $('#btn-stop').addEventListener('click', async () => {
    await call(api.stopTests());
    toast('تست متوقف شد', 'info');
  });
  $('#btn-connect').addEventListener('click', () => state.selectedId && connectTo(state.selectedId));
  $('#conn-disconnect').addEventListener('click', disconnectNow);
  $('#btn-export').addEventListener('click', exportGood);
  $('#btn-copy').addEventListener('click', copyGood);
  $('#btn-cleanup').addEventListener('click', cleanupUnwanted);

  $('#chk-remove-offline').addEventListener('change', async (e) => {
    state.settings.removeOffline = e.target.checked;
    try { state.settings = await call(api.settings.set(readSettingsForm())); } catch (_) { }
  });

  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => { state.renderCount = MAX_VISIBLE; renderTable(); }, 220);
  });

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    state.renderCount = MAX_VISIBLE;
    renderStats();
    renderFilters();
    renderTable();
  });

  $('#stats').addEventListener('click', (e) => {
    const card = e.target.closest('[data-stat-filter]');
    if (!card) return;
    const target = card.dataset.statFilter;
    state.filter = state.filter === target ? 'all' : target;
    state.renderCount = MAX_VISIBLE;
    renderStats();
    renderFilters();
    renderTable();
    const label = card.querySelector('.lbl');
    if (label && state.filter !== 'all') toast('فیلتر: ' + label.textContent.trim(), 'info');
  });

  $('.table-wrap').addEventListener('scroll', (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 240) return;
    const list = visibleConfigs();
    if (state.renderCount >= list.length) return;
    state.renderCount += PAGE_STEP;
    renderTable();
  });

  $('#tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    const actBtn = e.target.closest('button[data-act]');
    if (actBtn) {
      const act = actBtn.dataset.act;
      if (act === 'test') runTests([state.configs.get(id)].filter(Boolean));
      else if (act === 'connect') connectTo(id);
      else if (act === 'disconnect') disconnectNow();
      else if (act === 'copy') {
        const c = state.configs.get(id);
        if (c) navigator.clipboard.writeText(c.raw).then(() => toast('لینک کپی شد', 'ok'), () => toast('کپی ممکن نشد', 'err'));
      }
      return;
    }
    state.selectedId = state.selectedId === id ? null : id;
    $$('#tbody tr').forEach((row) => row.classList.toggle('selected', row.dataset.id === state.selectedId));
    renderToolbarState();
  });

  $('#add-source-form').addEventListener('submit', addSource);
  $('#btn-reset-sources').addEventListener('click', async () => {
    if (!window.confirm('منابع به حالت پیش‌فرض بازگردانده شوند؟')) return;
    state.sources = await call(api.resetSources());
    renderSources();
    toast('منابع بازگردانده شد', 'info');
  });
  $('#sources-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-source-remove]');
    if (btn) removeSource(btn.dataset.sourceRemove);
  });
  $('#sources-list').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-source-toggle]');
    if (cb) toggleSource(cb.dataset.sourceToggle, cb.checked);
  });

  $('#btn-import').addEventListener('click', importText);
  $('#btn-import-clear').addEventListener('click', () => { $('#import-text').value = ''; });
  $('#custom-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-custom-remove]');
    if (btn) removeCustom(Number(btn.dataset.customRemove));
  });

  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-xray-select').addEventListener('click', pickXrayPath);
  $('#btn-xray-download').addEventListener('click', downloadXray);
  $('#banner-xray-download').addEventListener('click', downloadXray);
  $('#banner-xray-select').addEventListener('click', pickXrayPath);
  $('#xray-chip').addEventListener('click', () => {
    if (state.xrayAvailable) return;
    $('.tab[data-tab="settings"]').click();
    $('#btn-xray-download').focus();
  });
  $('#btn-blacklist-clear').addEventListener('click', async () => {
    if (!window.confirm('لیست سیاه خالی شود؟ کانفیگ‌های حذف‌شده دوباره در جمع‌آوری می‌آیند.')) return;
    state.blacklist = await call(api.blacklist.clear());
    renderSettings();
    toast('لیست سیاه پاک شد', 'info');
  });

  $$('#tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    ['sources', 'import', 'settings'].forEach((name) => $('#tab-' + name).classList.toggle('hidden', name !== tab.dataset.tab));
  }));

  $('#win-min').innerHTML = ICONS.minus;
  $('#win-max').innerHTML = ICONS.square;
  $('#win-close').innerHTML = ICONS.x;
  $('#logo-icon').innerHTML = ICONS.logo;
  $('#empty-icon').innerHTML = ICONS.globe;
  $('#win-min').addEventListener('click', () => api.window.minimize());
  $('#win-max').addEventListener('click', () => api.window.maximize());
  $('#win-close').addEventListener('click', () => api.window.close());

  api.onEvent((channel, payload) => {
    const p = payload || {};
    if (channel === 'collect:progress') {
      if (p.state === 'fetching') showProgress('دانلود منبع: ' + (p.name || p.url), 6);
      else if (p.state === 'done') {
        const via = p.via === 'reader' ? ' (از طریق سرویس خواندن)' : '';
        showProgress('منبع «' + (p.name || '') + '» — ' + (p.count || 0) + ' کانفیگ' + via, p.total ? (p.done / p.total) * 100 : 40);
      }
      else if (p.state === 'error') showProgress('خطا در ' + (p.name || p.url) + ': ' + (p.error || ''), 20);
      else if (p.state === 'progress' && p.total) showProgress('جمع‌آوری — ' + p.done + ' از ' + p.total + ' منبع', (p.done / p.total) * 100);
    } else if (channel === 'test:update') {
      state.pending.set(p.id, p);
      if (p.status !== 'testing') state.testDone += 1;
      showProgress('تست — ' + Math.min(state.testDone, state.testTotal) + ' از ' + state.testTotal, (state.testDone / Math.max(1, state.testTotal)) * 100);
      if (state.flushTimer) return;
      if (state.pending.size >= 20) flushPending();
      else state.flushTimer = setTimeout(() => { state.flushTimer = null; flushPending(); }, 140);
    } else if (channel === 'test:blacklist') {
      refreshBlacklist();
    } else if (channel === 'xray:progress') {
      const note = $('#xray-dl-note');
      if (p.phase === 'version') note.textContent = 'دریافت آخرین نسخه…';
      else if (p.phase === 'download') note.textContent = 'دانلود… ' + (p.percent || 0) + '%';
      else if (p.phase === 'extract') note.textContent = 'استخراج…';
      else if (p.phase === 'retry') note.textContent = 'تلاش با آینه دیگر…';
      else if (p.phase === 'done') note.textContent = '';
    } else if (channel === 'session:changed') {
      state.session = p && p.connected ? p : { connected: false };
      renderConnectBar();
      renderTable(false);
    } else if (channel === 'session:recovered') {
      toast('یک نشست قطع‌شده بازیابی شد و پروکسی سیستمی به حالت قبل برگشت', 'info');
    }
  });
}

async function init() {
  bindEvents();
  try {
    state.sources = await call(api.listSources());
    state.custom = await call(api.customList());
    state.blacklist = await call(api.blacklist.list());
    await refreshXrayStatus();

    const cache = await call(api.cache.get());
    if (cache && Array.isArray(cache.configs) && cache.configs.length) {
      mergeConfigs(cache.configs);
    }
    if (state.custom.length) {
      const parsed = await call(api.parseConfigs(state.custom));
      mergeConfigs(parsed);
    }
    const restored = Array.from(state.configs.values()).filter((c) => c.gemini || c.youtube).length;
    if (restored) toast(restored + ' نتیجه تست از نشست قبل بازیابی شد', 'info');
  } catch (e) {
    toast('خطا در بارگذاری اولیه: ' + errText(e), 'err');
  }
  try {
    const st = await call(api.session.status());
    state.session = st && st.connected ? st : { connected: false };
  } catch (_) { }
  renderAll();
}

init();
