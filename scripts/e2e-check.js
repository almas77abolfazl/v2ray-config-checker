'use strict';
const path = require('path');
const xrayCore = require(path.join(__dirname, '..', 'src', 'core', 'xrayCore'));
const engine = require(path.join(__dirname, '..', 'src', 'core', 'testEngine'));
const { parseUri } = require(path.join(__dirname, '..', 'src', 'core', 'protocols'));

const samples = [
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@tamiiiiz.aryan-sport.ir:2095?path=%2F&security=none&encryption=none&host=dr4.aryan-sport.ir&type=httpupgrade#Netherlands-1',
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@188.114.98.6:2095?path=%2F&security=none&encryption=none&host=dr2.aryan-sport.ir&type=httpupgrade#Netherlands-2',
  'vless://824638d7-b08c-4c23-a842-73708a82f2b5@tamiiiiz.aryan-sport.ir:2095?path=%2F&security=none&encryption=none&host=dr.aryan-sport.ir&type=httpupgrade#Netherlands-3'
];

(async () => {
  console.log('== ensuring xray ==');
  const exe = await xrayCore.ensureXray((p) => console.log('  [xray]', p.phase, p.percent || '', p.url || ''), { timeoutMs: 15000 });
  console.log('xray ready at:', exe);
  const configs = samples.map((s) => parseUri(s, { name: 'sample' }));
  console.log('\n== running tests on', configs.length, 'configs ==');
  const summary = await engine.run(configs, { concurrency: 3, timeoutMs: 15000 }, (p) => console.log('  [test]', JSON.stringify(p)));
  console.log('\nSUMMARY:', JSON.stringify(summary));
  process.exit(0);
})().catch((e) => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
