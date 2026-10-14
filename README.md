<div align="center">

# V2Ray Config Checker

**جمع‌آوری، تست واقعی و اتصال کانفیگ‌های V2Ray — با بررسی دسترسی به Gemini و YouTube**

ساخته‌شده با Electron · هسته Xray-core · بدون فریمورک UI

</div>

---

## دانلود (دانلود نسخه آماده)

برای دریافت نسخه آمادهٔ ویندوز (نصب‌کننده + پرتابل) به صفحه Releases بروید:

- [github.com/almas77abolfazl/v2ray-config-checker/releases](https://github.com/almas77abolfazl/v2ray-config-checker/releases/latest)

| فایل | توضیح |
|---|---|
| `V2Ray Config Checker-<version>-win-x64.exe` | نصب‌کننده (NSIS) — امکان تغییر مسیر نصب و ساخت شورتکات دسکتاپ |
| `V2Ray Config Checker-<version>-portable.exe` | نسخهٔ پرتابل بدون نصب |

بعد از نصب، بار اول از تب **تنظیمات** دکمه «دانلود Xray-core» را بزنید (یا اگر GitHub از شبکهٔ شما مسدود است، فایل `xray.exe` را دستی از [XTLS/Xray-core](https://github.com/XTLS/Xray-core/releases) بگیرید و مسیرش را با دکمه «انتخاب» بدهید).

---

## فارسی

برنامه‌ای دسکتاپ (ویندوز) که کانفیگ‌های V2Ray را از منابع عمومی جمع‌آوری می‌کند، هر کانفیگ را **واقعاً** روی دستگاه شما تست می‌کند (با اجرای هسته Xray-core و عبور ترافیک از پروکسی محلی) و مشخص می‌کند صفحه Gemini یا YouTube از طریق آن باز می‌شود، محدودیت-country دارد یا پاسخ نمی‌دهد. در پایان با یک کلیک می‌توانید کل سیستم را روی کانفیگ دلخواه وصل کرد.

### قابلیت‌ها

- **جمع‌آوری خودکار** از منابع پیش‌فرض (شش مخزن GitHub + کانال‌های تلگرام مثل `t.me/s/iranconnecting`) + افزودن هر لینک سابسکریپشن جدید + وارد کردن دستی لیست کانفیگ (هر خط یک لینک)
  - کانال‌های تلگرام با اسکرپ صفحهٔ عمومی کانال خوانده می‌شوند؛ اگر `t.me` روی شبکهٔ شما فیلتر باشد، برنامه به‌صورت خودکار از سرویس خواندن وب `r.jina.ai` استفاده می‌کند (قابل خاموش کردن از تنظیمات — در آن حالت فقط آدرس عمومی کانال به آن سرویس ارسال می‌شود)
- **تست واقعی موازی** تا ۱۶ کانفیگ هم‌زمان، با سقف زمان برای هر کانفیگ (پیش‌فرض ۱۲ ثانیه) و پیش‌چک TCP برای رد کردن سریع سرورهای مرده
- **دو سرویس به‌طور هم‌زمان**: بررسی `gemini.google.com` و `youtube.com` و دسته‌بندی نتیجه به «باز می‌شود / محدودیت کشور / 403 / نامشخص»
- **اتصال یک‌کلیکی**: انتخاب کانفیگ → تنظیم خودکار پروکسی سیستم (پورت SOCKS و HTTP محلی) با بازگردانی کامل تنظیمات قبلی هنگام قطع یا خروج؛ اگر برنامه کرش کند، نشست قبلی بازیابی و پروکسی سیستم بازگردانی می‌شود
- **پاک‌سازی و لیست سیاه**: کانفیگ‌های وصل‌نشده (اختیاری با تأیید) حذف و به لیست سیاه می‌روند تا در جمع‌آوری‌های بعدی نیایند
- خروجی فایل/کپی لینک کانفیگ‌های سالم، فیلتر و جستجو، ذخیره نتایج بین اجراها، رابط فارسی RTL با رندر پنجره‌ای (بدون هنگ با هزاران ردیف)

### اجرا (حالت توسعه)

```bash
git clone https://github.com/almas77abolfazl/v2ray-config-checker.git
cd v2ray-config-checker
npm install
npm start
```

بار اول از تب **تنظیمات** دکمه «دانلود Xray-core» را بزنید (از GitHub یا آینه‌های آن دانلود و در `bin/` قرار می‌گیرد). اگر دانلود خودکار مسدود بود، فایل `xray.exe` را از مخزن [XTLS/Xray-core](https://github.com/XTLS/Xray-core/releases) بگیرید و با دکمه «انتخاب» مسیرش را بدهید.

### بیلد و نصب

```bash
npm run build
```

فایل‌های نصبی در پوشه [`releases/`](releases/) ساخته می‌شوند (NSIS installer + portable). جزئیات در [`releases/README.md`](releases/README.md).

### تست منطق

```bash
npm test
```

تست‌ها پارسر لینک‌ها (همه شبکه‌ها: tcp/ws/httpupgrade/grpc/reality/h2/quic/kcp، دیکد سابسکریپشن base64، تشخیص تکراری)، طبقه‌بندی Gemini/YouTube و منطق لیست سیاه را بررسی می‌کنند و بدون نیاز به شبکه/گرافیک اجرا می‌شوند.

### عیب‌یابی

| نشانه | راه‌حل |
|---|---|
| همه کانفیگ‌ها آفلاین | احتمال فیلترینگ/فیلترشکن خود دستگاه؛ ابتدا یک کانفیگ را روی مرورگر/کلاینت دیگر تست کنید |
| دانلود Xray ناموفق | فایل را دستی از GitHub بگیرید و مسیرش را در تنظیمات ثبت کنید |
| پورت‌های ۱۰۸۰۸/۱۰۸۰۹ اشغالند | برنامه خودکار به پورت‌های بعدی جابه‌جا می‌شود؛ یا v2rayN/klient مشابه را ببندید |

### ساختار پروژه

```
main.js                     پنجره اصلی و لایه IPC
preload.js                  پل امن بین UI و main
src/core/protocols.js       پارس لینک‌ها → کانفیگ outbound برای Xray
src/core/xrayCore.js        دانلود/اجرای Xray-core (با آینه‌های جانبی)
src/core/checker.js         تست اتصال/Gemini/YouTube از طریق curl
src/core/testEngine.js      صف تست موازی با بودجه زمانی و پیش‌چک TCP
src/core/blacklist.js       لیست سیاه کانفیگ‌های مرده
src/core/session.js         اتصال پایدار + تنظیم/بازگردانی پروکسی سیستم
src/core/store.js           ذخیره تنظیمات/منابع/کش در data/
src/renderer/               رابط کاربری (HTML/CSS/JS خالص، فارسی RTL)
assets/                     آیکون برنامه (با `npm run make:icon`)
scripts/                    تست منطق، بیلد آیکون و ابزارهای عیب‌یابی
```

### نکته حقوقی

این پروژه اپن‌سورس و برای آموزش/ابزار شخصی است. استفاده از کانفیگ‌های عمومی و دور زدن محدودیت‌های دسترسی در نهایت بر عهده کاربر است؛ سازندگان هیچ مسئولیتی نسبت از دست دادن دسترسی، تغییر تنظیمات سیستم یا محتوای ارسالی از طریق کانفیگ‌های بیرونی نمی‌پذیرند. کانفیگ‌ها در اختیار اشخاص ثالث هستند و ممکن است ناپایدار یا ناامن باشند.

### مشارکت

Pull request خوش‌وقتید. قبل از ارسال، `npm test` را اجرا کنید. برای قابلیت جدید یک issue باز کنید تا طراحی‌اش توافق شود.

لایسنس: [MIT](LICENSE)

---

## English

**V2Ray Config Checker** is a Windows desktop app that harvests public V2Ray/VLESS/VMess/Trojan/Shadowsocks subscription links, *actually tests* each config on your machine by running Xray-core with a local SOCKS/HTTP inbound, and reports whether Gemini and YouTube open through it — or whether the exit is geo-restricted. Any working config can be promoted to a full system proxy with one click.

Highlights: parallel testing (up to 16) with a per-config time budget, dead-server pre-check, automatic dead-config blacklist across re-collections, graceful Windows system-proxy management with crash recovery, and a Persian RTL UI that stays smooth with thousands of rows.

### Quick start

```bash
git clone https://github.com/almas77abolfazl/v2ray-config-checker.git
cd v2ray-config-checker
npm install
npm start        # then download Xray-core from the Settings tab
npm test         # logic tests (parser, gemini/youtube classification, blacklist)
npm run build    # NSIS + portable installers into releases/
```

### License

[MIT](LICENSE) — provided “as is”, without warranty. You are responsible for how you use the configs you connect to.
