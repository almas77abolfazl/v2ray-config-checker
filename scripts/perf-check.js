'use strict';
const fs = require('fs');
const path = require('path');
const engine = require(path.join(__dirname, '..', 'src', 'core', 'testEngine'));
const { parseUri } = require(path.join(__dirname, '..', 'src', 'core', 'protocols'));

const COUNT = Number(process.argv[2] || 40);
const CONCURRENCY = Number(process.argv[3] || 6);
const BUDGET = Number(process.argv[4] || 12000);

(async () => {
  const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
  if (!fs.existsSync(cachePath)) {
    console.log('no cache.json — run the app collect first');
    process.exit(0);
  }
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const configs = (cache.configs || []).slice(0, COUNT).map((c) => {
    const parsed = parseUri(c.raw, { name: c.name });
    parsed.id = c.id;
    return parsed;
  });
  console.log('testing ' + configs.length + ' configs | concurrency=' + CONCURRENCY + ' | budget=' + BUDGET + 'ms');
  const started = Date.now();
  const latencies = [];
  const summary = await engine.run(configs, { concurrency: CONCURRENCY, timeoutMs: BUDGET }, (p) => {
    if (p.latencyMs != null && p.status === 'online') latencies.push(p.latencyMs);
  });
  const elapsed = (Date.now() - started) / 1000;
  const per = elapsed / Math.max(1, configs.length);
  const maxLat = latencies.length ? Math.max.apply(null, latencies) : 0;
  console.log('elapsed: ' + elapsed.toFixed(1) + 's | per-config avg: ' + per.toFixed(2) + 's');
  console.log('summary: ' + JSON.stringify(summary));
  console.log('online latencies (ms): ' + (latencies.length ? latencies.join(', ') : '—') + ' | max ' + maxLat);
  process.exit(0);
})().catch((e) => { console.error('PERF FAILED:', e); process.exit(1); });
