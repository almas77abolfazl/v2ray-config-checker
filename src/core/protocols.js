'use strict';
const crypto = require('crypto');

const SUPPORTED = new Set(['vless', 'vmess', 'trojan', 'ss']);

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

function tryB64(s) {
  let t = String(s || '').replace(/\s+/g, '');
  if (!t) return null;
  if (!/^[A-Za-z0-9+/_\-]+={0,2}$/.test(t)) return null;
  const b64 = t.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const dec = Buffer.from(padded, 'base64').toString('utf8');
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(dec)) return null;
    if (/[\uFFFD]/.test(dec.slice(0, 8))) return null;
    return dec;
  } catch (_) { return null; }
}

function hashOf(key) {
  return crypto.createHash('md5').update(String(key)).digest('hex').slice(0, 12);
}

function splitLine(line) {
  const i = line.indexOf('#');
  if (i >= 0) return { base: line.slice(0, i), name: safeDecode(line.slice(i + 1)) };
  return { base: line, name: '' };
}

function streamSettings(network, security, e, info) {
  const net = network || 'tcp';
  const ss = { network: net, security: security || 'none' };
  if (security === 'tls' || security === 'xtls') {
    ss.tlsSettings = { serverName: e.sni || e.host || info.address, allowInsecure: false };
    if (e.fp) ss.tlsSettings.fingerprint = e.fp;
    if (e.alpn) ss.tlsSettings.alpn = String(e.alpn).split(/[\s,|]+/).filter(Boolean);
  } else if (security === 'reality') {
    if (!e.pbk) return null;
    ss.realitySettings = {
      serverName: e.sni || e.host || info.address,
      fingerprint: e.fp || 'chrome',
      publicKey: e.pbk,
      shortId: e.sid || '',
      spiderX: e.spx || '/'
    };
  } else if (security && security !== 'none') {
    return null;
  }
  switch (net) {
    case 'ws':
      ss.wsSettings = { path: e.path || '/', headers: e.host ? { Host: e.host } : {} };
      break;
    case 'httpupgrade':
      ss.httpupgradeSettings = { path: e.path || '/', host: e.host || '' };
      break;
    case 'xhttp':
      ss.xhttpSettings = { path: e.path || '/', host: e.host || '', mode: e.mode || 'auto' };
      break;
    case 'grpc':
      ss.grpcSettings = { serviceName: e.serviceName || (e.path && e.path !== '/' ? e.path.replace(/^\//, '') : ''), multiMode: false };
      break;
    case 'h2':
    case 'http':
      ss.httpSettings = { path: e.path || '/', host: e.host ? [e.host] : [] };
      break;
    case 'quic':
      ss.quicSettings = { security: e.quicSecurity || 'none', key: e.key || '', header: { type: e.headerType || 'none' } };
      break;
    case 'kcp':
      ss.kcpSettings = { mtu: 1350, tti: 50, uplinkCapacity: 12, downlinkCapacity: 100, congestion: false, seed: e.seed || '', header: { type: e.headerType || 'none' } };
      break;
    case 'tcp':
    default:
      ss.network = 'tcp';
      if (e.headerType === 'http') {
        ss.tcpSettings = { header: { type: 'http', request: { path: [e.path || '/'], headers: { Host: [e.host || info.address] } } } };
      } else {
        ss.tcpSettings = { header: { type: 'none' } };
      }
  }
  return ss;
}

function assemble(ctx) {
  const info = ctx.info;
  const cfg = {
    id: hashOf(String(ctx.uri).split('#')[0].trim()),
    raw: ctx.uri,
    protocol: info.protocol,
    name: (ctx.name || '').trim() || `${String(info.protocol).toUpperCase()} · ${info.address}:${info.port}`,
    address: info.address,
    port: info.port,
    uuid: info.uuid || '',
    password: info.password || '',
    network: ctx.network,
    security: ctx.security,
    flow: ctx.flow || '',
    origin: (ctx.src && ctx.src.name) || 'لیست دستی',
    supported: false,
    reason: 'پروتکل پشتیبانی نشده',
    outbound: null
  };
  if (!SUPPORTED.has(info.protocol)) return cfg;
  const ss = streamSettings(ctx.network, ctx.security, ctx.extra || {}, info);
  if (!ss) {
    cfg.reason = 'تنظیمات شبکه/امنیت پشتیبانی نمی‌شود';
    return cfg;
  }
  let outbound = null;
  if (info.protocol === 'vless') {
    const user = { id: info.uuid, encryption: 'none' };
    if (ctx.flow) user.flow = ctx.flow;
    outbound = { tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: info.address, port: info.port, users: [user] }] }, streamSettings: ss };
  } else if (info.protocol === 'vmess') {
    outbound = {
      tag: 'proxy', protocol: 'vmess',
      settings: { vnext: [{ address: info.address, port: info.port, users: [{ id: info.uuid, alterId: info.alterId, security: info.security || 'auto' }] }] },
      streamSettings: ss
    };
  } else if (info.protocol === 'trojan') {
    outbound = { tag: 'proxy', protocol: 'trojan', settings: { servers: [{ address: info.address, port: info.port, password: info.password }] }, streamSettings: ss };
  } else if (info.protocol === 'ss') {
    outbound = { tag: 'proxy', protocol: 'shadowsocks', settings: { servers: [{ address: info.address, port: info.port, method: info.method, password: info.password }] } };
  }
  cfg.supported = !!outbound;
  cfg.reason = outbound ? '' : 'ساخت اتصال ممکن نشد';
  cfg.outbound = outbound;
  return cfg;
}

