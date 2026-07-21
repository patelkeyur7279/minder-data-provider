/**
 * OSS-05 — wrapper-overhead benchmark.
 *
 * Measures the per-request overhead `minder()` adds on top of its transport,
 * against raw `fetch` and raw `axios`, over a LOCALHOST server. Localhost keeps
 * network cost ~constant so the delta isolates the library's own work (config
 * resolution, route validation, plugin bus, result normalization).
 *
 * This is NOT a real-world latency benchmark — over a real network the wrapper
 * overhead is dwarfed by round-trip time. Run: `node benchmarks/overhead.mjs`
 */
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import axios from 'axios';
import { minder, configureMinder } from '../dist/index.mjs';

const WARMUP = 500;
const ITER = 4000;
const PAYLOAD = JSON.stringify({ id: 1, name: 'bench', items: [1, 2, 3] });

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(PAYLOAD);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const mean = sum / sorted.length;
  return { median, p95, mean, opsPerSec: 1000 / mean };
}

// Interleave all cases per iteration (and rotate their order each round) so VM
// warmup and connection-pool warmth affect every case equally — otherwise a
// case that runs later in the program looks artificially faster.
async function benchInterleaved(cases) {
  const times = Object.fromEntries(cases.map((c) => [c.label, []]));
  for (let i = 0; i < WARMUP; i++) for (const c of cases) await c.fn();
  for (let i = 0; i < ITER; i++) {
    const order = cases.map((_, j) => cases[(i + j) % cases.length]); // rotate
    for (const c of order) {
      const t0 = performance.now();
      await c.fn();
      times[c.label].push(performance.now() - t0);
    }
  }
  return cases.map((c) => ({ label: c.label, ...stats(times[c.label]) }));
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  configureMinder({ apiUrl: base, routes: { bench: '/bench' } });

  // Sanity: confirm each path actually returns the payload before timing.
  const checks = {
    fetch: await fetch(`${base}/bench`).then((r) => r.json()),
    axios: (await axios.get(`${base}/bench`)).data,
    minderFetch: (await minder('bench', undefined, { transport: 'fetch' })).data,
    minderAxios: (await minder('bench')).data,
  };
  for (const [k, v] of Object.entries(checks)) {
    if (!v || v.name !== 'bench') throw new Error(`sanity check failed for ${k}: ${JSON.stringify(v)}`);
  }

  const results = await benchInterleaved([
    { label: 'raw fetch', fn: () => fetch(`${base}/bench`).then((r) => r.json()) },
    { label: 'minder (transport:fetch)', fn: () => minder('bench', undefined, { transport: 'fetch' }) },
    { label: 'raw axios', fn: () => axios.get(`${base}/bench`) },
    { label: 'minder (default/axios)', fn: () => minder('bench') },
  ]);

  server.close();

  const fmt = (n) => n.toFixed(4);
  console.log(`\nNode ${process.version} — ${ITER} iters/case (after ${WARMUP} warmup), localhost\n`);
  console.log('case                          median(ms)   p95(ms)   mean(ms)   ops/sec');
  for (const r of results) {
    console.log(
      `${r.label.padEnd(28)}  ${fmt(r.median).padStart(9)} ${fmt(r.p95).padStart(9)} ${fmt(r.mean).padStart(9)} ${Math.round(r.opsPerSec).toString().padStart(9)}`
    );
  }

  const byLabel = Object.fromEntries(results.map((r) => [r.label, r]));
  const overhead = (wrapped, raw) => {
    const abs = byLabel[wrapped].mean - byLabel[raw].mean;
    const pct = (abs / byLabel[raw].mean) * 100;
    return `${(abs * 1000).toFixed(1)} µs/call (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs ${raw})`;
  };
  console.log('\nminder wrapper overhead (mean, over localhost):');
  console.log(`  fetch path:  ${overhead('minder (transport:fetch)', 'raw fetch')}`);
  console.log(`  axios path:  ${overhead('minder (default/axios)', 'raw axios')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
