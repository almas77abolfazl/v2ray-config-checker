'use strict';
const path = require('path');
const fs = require('fs');
const { parseConfigsFromText, parseUri } = require(path.join(__dirname, '..', 'src', 'core', 'protocols'));
const { classifyGemini, classifyYoutube, curlErrorText } = require(path.join(__dirname, '..', 'src', 'core', 'checker'));
const blacklist = require(path.join(__dirname, '..', 'src', 'core', 'blacklist'));

let failures = 0;
function check(label, cond, extra) {
  if (cond) { console.log('  PASS  ' + label); }
  else { failures += 1; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

const samples = [
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@tamiiiiz.aryan-sport.ir:2095?path=%2F&security=none&encryption=none&host=dr4.aryan-sport.ir&type=httpupgrade#%DA%86%D9%86%D9%84%20%DA%A9%D8%A7%D9%86%D9%81%DB%8C%DA%AF%20%D9%87%D8%A7%DB%8C%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%40JOFAVPN',
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@188.114.98.6:2095?path=%2F&security=none&encryption=none&host=dr2.aryan-sport.ir&type=httpupgrade#%D8%A7%D8%B3%D8%AA%D9%81%D8%A7%D8%AF%D9%87%20%D8%A8%D8%AF%D9%88%D9%86%20%D8%AC%D9%88%DB%8C%D9%86%20%D8%AD%D8%B1%D8%A7%D9%85%20%40JOFAVPN',
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@tamiiiiz.aryan-sport.ir:2095?path=%2F&security=none&encryption=none&host=dr.aryan-sport.ir&type=httpupgrade#%D8%A8%D9%87%20%DA%86%D9%86%D9%84%20%D8%B3%D8%B1%20%D9%86%D8%B2%D9%86%DB%8C%20%D8%B6%D8%B1%D8%B1%20%DA%A9%D8%B1%D8%AF%DB%8C%20%40JOFAVPN'
];

console.log('\n[1] VLESS httpupgrade samples');
const a = parseUri(samples[0], { name: 'test' });
check('protocol is vless', a.protocol === 'vless', a.protocol);
check('address parsed', a.address === 'tamiiiiz.aryan-sport.ir', a.address);
check('port parsed', a.port === 2095, a.port);
check('uuid parsed', a.uuid === '824638d7-b08c-4c23-a842-73708a82f2b5', a.uuid);
check('network httpupgrade', a.network === 'httpupgrade', a.network);
check('security none', a.security === 'none', a.security);
check('name decoded (persian)', /رایگان/.test(a.name), a.name);
check('outbound built', !!a.outbound, a.reason);
const ss = a.outbound.streamSettings;
check('httpupgradeSettings path', ss.httpupgradeSettings && ss.httpupgradeSettings.path === '/', ss);
check('httpupgradeSettings host', ss.httpupgradeSettings && ss.httpupgradeSettings.host === 'dr4.aryan-sport.ir', ss);
check('no undefined breaks JSON', (() => { try { JSON.stringify(a.outbound); return true; } catch (_) { return false; } })());

console.log('\n[2] VLESS reality / ws / grpc');
const reality = parseUri('vless://uuid@example.com:443?security=reality&type=tcp&flow=xtls-rprx-vision&sni=example.com&fp=chrome&pbk=abc123&sid=01#Reality', {});
check('reality outbound', !!reality.outbound, reality.reason);
check('realitySettings.pbk', reality.outbound && reality.outbound.streamSettings.realitySettings.publicKey === 'abc123');
const ws = parseUri('vless://uuid@example.com:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=example.com&alpn=h2,http/1.1#WS', {});
check('ws outbound', !!ws.outbound, ws.reason);
check('ws headers host', ws.outbound.streamSettings.wsSettings.headers.Host === 'cdn.example.com');
check('ws alpn list', JSON.stringify(ws.outbound.streamSettings.tlsSettings.alpn) === '["h2","http/1.1"]', ws.outbound.streamSettings.tlsSettings.alpn);
const grpc = parseUri('vless://uuid@example.com:443?security=tls&type=grpc&serviceName=mysvc#gRPC', {});
check('grpc serviceName', grpc.outbound && grpc.outbound.streamSettings.grpcSettings.serviceName === 'mysvc', JSON.stringify(grpc.outbound && grpc.outbound.streamSettings));
const brokenReality = parseUri('vless://uuid@example.com:443?security=reality&type=tcp&sni=x#bad', {});
check('reality without pbk rejected', brokenReality.supported === false, brokenReality.supported);

console.log('\n[3] VMess / Trojan / Shadowsocks');
const vmess = parseUri('vmess://' + Buffer.from(JSON.stringify({ v: '2', ps: 'VMess Test', add: '1.2.3.4', port: '80', id: 'b831381d-6324-4d53-ad4f-8cda48b30811', aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'cdn.net', path: '/vmes', tls: 'tls' })).toString('base64'), {});
check('vmess parsed', vmess.protocol === 'vmess' && vmess.address === '1.2.3.4' && vmess.port === 80, [vmess.address, vmess.port]);
check('vmess outbound + ws + tls', !!vmess.outbound && vmess.outbound.streamSettings.network === 'ws' && vmess.outbound.streamSettings.security === 'tls', vmess.reason);
check('vmess alterId', vmess.outbound.settings.vnext[0].users[0].alterId === 0);
const trojan = parseUri('trojan://pass123@example.com:443?security=tls&type=ws&path=%2Ftr&host=a.example.com&sni=example.com#Trojan', {});
check('trojan parsed', trojan.protocol === 'trojan' && trojan.password === 'pass123' && !!trojan.outbound, trojan.reason);
check('trojan server settings', trojan.outbound.settings.servers[0].address === 'example.com' && trojan.outbound.settings.servers[0].password === 'pass123');
const ssNew = parseUri('ss://' + Buffer.from('aes-128-gcm:secret@5.6.7.8:8388').toString('base64') + '#SSNode', {});
check('ss (base64 whole) parsed', ssNew.protocol === 'ss' && ssNew.address === '5.6.7.8' && ssNew.port === 8388, [ssNew.address, ssNew.port]);
check('ss outbound method/pass', ssNew.outbound.settings.servers[0].method === 'aes-128-gcm' && ssNew.outbound.settings.servers[0].password === 'secret', JSON.stringify(ssNew.outbound.settings));
const ssInline = parseUri('ss://aes-256-gcm:mypass@9.8.7.6:9443#InlineSS', {});
check('ss (inline) parsed', ssInline.address === '9.8.7.6' && ssInline.port === 9443, [ssInline.address, ssInline.port]);
const ssInner = parseUri('ss://' + Buffer.from('aes-128-gcm:secret@5.6.7.8:8388#NodeName').toString('base64'), {});
check('ss (name inside base64) parsed', ssInner.protocol === 'ss' && ssInner.address === '5.6.7.8' && ssInner.port === 8388, [ssInner.address, ssInner.port, ssInner.reason]);
check('ss inner name kept', ssInner.name === 'NodeName', ssInner.name);
const ssInner2022 = parseUri('ss://' + Buffer.from('2022-blake3-aes-256-gcm:pw@9.9.9.9:9443#X').toString('base64'), {});
check('ss 2022 method parsed', !!ssInner2022.outbound && ssInner2022.outbound.settings.servers[0].method === '2022-blake3-aes-256-gcm', JSON.stringify(ssInner2022.outbound));
const ssUnpadded2022 = parseUri('ss://MjAyMi1ibGFrZTMtY2hhY2hhMjAtcG9seTEzMDU6OVBmUmxJR3ZwTXM4bkQ3czY1Qi8zSXhjY1FHK3A2MzFYOXRDTFp5K0NSST0@161.118.219.5:56927#EPODONIOS', {});
check('ss 2022 (no base64 padding) parsed', ssUnpadded2022.supported && ssUnpadded2022.address === '161.118.219.5' && ssUnpadded2022.port === 56927, [ssUnpadded2022.address, ssUnpadded2022.port, ssUnpadded2022.reason]);
check('ss 2022 method/password extracted', ssUnpadded2022.outbound.settings.servers[0].method === '2022-blake3-chacha20-poly1305' && ssUnpadded2022.outbound.settings.servers[0].password.indexOf('9PfRl') === 0, JSON.stringify(ssUnpadded2022.outbound.settings));
const ssAsVless = parseUri('ss://4bab9727-7075-4260-a30b-369b3e54ee14@helixgaming.ir:80?path=/&security=none&encryption=none&host=play.google.com&type=ws#EPODONIOS', {});
check('ss:// UUID with query parsed as vless fallback', ssAsVless.protocol === 'vless' && ssAsVless.address === 'helixgaming.ir' && ssAsVless.port === 80 && ssAsVless.network === 'ws', [ssAsVless.protocol, ssAsVless.address, ssAsVless.port, ssAsVless.network]);
check('ss:// vless fallback host header', ssAsVless.outbound.streamSettings.wsSettings.headers.Host === 'play.google.com', JSON.stringify(ssAsVless.outbound.streamSettings));
const h2 = parseUri('hysteria2://pass@example.com:443?sni=example.com#Hy2', {});
check('unsupported protocol flagged', h2.supported === false && /پشتیبانی/.test(h2.reason), h2.reason);

console.log('\n[4] Collection text / base64 subscription / dedupe');
const text = [
  samples[0],
  samples[1],
  samples[2],
  '# a comment line',
  '',
  samples[0]
].join('\n');
const parsed = parseConfigsFromText(text, { name: 'direct' });
check('3 unique from 4 links (dedupe)', parsed.length === 3, parsed.length);
check('origins tagged', parsed.every((c) => c.origin === 'direct'));

const subB64 = Buffer.from(samples[0] + '\n' + samples[1] + '\nvless://x@y:443?type=tcp#Z').toString('base64');
const fromSub = parseConfigsFromText(subB64, { name: 'sub' });
check('base64 subscription decoded', fromSub.length === 3, fromSub.length);

const mixed = [
  'vless://u@a.example.com:443?type=tcp#A',
  'not a config line at all',
  '█████'
].join('\n');
const parsedMixed = parseConfigsFromText(mixed, {});
check('garbage lines ignored', parsedMixed.length === 1 && parsedMixed[0].address === 'a.example.com', parsedMixed.length);

const vmessList = Buffer.from(vmess.raw + '\n').toString('base64');
check('vmess base64 line decoded', parseConfigsFromText(vmessList, {}).length === 1);

console.log('\n[5] All outbounds are valid JSON without undefined values');
const all = parseConfigsFromText(text, {}).concat([vmess, trojan, ssNew]);
const bad = all.filter((c) => c.outbound && JSON.stringify(c.outbound).includes('undefined'));
check('no undefined leaked', bad.length === 0, bad.map((b) => b.id));
const portSort = all.map((c) => c.port);
check('ports are numbers', portSort.every((p) => typeof p === 'number'), portSort);

console.log('\n[6] Gemini classification');
const countryBody = '<html><body>Gemini isn\'t currently supported in your country. Stay tuned!</body></html>';
const r1 = classifyGemini(200, countryBody);
check('200 + country message -> country', r1.state === 'country', r1);
const r2 = classifyGemini(403, '<html>Forbidden</html>');
check('403 -> blocked', r2.state === 'blocked', r2);
const r3 = classifyGemini(200, '<html><title>Gemini</title>... app content ...</html>');
check('200 + normal page -> open', r3.state === 'open', r3);
const r4 = classifyGemini(500, 'oops');
check('500 -> error', r4.state === 'error', r4);
const r5 = classifyGemini(451, 'x');
check('451 -> country', r5.state === 'country', r5);
const r6 = classifyGemini(0, '');
check('no response -> error', r6.state === 'error', r6);
check('curl error 35 mapped', /TLS/.test(curlErrorText(35)), curlErrorText(35));
check('curl error 28 mapped', /تایم/.test(curlErrorText(28)), curlErrorText(28));
check('curl error unknown mapped', /curl 99/.test(curlErrorText(99)), curlErrorText(99));

console.log('\n[6b] YouTube classification');
const ytBlocked = classifyYoutube(200, '<html>This video is unavailable in your country</html>');
check('200 + country message -> country', ytBlocked.state === 'country', ytBlocked);
const ytOpen = classifyYoutube(200, '<html><title>YouTube</title>... feed ...</html>');
check('200 + normal page -> open', ytOpen.state === 'open', ytOpen);
const ytConsent = classifyYoutube(200, '<html>Before continuing to YouTube</html>');
check('consent page still open', ytConsent.state === 'open', ytConsent);
const yt403 = classifyYoutube(403, '<html>Forbidden</html>');
check('403 -> blocked', yt403.state === 'blocked', yt403);
const ytErr = classifyYoutube(0, '', 28);
check('timeout -> error with curl note', ytErr.state === 'error' && /تایم/.test(ytErr.note), ytErr);

console.log('\n[7] Blacklist module');
const testCfg = { id: 'abc', raw: 'vless://u@a.example.com:443?type=tcp#X' };
let bl = [];
bl = blacklist.addEntry(bl, blacklist.makeEntry(testCfg));
check('entry added', bl.length === 1, bl.length);
bl = blacklist.addEntry(bl, blacklist.makeEntry(testCfg));
check('duplicate not added', bl.length === 1, bl.length);
check('blocked by id', blacklist.isBlocked(bl, testCfg));
check('blocked by same uri new id', blacklist.isBlocked(bl, { id: 'other', raw: 'vless://u@a.example.com:443?type=tcp#Y' }));
check('different uri not blocked', !blacklist.isBlocked(bl, { id: 'z', raw: 'vless://u@b.example.com:443?type=tcp#Y' }));
const filtered = blacklist.filterConfigs([testCfg, { id: 'z', raw: 'vless://u@b.example.com:443?type=tcp#Y' }], bl);
check('filterConfigs keeps fresh', filtered.length === 1 && filtered[0].id === 'z', filtered.length);
check('empty list keeps all', blacklist.filterConfigs([testCfg], []).length === 1);
const index = blacklist.buildIndex(bl);
check('indexed blocked by id', blacklist.isBlockedIndexed(index, testCfg));
check('indexed different uri not blocked', !blacklist.isBlockedIndexed(index, { id: 'z', raw: 'vless://u@b.example.com:443?type=tcp#Y' }));

console.log('\n[7b] Blacklist expiry (temporarily dead servers)');
const MS_DAY = 24 * 3600 * 1000;
const MS_HOUR = 3600 * 1000;
const cfgA = { id: 'cfgA', raw: 'vless://a@a.example.com:443#A', address: 'a.example.com' };
const fresh = { id: 'cfgFresh', raw: 'vless://f@f.example.com:443#F', address: 'f.example.com' };
const ttlList = [
  Object.assign({}, blacklist.makeEntry(cfgA), { at: Date.now() - 2 * MS_DAY }),
  blacklist.makeEntry(fresh)
];
check('ttlFromHours 24h', blacklist.ttlFromHours(24) === MS_DAY, blacklist.ttlFromHours(24));
check('ttlFromHours 0 = never expire', blacklist.ttlFromHours(0) === 0);
check('fresh entry still blocked', blacklist.filterConfigs([fresh], ttlList, 24 * MS_HOUR).length === 0);
check('expired entry ignored (config returns)', blacklist.filterConfigs([cfgA], ttlList, 24 * MS_HOUR).length === 1);
check('never-expire mode blocks both', blacklist.filterConfigs([cfgA, fresh], ttlList, 0).length === 0);
check('expired ignored via isBlocked', !blacklist.isBlocked(ttlList, cfgA, 24 * MS_HOUR));
check('fresh blocked via isBlocked', blacklist.isBlocked(ttlList, fresh, 24 * MS_HOUR));
const prunedBl = blacklist.prune(ttlList, 24 * MS_HOUR);
check('prune drops expired entries', prunedBl.length === 1 && prunedBl[0].id === 'cfgFresh', prunedBl.length);
check('prune keeps all when ttl=0', blacklist.prune(ttlList, 0).length === 2);
const shortTtlList = [Object.assign({}, blacklist.makeEntry(cfgA), { at: Date.now() - 3 * MS_HOUR }), blacklist.makeEntry(fresh)];
check('6h ttl keeps 3h-old entry', blacklist.filterConfigs([cfgA], shortTtlList, 6 * MS_HOUR).length === 0, '6h ttl should still block a 3h-old entry');
const refreshed = blacklist.addEntry([blacklist.makeEntry(cfgA)], blacklist.makeEntry(cfgA));
check('re-add refreshes timestamp', refreshed.length === 1 && refreshed[0].at >= Date.now() - 5000, refreshed[0] && refreshed[0].at);

console.log('\n[8] Telegram source scraping');
const collector = require(path.join(__dirname, '..', 'src', 'core', 'collector'));
const tgHtml =
  '<div class="tgme_widget_message_text">کانفیگ جدید:<br><code>vless://824638d7-b08c-4c23-a842-73708a82f2b5@server.example.com:2095?path=%2F&amp;security=none&amp;encryption=none&amp;type=httpupgrade&amp;host=cdn.example.com#CH</code></div>' +
  '<div class="tgme_widget_message_text"><code>vmess://' + Buffer.from(JSON.stringify({ v: '2', ps: 'TG', add: '1.2.3.4', port: '80', id: 'b831381d-6324-4d53-ad4f-8cda48b30811', net: 'ws', host: 'cdn.net', path: '/vmes' })).toString('base64') + '</code> متن اضافی</div>';
check('telegram source detected', collector.isTelegramSource({ url: 'https://t.me/s/iranconnecting' }) && collector.isTelegramSource({ url: 'https://x', type: 'telegram' }) && !collector.isTelegramSource({ url: 'https://raw.githubusercontent.com/x' }));
const tgText = collector.telegramPageToText(tgHtml);
const tgList = parseConfigsFromText(tgText, { name: 'tg' });
check('telegram html -> 2 configs', tgList.length === 2, tgList.map((c) => c.protocol));
check('telegram html entity decoded (&amp;)', tgList[0].outbound.streamSettings.httpupgradeSettings.host === 'cdn.example.com', JSON.stringify(tgList[0].outbound.streamSettings));
check('telegram vmess base64 line survives', tgList[1].protocol === 'vmess' && tgList[1].address === '1.2.3.4' && tgList[1].port === 80, [tgList[1].address, tgList[1].port]);

console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