function unsupportedCfg(uri, protocol, reason, src) {
  return {
    id: hashOf(String(uri).split('#')[0].trim()),
    raw: uri,
    protocol: protocol || 'unknown',
    name: splitLine(uri).name || 'کانفیگ نامعتبر',
    address: '',
    port: 0,
    uuid: '',
    password: '',
    network: '',
    security: '',
    flow: '',
    origin: (src && src.name) || 'لیست دستی',
    supported: false,
    reason: reason || 'پشتیبانی نمی‌شود',
    outbound: null
  };
}

function parseVless(uri, src) {
  const u = new URL(uri);
  const q = u.searchParams;
  const info = {
    protocol: 'vless',
    uuid: safeDecode(u.username || ''),
    address: String(u.hostname || '').replace(/^\[|\]$/g, ''),
    port: Number(u.port || 443),
    password: ''
  };
  return assemble({
    uri, src, info,
    name: splitLine(uri).name,
    network: (q.get('type') || 'tcp').toLowerCase(),
    security: (q.get('security') || 'none').toLowerCase(),
    flow: q.get('flow') || '',
    extra: {
      path: q.get('path') || '/',
      host: q.get('host') || '',
      sni: q.get('sni') || '',
      fp: q.get('fp') || '',
      pbk: q.get('pbk') || '',
      sid: q.get('sid') || '',
      spx: q.get('spx') || '',
      alpn: q.get('alpn') || '',
      serviceName: q.get('serviceName') || '',
      headerType: q.get('headerType') || '',
      mode: q.get('mode') || ''
    }
  });
}

function parseTrojan(uri, src) {
  const u = new URL(uri);
  const q = u.searchParams;
  const net = (q.get('type') || 'tcp').toLowerCase();
  const security = (q.get('security') || 'tls').toLowerCase();
  const info = {
    protocol: 'trojan',
    uuid: '',
    address: String(u.hostname || '').replace(/^\[|\]$/g, ''),
    port: Number(u.port || 443),
    password: safeDecode(u.username || '')
  };
  return assemble({
    uri, src, info,
    name: splitLine(uri).name,
    network: net,
    security,
    flow: '',
    extra: {
      path: q.get('path') || '/',
      host: q.get('host') || '',
      sni: q.get('sni') || '',
      fp: q.get('fp') || '',
      alpn: q.get('alpn') || '',
      serviceName: q.get('serviceName') || '',
      headerType: q.get('headerType') || ''
    }
  });
}

