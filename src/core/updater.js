'use strict';
const pkg = require('../../package.json');

const REPO = 'almas77abolfazl/v2ray-config-checker';
const CURRENT_VERSION = pkg.version;

function parseVersion(v) {
  return String(v || '').replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < Math.max(r.length, l.length); i += 1) {
    const a = r[i] || 0;
    const b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

async function checkUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        'User-Agent': 'V2RayConfigChecker/' + CURRENT_VERSION,
        Accept: 'application/vnd.github+json'
      }
    });
    if (!res.ok) return { hasUpdate: false, currentVersion: CURRENT_VERSION };
    const data = await res.json();
    const latestTag = String(data.tag_name || data.name || '');
    const cleanLatest = latestTag.replace(/^v/, '');
    
    if (isNewer(cleanLatest, CURRENT_VERSION)) {
      return {
        hasUpdate: true,
        currentVersion: CURRENT_VERSION,
        latestVersion: cleanLatest,
        releaseUrl: data.html_url || `https://github.com/${REPO}/releases/latest`,
        releaseNotes: data.body || '',
        publishedAt: data.published_at
      };
    }
    return { hasUpdate: false, currentVersion: CURRENT_VERSION, latestVersion: cleanLatest };
  } catch (_) {
    return { hasUpdate: false, currentVersion: CURRENT_VERSION };
  }
}

module.exports = { checkUpdate, CURRENT_VERSION };
