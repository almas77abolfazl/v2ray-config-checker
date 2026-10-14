'use strict';
const Module = require('module');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const realUserData = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Roaming'), 'V2Ray Config Checker');
const orig = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: (n) => ({ exe: 'C:\\Portable\\V2Ray Config Checker.exe', userData: realUserData }[n] || 'C:\\App')
      }
    };
  }
  return orig.apply(this, arguments);
};

const x = require('../src/core/xrayCore');

(async () => {
  console.log('binDir:', x.binDir());
  const p = await x.ensureXray((e) => { if (e.phase === 'done') console.log('download OK'); }, { timeoutMs: 12000 });
  console.log('installed:', p);
  console.log('resolve matches:', x.resolveXray({}) === p);
  const out = execSync('"' + p + '" -version').toString().trim().split('\n')[0];
  console.log('executable runs:', out);
  fs.rmSync(path.dirname(p), { recursive: true, force: true });
  console.log('test install cleaned');
})().catch((e) => console.error('FAILED:', e.message, e.cause && e.cause.code));
