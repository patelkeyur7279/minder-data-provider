#!/usr/bin/env node
// Regression guard for MDPD-17 (dropped React context) and dabd92d (dropped
// HttpMethod enum runtime) — the two production-only "sideEffects" crash classes.
//
// Mechanism being guarded: with tsup code-splitting, shared state (createContext,
// the non-const `enum` runtime) lives in chunk files initialized by lazy __esm
// thunks that run as *module side effects* of chunk imports. A consumer bundler
// that believes the package is side-effect-free ("sideEffects": false) may DROP
// those imports (the app then throws only in production — "reading '_currentValue'"
// / "HttpMethod is undefined") OR DUPLICATE a chunk and fork a singleton. jest/jsdom
// and a green build cannot catch this — only bundling like a real consumer can.
//
// Spec 1.3c made "sideEffects": false SAFE by moving every import-time side effect
// behind a lazy getter with globalThis-keyed identity (src/core/singletons.ts).
// This guard proves that holds, PRE-PUBLISH, across:
//   • ALL export entries (not just main/hook/crud) — a per-entry miss regresses
//     only that entry's consumers, invisible to a main-entry-only check.
//   • TWO tree-shaker engines — Rollup (Vite's core; the engine the bug was
//     originally proven in) AND Rspack (webpack-compatible sideEffects semantics).
//     esbuild does NOT reproduce the pruning, so it is not a valid guard engine.
//
// Method — differential, self-baselining (no hard-coded per-entry expectations):
// each entry is bundled against a forced `sideEffects: true` copy of the package
// (BASELINE — always retains everything) and against the package AS SHIPPED. Any
// retention SIGNAL present in the baseline that is missing from the shipped build
// is a dropped side effect => FAIL. Signals:
//   ctx  = /createContext/  (React context — MDPD-17)
//   enum = /.GET="GET"/     (HttpMethod non-const-enum member init — dabd92d / B1)
// Plus an identity check: bundling two context-consuming entries together must not
// increase the context count (the module must dedupe, not fork).
//
// Validated to DISCRIMINATE: reverting the singletons fix (top-level createContext)
// while shipping "sideEffects": false makes the shipped ctx signal fall below
// baseline and this guard exits non-zero. Re-run `npm run verify:treeshake`.
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rspack } from '@rspack/core';
import {
  mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync, readFileSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Every published entry (the exports map), so no consumer-facing entry is unchecked.
const ENTRIES = Object.entries(pkg.exports)
  .filter(([sub, t]) => sub !== './package.json' && t?.import)
  .map(([sub]) => (sub === '.' ? 'minder-data-provider' : `minder-data-provider/${sub.replace('./', '')}`));

// The library's OWN code is internal (resolved + tree-shaken); everything else —
// react, @tanstack, axios, provider peer SDKs, node builtins — is external so the
// only signals in the output come from this package, never a bundled dependency.
const isInternal = (id) =>
  id === 'minder-data-provider' || id.startsWith('minder-data-provider/') ||
  id.startsWith('.') || id.startsWith('/');
const isExternal = (id) => !isInternal(id);

const CTX_RE = /createContext/g;      // engine-agnostic: Rollup `createContext(null)`, Rspack `.createContext)(null)`
const ENUM_RE = /\.GET\s*=\s*"GET"/g; // esbuild non-const-enum member assignment (HttpMethod)
const sig = (code) => ({
  ctx: (code.match(CTX_RE) ?? []).length,
  enun: (code.match(ENUM_RE) ?? []).length,
});

// Stage the built package under node_modules/ so resolution — including the
// "sideEffects" manifest field — behaves exactly as for a real consumer.
function stage(forceSideEffectsTrue) {
  const work = mkdtempSync(join(tmpdir(), 'mdp-treeshake-'));
  const staged = join(work, 'node_modules', 'minder-data-provider');
  mkdirSync(staged, { recursive: true });
  cpSync(join(root, 'dist'), join(staged, 'dist'), { recursive: true });
  const pj = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (forceSideEffectsTrue) pj.sideEffects = true;
  writeFileSync(join(staged, 'package.json'), JSON.stringify(pj));
  return work;
}

const consumer = (entry) => `import * as NS from ${JSON.stringify(entry)};\nexport const __keep = NS;\n`;

async function bundleRollup(work, code) {
  writeFileSync(join(work, 'consumer.mjs'), code);
  const bundle = await rollup({
    input: join(work, 'consumer.mjs'),
    plugins: [nodeResolve({ rootDir: work, browser: true, preferBuiltins: false })],
    external: isExternal,
    onwarn: () => {},
  });
  const { output } = await bundle.generate({ format: 'es' });
  await bundle.close();
  return output.map((o) => ('code' in o ? o.code : '')).join('\n');
}

function bundleRspack(work, code) {
  return new Promise((resolve, reject) => {
    writeFileSync(join(work, 'consumer.mjs'), code);
    const out = join(work, `rspack-out-${Math.random().toString(36).slice(2)}`);
    const compiler = rspack({
      mode: 'production',
      context: work,
      entry: join(work, 'consumer.mjs'),
      externalsType: 'module',
      externals: [(data, cb) => (data.request && isExternal(data.request) ? cb(null, data.request) : cb())],
      // Respect the package's "sideEffects" (that IS the flag under test), but do
      // not minify or concatenate, so signals stay greppable.
      optimization: {
        minimize: false, sideEffects: true, usedExports: true, providedExports: true, concatenateModules: false,
      },
      experiments: { outputModule: true },
      output: { path: out, filename: 'b.mjs', module: true, library: { type: 'module' } },
    });
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({ errors: true }).slice(0, 800)));
      const code2 = readdirSync(out).map((f) => readFileSync(join(out, f), 'utf8')).join('\n');
      compiler.close(() => resolve(code2));
    });
  });
}