function parseVmess(uri, src) {
  const body = uri.slice('vmess://'.length).replace(/#.*$/, '');
  const json = tryB64(body);
  if (!json) return unsupportedCfg(uri, 'vmess', 'لینک vmess نامعتبر است', src);
  let j;
  try { j = JSON.parse(json); } catch (_) { return unsupportedCfg(uri, 'vmess', 'JSON نامعتبر', src); }
  const info = {
    protocol: 'vmess',
    uuid: String(j.id || ''),
    address: String(j.add || j.address || ''),
    port: Number(j.port || 0),
    password: '',
    alterId: Number(j.aid || 0),
    security: String(j.scy || 'auto')
  };
  return assemble({
    uri, src, info,
    name: safeDecode(j.ps || '') || splitLine(uri).name,
    network: (j.net || 'tcp').toLowerCase(),
    security: String(j.tls || '').toLowerCase() === 'tls' ? 'tls' : 'none',
    flow: '',
    extra: {
      path: j.path || '/',
      host: j.host || '',
      sni: j.sni || j.host || '',
      fp: j.fp || '',
      alpn: j.alpn || '',
      headerType: j.type || '',
      seed: j.seed || '',
      quicSecurity: j.quicSecurity || 'none'
    }
  });
}

function rsplitHostPort(s) {
  const value = String(s || '').trim();
  const i = value.lastIndexOf(':');
  if (i < 0) return { address: value, port: 443 };
  return { address: value.slice(0, i).replace(/^\[|\]$/g, ''), port: Number(value.slice(i + 1)) || 443 };
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function parseSS(uri, src) {
  const body = uri.slice('ss://'.length);
  let name = splitLine(body).name;
  const main = splitLine(body).base;
  const hostPortOf = (s) => rsplitHostPort(s.split('?')[0].split('#')[0]);
  const at = main.lastIndexOf('@');
  if (at >= 0) {
    const credRaw = main.slice(0, at);
    const cred = tryB64(credRaw) || credRaw;
    const sep = cred.indexOf(':');
    if (sep < 0) {
      if (UUID_RE.test(credRaw) && main.slice(at + 1).includes('?')) {
        return parseVless(uri.replace(/^ss:\/\//i, 'vless://'), src);
      }
      return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
    }
    const method = cred.slice(0, sep);
    const password = cred.slice(sep + 1);
    const hp = hostPortOf(main.slice(at + 1));
    if (!method || !hp.address) return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
    const info = { protocol: 'ss', uuid: '', address: hp.address, port: hp.port || 443, password, method };
    const cfg = assemble({ uri, src, info, name, network: 'tcp', security: 'none', flow: '', extra: {} });
    if (cfg.supported && cfg.outbound) {
      cfg.outbound.settings.servers[0].uot = false;
      cfg.outbound.settings.servers[0].address = info.address;
    }
    return cfg;
  }
  const dec = tryB64(main);
  if (!dec) return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
  const at2 = dec.lastIndexOf('@');
  if (at2 < 0) return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
  const cred = dec.slice(0, at2);
  const sep = cred.indexOf(':');
  if (sep < 0) return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
  const method = cred.slice(0, sep);
  const password = cred.slice(sep + 1);
  if (!name) {
    const hashAt = dec.indexOf('#');
    if (hashAt >= 0) name = safeDecode(dec.slice(hashAt + 1));
  }
  const hp = rsplitHostPort(dec.slice(at2 + 1).split('#')[0]);
  if (!method || !hp.address) return unsupportedCfg(uri, 'ss', 'لینک ss نامعتبر است', src);
  const info = { protocol: 'ss', uuid: '', address: hp.address, port: hp.port || 443, password, method };
  const cfg = assemble({ uri, src, info, name, network: 'tcp', security: 'none', flow: '', extra: {} });
  if (cfg.supported && cfg.outbound) {
    cfg.outbound.settings.servers[0].uot = false;
    cfg.outbound.settings.servers[0].address = info.address;
  }
  return cfg;
}

function parseUri(uri, src) {
  const url = String(uri || '').trim();
  const scheme = (url.split('://', 1)[0] || '').toLowerCase();
  try {
    switch (scheme) {
      case 'vless': return parseVless(url, src);
      case 'vmess': return parseVmess(url, src);
      case 'trojan': return parseTrojan(url, src);
      case 'ss': return parseSS(url, src);
      default: return unsupportedCfg(url, scheme || 'unknown', 'پروتکل پشتیبانی نمی‌شود', src);
    }
  } catch (e) {
    return unsupportedCfg(url, scheme || 'unknown', 'خطای پردازش: ' + (e && e.message ? e.message : e), src);
  }
}

function parseConfigsFromText(text, src) {
  src = src || {};
  const out = [];
  const seen = new Set();
  let content = String(text || '');
  if (!/:\/\//.test(content)) {
    const compact = content.replace(/\s+/g, '');
    const dec = tryB64(compact);
    if (dec && dec.includes('://')) content = dec;
  }
  const add = (line) => {
    const cfg = parseUri(line, src);
    if (!seen.has(cfg.id)) { seen.add(cfg.id); out.push(cfg); }
  };
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (/^[a-zA-Z0-9_+.-]+:\/\//.test(line)) { add(line); continue; }
    const dec = tryB64(line.replace(/\s+/g, ''));
    if (dec && dec.includes('://')) {
      for (const inner of dec.split(/\r?\n/)) {
        const l2 = inner.trim();
        if (l2 && /^[a-zA-Z0-9_+.-]+:\/\//.test(l2)) add(l2);
      }
    }
  }
  return out;
}

module.exports = { parseConfigsFromText, parseUri, tryB64, SUPPORTED };
