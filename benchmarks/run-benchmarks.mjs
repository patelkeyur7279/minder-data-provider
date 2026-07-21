#!/usr/bin/env node
/**
 * run-benchmarks.mjs — request-pipeline + cache benchmarks against built dist.
 *
 * Measures the LIBRARY's overhead, not the network: a local in-process
 * node:http server serves a fixed JSON payload, so deltas between the raw-axios
 * baseline and minder() are Minder's own pipeline cost.
 *
 * Report-only by design (no pass/fail thresholds yet): CI runners have noisy
 * timing, so this suite establishes the trend line first. Budgets come once
 * variance across runs is known (roadmap 1.4 note).
 *
 * Usage:
 *   npm run bench            # human table
 *   npm run bench -- --json  # machine-readable (for trend tracking)
 */
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const WARMUP = 50;
const ITERATIONS = 300;
const PAYLOAD = JSON.stringify({ users: Array.from({ length: 25 }, (_, i) => ({ id: i, name: `user-${i}` })) });

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(PAYLOAD);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const stats = (samples) => {
  const s = samples.slice().sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { p50: at(50), p95: at(95), mean: s.reduce((a, b) => a + b, 0) / s.length };
};

async function bench(name, fn) {
  for (let i = 0; i < WARMUP; i++) await fn();
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return { name, ...stats(samples) };
}

// --- subjects ---
const axios = require(resolve(root, 'node_modules/axios'));
const importStart = performance.now();
const { minder, configureMinder } = await import(resolve(root, 'dist/index.mjs'));
const importMs = performance.now() - importStart;

configureMinder({ apiUrl: base, routes: { users: { url: '/users', method: 'GET' } } });

const results = [];
results.push(await bench('raw axios GET (baseline)', () => axios.get(`${base}/users`)));
results.push(await bench('minder() GET named route', () => minder('users')));
results.push(await bench('minder() GET absolute URL', () => minder(`${base}/users`)));
results.push(await bench('minder() GET cache:true (2nd+ hits)', () => minder('users', { cache: true })));

server.close();

const baseline = results[0].p50;
const out = {
  meta: { warmup: WARMUP, iterations: ITERATIONS, importMs: +importMs.toFixed(1), node: process.version },
  results: results.map((r) => ({
    name: r.name,
    p50_ms: +r.p50.toFixed(3),
    p95_ms: +r.p95.toFixed(3),
    overhead_vs_baseline_ms: +(r.p50 - baseline).toFixed(3),
  })),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`import cost (main entry): ${out.meta.importMs}ms · node ${out.meta.node} · n=${ITERATIONS}`);
  console.log('benchmark'.padEnd(38) + 'p50'.padStart(9) + 'p95'.padStart(9) + '  vs baseline');
  console.log('-'.repeat(70));
  for (const r of out.results) {
    console.log(
      r.name.padEnd(38) +
      (r.p50_ms + 'ms').padStart(9) +
      (r.p95_ms + 'ms').padStart(9) +
      ((r.overhead_vs_baseline_ms >= 0 ? '+' : '') + r.overhead_vs_baseline_ms + 'ms').padStart(13),
    );
  }
}