const workBaseline = stage(true);   // forced "sideEffects": true — retains everything
const workActual = stage(false);    // the package exactly as it will ship
const failures = [];
const summary = [];

try {
  for (const entry of ENTRIES) {
    const code = consumer(entry);
    // Baselines are PER-ENGINE: the two tree-shakers render the same call with a
    // different token count (Rollup keeps the import specifier + call, Rspack a
    // single member call), so a Rollup baseline is NOT comparable to a Rspack
    // build. Compare each engine's shipped build only against its own baseline.
    const baseR = sig(await bundleRollup(workBaseline, code));
    const baseK = sig(await bundleRspack(workBaseline, code));
    const rA = sig(await bundleRollup(workActual, code));
    const kA = sig(await bundleRspack(workActual, code));
    const label = entry.replace('minder-data-provider', '.');

    if (rA.ctx < baseR.ctx) failures.push(`${label}: Rollup DROPPED React context (createContext ${rA.ctx} < baseline ${baseR.ctx}) — MDPD-17`);
    if (kA.ctx < baseK.ctx) failures.push(`${label}: Rspack DROPPED React context (createContext ${kA.ctx} < baseline ${baseK.ctx}) — MDPD-17`);
    if (rA.enun < baseR.enun) failures.push(`${label}: Rollup DROPPED HttpMethod enum runtime (${rA.enun} < baseline ${baseR.enun}) — dabd92d / B1`);
    if (kA.enun < baseK.enun) failures.push(`${label}: Rspack DROPPED HttpMethod enum runtime (${kA.enun} < baseline ${baseK.enun}) — dabd92d / B1`);

    if (baseR.ctx > 0 || baseR.enun > 0) {
      summary.push(`${label}: ctx ${rA.ctx}/${kA.ctx} enum ${rA.enun}/${kA.enun} (base R ${baseR.ctx}/${baseR.enun} K ${baseK.ctx}/${baseK.enun})`);
    }
  }

  // Single-context identity: bundling two context-consuming entries together must
  // NOT increase the context count — the shared context module must dedupe, not
  // fork into two. (Runtime Symbol.for identity is proven separately in Jest.)
  const combinedCode =
    `import * as A from 'minder-data-provider';\nimport * as B from 'minder-data-provider/hook';\nexport const __keep = [A, B];\n`;
  const mainCtxR = sig(await bundleRollup(workActual, consumer('minder-data-provider'))).ctx;
  const hookCtxR = sig(await bundleRollup(workActual, consumer('minder-data-provider/hook'))).ctx;
  const mainCtxK = sig(await bundleRspack(workActual, consumer('minder-data-provider'))).ctx;
  const hookCtxK = sig(await bundleRspack(workActual, consumer('minder-data-provider/hook'))).ctx;
  const combR = sig(await bundleRollup(workActual, combinedCode)).ctx;
  const combK = sig(await bundleRspack(workActual, combinedCode)).ctx;
  const ceilingR = Math.max(mainCtxR, hookCtxR);
  const ceilingK = Math.max(mainCtxK, hookCtxK);
  if (combR > ceilingR) failures.push(`identity: Rollup combined main+hook has ${combR} createContext > ${ceilingR} — context module FORKED (not deduped)`);
  if (combK > ceilingK) failures.push(`identity: Rspack combined main+hook has ${combK} createContext > ${ceilingK} — context module FORKED (not deduped)`);
} finally {
  rmSync(workBaseline, { recursive: true, force: true });
  rmSync(workActual, { recursive: true, force: true });
}

if (failures.length) {
  console.error('verify-consumer-treeshake: FAIL — a shipped-package bundle dropped or forked a side effect:\n');
  for (const f of failures) console.error('  - ' + f);
  console.error(
    '\nsideEffects: false is only safe while every cross-entry singleton is behind a lazy\n' +
    'getter with globalThis identity (src/core/singletons.ts). Fix the regression, or (last\n' +
    'resort, kill-switch) set package.json "sideEffects": true and rebuild.',
  );
  process.exit(1);
}

console.log(
  `verify-consumer-treeshake: OK — ${ENTRIES.length} entries × 2 engines (Rollup + Rspack); ` +
  `no context/enum side effect dropped, context module deduped. ` +
  `sideEffects="${pkg.sideEffects}". Context/enum-bearing entries:\n  ${summary.join('\n  ')}`,
);
