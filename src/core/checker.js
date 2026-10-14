'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DIR = path.join(os.tmpdir(), 'vcc-curl');
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) { }

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CURL_ERRORS = {
  6: 'DNS resolve نشد',
  7: 'اتصال به سرور انجام نشد',
  27: 'حافظه پرشد',
  28: 'تایم‌اوت اتصال',
  35: 'خطای TLS/SSL در اتصال',
  52: 'سرور پاسخ خالی داد',
  55: 'ارسال داده ناموفق',
  56: 'خطای دریافت داده از سرور',
  92: 'جریان HTTP/2 قطع شد',
  94: 'خطای chunked encoding',
  97: 'هدف پروکسی پاسخ نداد'
};

function curlErrorText(code) {
  if (code == null || code === '') return 'بدون پاسخ';
  const n = Number(code);
  if (!Number.isFinite(n)) return 'curl ' + code;
  return CURL_ERRORS[n] || ('curl ' + n);
}

function sweepTempDir() {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    for (const entry of fs.readdirSync(TMP_DIR)) {
      if (entry.endsWith('.tmp')) fs.rmSync(path.join(TMP_DIR, entry), { force: true });
    }
  } catch (_) { }
}

function curlRequest(url, socksPort, timeoutMs, keepBody) {
  return new Promise((resolve) => {
    const out = path.join(TMP_DIR, 'body-' + socksPort + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.tmp');
    const args = [
      '-s',
      '-m', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      '--connect-timeout', '8',
      '--socks5-hostname', '127.0.0.1:' + socksPort,
      '-A', USER_AGENT,
      '-L', '--max-redirs', '5',
      '-o', out,
      '-w', '%{http_code} %{time_total}',
      url
    ];
    let body = null;
    let status = 0;
    let ms = null;
    let curlError = null;
    let settled = false;
    const cleanup = () => { try { if (fs.existsSync(out)) fs.rmSync(out, { force: true }); } catch (_) { } };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status, ms, body, curlError });
    };
    try {
      execFile('curl.exe', args, { windowsHide: true, timeout: timeoutMs + 10000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) curlError = String(err.code || err.message || err);
        const m = /^\s*(\d{3})\s+([\d.]+)/.exec(String(stdout || ''));
        if (m) {
          status = Number(m[1]);
          ms = Math.round(Number(m[2]) * 1000);
        }
        try {
          if (fs.existsSync(out)) {
            const raw = fs.readFileSync(out, 'utf8');
            if (keepBody) body = raw.slice(0, 300000);
          }
        } catch (_) { }
        finish();
      });
    } catch (e) {
      curlError = String((e && e.message) || e);
      finish();
    }
  });
}

async function checkConnection(port, budgetMs) {
  const budget = Math.max(1500, Number(budgetMs) || 6000);
  const first = Math.max(1500, Math.round(budget * 0.6));
  const fallbackBudget = Math.max(1200, Math.min(2500, budget - first));
  const primary = await curlRequest('https://www.gstatic.com/generate_204', port, first, false);
  if (primary.status !== 0) {
    return { ok: true, status: primary.status, ms: primary.ms, reason: '', ip: '' };
  }
  const used = primary.ms == null ? first : primary.ms;
  if (used >= first * 0.55) {
    return { ok: false, status: 0, ms: primary.ms, reason: curlErrorText(primary.curlError), ip: '' };
  }
  const fallback = await curlRequest('https://api.ipify.org', port, fallbackBudget, true);
  if (fallback.status === 200) {
    let ip = '';
    if (fallback.body) {
      const trimmed = String(fallback.body).trim();
      if (/^[0-9a-fA-F.:]{3,45}$/.test(trimmed)) ip = trimmed;
    }
    return { ok: true, status: 200, ms: fallback.ms != null ? fallback.ms : primary.ms, reason: '', ip };
  }
  return {
    ok: false,
    status: fallback.status,
    ms: fallback.ms != null ? fallback.ms : primary.ms,
    reason: fallback.status === 0 ? curlErrorText(fallback.curlError) : 'کد ' + fallback.status,
    ip: ''
  };
}

async function exitIp(port, timeoutMs) {
  const r = await curlRequest('https://api.ipify.org', port, Math.min(timeoutMs, 8000), true);
  if (r.status === 200 && r.body) {
    const ip = String(r.body).trim();
    if (/^[0-9a-fA-F.:]{3,45}$/.test(ip)) return ip;
  }
  return '';
}

function classifyPage(status, body, blockPatterns, openLabel, curlError) {
  const text = String(body || '');
  if (status === 0) return { state: 'error', httpStatus: 0, note: curlErrorText(curlError) };
  if (blockPatterns.some((re) => re.test(text))) return { state: 'country', httpStatus: status, note: 'در این کشور پشتیبانی نمی‌شود' };
  if (status === 403) return { state: 'blocked', httpStatus: 403, note: 'خطای 403 (دسترسی رد شد)' };
  if (status === 429) return { state: 'blocked', httpStatus: 429, note: 'محدودیت نرخ — 429' };
  if (status === 451) return { state: 'country', httpStatus: 451, note: 'مسدودسازی قانونی — 451' };
  if (status >= 500) return { state: 'error', httpStatus: status, note: 'خطای سرور ' + status };
  if (status === 200) return { state: 'open', httpStatus: 200, note: openLabel };
  return { state: 'unknown', httpStatus: status, note: 'کد ' + status };
}

const GEMINI_BLOCK = /(isn['’]?t currently supported in your country|not currently supported in your country|currently supported in your country|not available in your country|currently available in your country|Gemini (?:is )?not (?:yet )?(?:available|supported) in your country|Stay tuned)/i;

const YOUTUBE_BLOCK = /(unavailable in your country|isn['’]?t available in your country|is not available in your country|not available in your country|blocked in your country|couldn['’]?t be accessed from your country)/i;

function classifyGemini(status, body, curlError) {
  return classifyPage(status, body, [GEMINI_BLOCK], 'صفحه جمنای باز می‌شود', curlError);
}

function classifyYoutube(status, body, curlError) {
  return classifyPage(status, body, [YOUTUBE_BLOCK], 'یوتیوب باز می‌شود', curlError);
}

async function checkGemini(port, timeoutMs) {
  const r = await curlRequest('https://gemini.google.com/', port, timeoutMs, true);
  return classifyGemini(r.status, r.body || '', r.curlError);
}

async function checkYoutube(port, timeoutMs) {
  const r = await curlRequest('https://www.youtube.com/', port, Math.max(1500, timeoutMs), true);
  return classifyYoutube(r.status, r.body || '', r.curlError);
}

module.exports = { checkConnection, checkGemini, classifyGemini, exitIp, curlErrorText, classifyYoutube, checkYoutube, sweepTempDir };
