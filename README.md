<div align="center">

<img src="assets/icon.png" width="96" height="96" alt="V2Ray Config Checker Logo" />

# V2Ray Config Checker

**High-Performance V2Ray/Xray Node Collector, Real-Time Latency Tester & System Proxy**

[![GitHub release](https://img.shields.io/github/v/release/almas77abolfazl/v2ray-config-checker?color=e28743&style=flat-square)](https://github.com/almas77abolfazl/v2ray-config-checker/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-3db88f.svg?style=flat-square)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg?style=flat-square)](https://github.com/almas77abolfazl/v2ray-config-checker/releases)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron%20Vanilla-475569.svg?style=flat-square)](https://www.electronjs.org/)

<br />

<p align="center">
  <a href="#-quick-download">Download</a> •
  <a href="#-english">English</a> •
  <a href="#-فارسی">فارسی</a> •
  <a href="#-key-features">Features</a> •
  <a href="#-architecture">Architecture</a>
</p>

---

<br />

<img src="assets/screenshot.png" width="900" alt="V2Ray Config Checker Interface" style="border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />

<br />

</div>

---

## ⚡ Quick Download

Download the latest pre-built Windows binaries directly from [Releases](https://github.com/almas77abolfazl/v2ray-config-checker/releases/latest):

| Package | Type | Description |
|---|---|---|
| **`V2Ray-Config-Checker-*-win-x64.exe`** | **Installer (NSIS)** | Full setup with customizable install path & desktop shortcut |
| **`V2Ray-Config-Checker-*-portable.exe`** | **Portable** | Standalone zero-install executable, runs directly from USB/disk |

*Note: On first launch, if Xray-core is not present on your system, the app will automatically download the official binary, or you can select your own `xray.exe` in Settings.*

---

## 🌐 English

### Overview
**V2Ray Config Checker** is a fast, lightweight, and modern desktop application tailored specifically for censorship-heavy environments (such as Iran DPI). It automatically aggregates nodes from curated channels and repositories, tests them via an isolated local **Xray-core** process with realistic TLS handshakes, and provides a 1-click system proxy toggle.

### 🚀 Key Features

* **Instant Smart Test ("⚡ دریافت و تست سریع"):** Fetches the freshest nodes, tests up to 12 configs in parallel, and automatically discards offline or expired entries in under 20 seconds.
* **Specialized for Modern Anti-Censorship Protocols:** Native support for **VLESS XTLS-Reality**, WebSocket, gRPC, HTTPUpgrade, Trojan, VMess, and Shadowsocks (including SS-2022).
* **Dual-Service Availability Checker:** Independently verifies direct access to **Google Gemini** (detecting Geo-blocking/HTTP 451) and **YouTube** streaming reachability.
* **True DPI-Resistant Testing:** Bypasses naive TCP raw pings that trigger DPI drops; runs genuine outbound handshakes through local Xray sockets.
* **1-Click System Proxy:** Sets and reverts Windows system proxy (`ProxyEnable` & `ProxyServer` in Registry) with graceful cleanup and auto-recovery on crash.
* **Auto-Expiring Blacklist:** Dead servers are cached with a 12-hour TTL to prevent re-testing the same broken nodes while allowing revived servers to reappear.
* **Zero Runtime Bloat:** Pure vanilla JavaScript frontend with virtualized rendering; smooth 60fps scrolling even with hundreds of items.
* **Auto Update Notifier:** Checks GitHub releases on launch and notifies users whenever a newer build is published.

### 🛠️ Architecture & Tech Stack

```text
├── main.js                  # Frameless Electron window, native IPC & registry proxy management
├── preload.js               # Secure contextBridge API mapping
├── src/
│   ├── core/
│   │   ├── xrayCore.js      # Xray binary manager, mirror downloader & multi-port process supervisor
│   │   ├── protocols.js     # Decoders & parsers for vless/vmess/trojan/ss/sub URI schemes
│   │   ├── checker.js       # Real-world traffic probing with curl.exe socks5-hostname
│   │   ├── testEngine.js    # Concurrency queue with strict timeouts & auto-port allocation
│   │   ├── collector.js     # Multi-source scraper (GitHub subscriptions & Telegram mirrors)
│   │   ├── session.js       # Persistent Windows proxy session & crash recovery
│   │   ├── blacklist.js     # Hash-based duplicate detection & TTL expiry
│   │   └── updater.js       # Lightweight GitHub release version comparator
│   └── renderer/            # High-performance Vanilla RTL interface with Obsidian Copper theme
```

---

## 🇮🇷 فارسی

### درباره پروژه
در شرایط فعلی اینترنت و فیلترینگ شدید DPI در ایران، اکثر کانفیگ‌های عمومی ظرف چند ساعت مسدود می‌شوند یا به دلیل پروتکل‌های قدیمی (مانند VMess بدون TLS) کارایی ندارند. علاوه بر این، بسیاری از تسترهای سنتی به دلیل پینگ مستقیم TCP باعث مسدودسازی زودهنگام یا تشخیص اشتباه وضعیت کانفیگ می‌شوند.

**V2Ray Config Checker** ساخته شده تا این مشکل را به سادگی حل کند:
1. کانفیگ‌های داغ و تازه را از سورس‌های بهینه‌شده مخصوص اینترنت ایران (شامل **Reality و VLESS**) دریافت می‌کند.
2. با هندشیک واقعی در هسته **Xray-core**، دسترسی واقعی به اینترنت، **یوتیوب** و هوش مصنوعی **جمنای** را می‌سنجد.
3. با یک کلیک، بدون نیاز به نصب نرم‌افزارهای پیچیده دیگر، کل سیستم را به بهترین کانفیگ آنلاین متصل می‌کند.

### ✨ قابلیت‌های کلیدی

* **دکمه جادویی «دریافت و تست سریع»:** یک کلیک کافیست تا تازه‌ترین سرورها دریافت، تست و تمام موارد قطع به طور خودکار پاکسازی شوند.
* **سازگاری کامل با پروتکل‌های ضد فیلتر:** پشتیبانی تخصصی از VLESS Reality، gRPC، WebSocket، Trojan و Shadowsocks 2022.
* **تست هوشمند Gemini و YouTube:** تشخیص دقیق وضعیت سرور (سرویس باز / تحریم کشوری ۴۵۱ / مسدود ۴۰۳).
* **دکمه «چسباندن کانفیگ»:** امکان کپی کردن دسته کانفیگ‌ها از کانال‌ها و گروه‌های تلگرام و تست فوری با یک کلیک.
* **پروکسی سیستمی خودکار:** بدون نیاز به تنظیمات دستی مرورگر؛ با اتصال، پروکسی ویندوز فعال و با خروج به حالت قبل بازمی‌گردد.
* **بلک‌لیست خودکار با انقضای ۱۲ ساعته:** جلوگیری از اتلاف وقت روی سرورهای سوخته در دورهای بعدی.
* **طراحی مدرن با تم اختصاصی Obsidian Copper:** رابط کاربری خلوت، آیکون‌های وکتور SVG خالص، دکمه‌های کنترل پنجره در سمت راست و فونت بهینه.
* **اطلاع‌رسانی خودکار نسخه جدید:** بررسی مداوم ریپازیتوری گیت‌هاب و نمایش بنر دانلود در صورت انتشار نسخه جدید.

---

## 💻 اجرای محلی و توسعه (Local Development)

پیش‌نیاز: [Node.js](https://nodejs.org/) (نسخه ۱۸ یا بالاتر)

```bash
# ۱. کلون ریپازیتوری
git clone https://github.com/almas77abolfazl/v2ray-config-checker.git
cd v2ray-config-checker

# ۲. نصب وابستگی‌ها
npm install

# ۳. اجرای تست‌های هسته (Unit & Logic tests)
npm test

# ۴. اجرای برنامه
npm start
```

### 📦 بیلد نسخه‌های ویندوز (Packaging)

```bash
# ساخت پکیج‌های نصبی (NSIS) و پرتابل در پوشه releases/
npm run build
```

---

## 📜 لایسنس
این پروژه تحت پروانه [MIT License](LICENSE) منتشر شده است. استفاده، ویرایش و توسعه آزاد است.
