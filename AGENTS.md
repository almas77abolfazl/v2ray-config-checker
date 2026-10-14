# AGENTS.md

## Commands

- `npm start` — اجرای اپ Electron
- `npm run start:dev` — اجرا با DevTools باز
- `npm test` — اجرای تست‌های منطق (parser + طبقه‌بندی Gemini/YouTube و خطاهای curl + لیست سیاه)
- `npm run build` — بیلد نصب‌کننده ویندوز (NSIS + پرتابل) در `releases/`
- `npm run build:dir` — بیلد بدون بسته‌بندی (فولدر win-unpacked)

## Architecture

Electron app, no runtime dependencies besides `electron` (dev).

- `main.js` — پنجره frameless + ثبت هندلرهای IPC (منابع، جمع‌آوری، تست، اتصال، تنظیمات، فایل)
- `preload.js` — پل `window.api` بین رندرر و main
- `src/core/protocols.js` — پارس لینک‌ها (`vless/vmess/trojan/ss`) به کانفیگ outbound برای Xray + دیکد سابسکریپشن base64 + تشخیص تکراری‌ها
- `src/core/xrayCore.js` — دانلود/استخراج Xray-core (با آینه‌های جانبی GitHub) و اجرای آن با inbound SOCKS
- `src/core/checker.js` — تست اتصال، Gemini و YouTube از طریق `curl.exe --socks5-hostname`
- `src/core/testEngine.js` — صف تست موازی (تا ۱۶) با بودجه زمانی ثابت برای هر کانفیگ + پیش‌چک TCP سریع
- `src/core/blacklist.js` — لیست سیاه کانفیگ‌های وصل‌نشده (dedupe + cap ۵۰۰۰)
- `src/core/session.js` — اتصال پایدار: اجرای xray با SOCKS+HTTP محلی و ست کردن ProxyEnable/ProxyServer رجیستری ویندوز + بازگرداندن هنگام قطع/خروج + بازیابی بعد از کرش (فایل `data/session-active.json`)
- `src/core/store.js` — ذخیره JSON در `data/` (sources, settings, custom, cache, blacklist)
- `src/renderer/` — UI فارسی RTL (HTML/CSS خالص، بدون فریمورک) با رندر پنجره‌ای جدول

## Conventions

- کامنت کد نگذار مگر درخواست شود.
- رشته‌های UI فارسی و RTL هستند.
- برای تست‌ دستی core بدون الکترون: `node scripts/e2e-check.js` (xray را دانلود و چند کانفیگ را تست می‌کند) و `node scripts/perf-check.js 60 6 12000` (سنجش سرعت روی کش).
