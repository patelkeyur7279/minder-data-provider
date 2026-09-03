#!/usr/bin/env node
// Regression guard for MDPD-17 (dropped React context) and dabd92d (dropped
// HttpMethod enum/const-object runtime) — the "sideEffects" production-crash class.
//
// Mechanism being guarded: with tsup code-splitting, shared state (createContext,
// the enums object) lives in chunk files initialized by lazy __esm thunks that run
// as *module side effects* of chunk imports. A consumer bundler that believes the
// package is side-effect-free ("sideEffects": false) may DROP those imports (the
// app then throws only in production — "reading '_currentValue'" / "HttpMethod is
// undefined") OR DUPLICATE a chunk and fork a singleton. jest/jsdom and a green
// build cannot catch this — only bundling like a real consumer can.
//
// ---------------------------------------------------------------------------
// HISTORY (defect 6): why this file was rewritten
// ---------------------------------------------------------------------------
// The original guard measured two hardcoded TEXT patterns: `createContext` (ctx)
// and `.GET\s*=\s*"GET"` (enum — esbuild's lowering of a non-const TS `enum`
// member ASSIGNMENT). Spec 1.3c reshaped `src/constants/enums.ts` from a
// TypeScript `enum` to `export const HttpMethod = { GET: 'GET', ... } as const`.
// esbuild now emits an object LITERAL, so the assignment token the enum regex
// matched no longer exists anywhere in the build — `enun` was 0/0 on every one of
// the 31 entries, for BOTH the forced-`sideEffects:true` baseline and the shipped
// build. `0 < 0` is always false, so that half of the guard could never fail again.
// It was a guard that had gone blind, not a guard that was passing.
//
// The class-level bug: a failure predicate of `shipped < baseline` on a hardcoded
// TEXT pattern, with NO assertion that the pattern is ever observed at all. Any
// reshape of the emitted code silently converts a signal from load-bearing to
// vacuously satisfied. This is the exact shape of the wire-parity comparator that
// stopped discriminating earlier this release. Repairing only the regex (e.g.
// `/GET\s*:\s*(['"])GET\1/`) is NOT sufficient either: with `as const`, the string
// literal lives inside the retained closure whether or not that closure is ever
// INVOKED, so text presence no longer implies runtime initialization — a build
// with every enum-init call surgically deleted still shows the literal in the
// output and a text-only guard stays green while the built package throws
// `TypeError: Cannot read properties of undefined (reading 'POST')` in production.
//
// THE FIX (this file): replace the enum text signal with a differential EXECUTION
// probe — actually bundle, write, and `import()` each of the 31 published entries,
// for both the forced-`sideEffects:true` baseline and the package as shipped, and
// fail when an export that is a real value in the baseline comes back `undefined`,
// missing, or `THREW` in the shipped build. This asserts the thing that actually
// breaks in production, not a text proxy for it — it cannot go vacuous just
// because the emitted shape changes, because it does not read the emitted shape at
// all. It also subsumes the original enum signal AND the dropped-context class in
// one probe (both surface as an unexpectedly-`undefined` export).
//
// A second, independent hole is closed structurally: every signal below (`SIGNALS`)
// declares baseline `anchors` and is asserted to fire on at least one of them
// BEFORE any shipped-vs-baseline comparison runs. A signal that is silent on every
// anchor exits 1 with "SIGNAL VACUOUS" — this is the self-test that would have
// caught the original enum regression the moment `as const` landed, instead of
// silently reporting 0/0 forever. See NEGATIVE CONTROL B in the task record for the
// control that reverts this exact self-test and demands red.
//
// The `createContext` text signal is KEPT, but demoted: it now exists ONLY to
// support the fork/dedupe identity check below (bundling two context-consuming
// entries together must not increase the context count — execution cannot easily
// express "did not fork" the way it expresses "was not dropped"). It carries an
// anchor like every other signal, so it can never again go vacuous unnoticed.
//
// Validated to DISCRIMINATE (see scripts/__controls__/kill-enum-init.mjs and the
// task record's Negative Controls A/B): AST-precisely deleting every call to the
// enums chunk's `__esm` init thunk across `dist/**/*.mjs` makes 14 of 31 entries'
// shipped execution snapshots diverge from baseline (undefined exports) and this
// guard exits 1 naming them; the other 17 entries (which never touch the enums
// chunk) correctly stay green.
//
// ---------------------------------------------------------------------------
// A9/A10 (2026-09): closing the probe hole — the `exports-defined` UNDER-COUNT
// ---------------------------------------------------------------------------
// `exports-defined` bundles a NAMESPACE import (`import * as NS from entry`).
// Referencing ANY member of NS forces a bundler to retain the whole namespace
// object, which — for an `__esm`-wrapped chunk — means retaining (and running)
// the shared init thunk that initializes EVERY export the chunk owns, not just
// the one a real consumer asked for. MEASURED: this made `exports-defined` report
// only 13 broken exports, all on `./nextjs`, where a real single-named-import
// consumer (`import { X } from 'minder-data-provider/web'`) sees 226 broken
// (entry, export) pairs across 11 entries — a ~17x undercount. Batching several
// named imports into one probe module is ALSO vacuous for the same reason
// (measured: batching 20 named imports from `./web` reports 0 broken against a
// dist KNOWN to be broken, because importing `HttpMethod` alongside the others
// drags in the anchor that initializes everything else).
//
// THE FIX: a THIRD signal, `named-import-defined`, bundles exactly ONE named
// import per probe module — `import { X as _0 } from entry` — so retention is
// measured the way a real consumer's bundler actually sees it. This is run for
// EVERY (entry, export) pair, on both engines, differentially against the same
// forced-`sideEffects:true` baseline as every other signal here. It subsumes
// `exports-defined` (any regression the namespace probe catches, this catches
// too) without replacing it — `exports-defined` stays because it is cheaper and
// still useful as an early, coarse pass.
//
// RE-DERIVATION (2026-09, closing the vacuous report): the signal above was
// declared in SIGNALS (with a `field: 'namedExec'`) and its probe machinery
// (`namedImportProbe`, `computeNamedImports`, `execRollupNamed`,
// `execRspackNamed`) existed, but NOTHING in `computeEntry()` ever called
// `computeNamedImports()` or wrote to `result.namedExec` — the field stayed
// `null` on every entry, forever. `fires()` correctly found no data to check
// and refused to claim the signal was proven, exiting "SIGNAL VACUOUS" — the
// anti-vacuity self-test doing exactly its job (this is NOT the same failure
// class as the enum-regex going blind; that signal actively ran and matched
// nothing, this one never ran at all). The fix wires the probe into
// `computeEntry()`: after the namespace probe runs, its OWN discovered export
// names (`collectExportNames()`, reading `Object.keys()` of whichever engine's
// namespace snapshot succeeded — never a hardcoded list) drive one
// `computeNamedImports()` call per entry, per build variant (baseline AND
// shipped), and Pass 2 now diffs `namedExec` the same way it already diffed
// `exec`, reporting per-export named-import regressions by name.
//
// Method — differential, self-baselining (no hard-coded per-entry expectations):
// each entry is bundled against a forced `sideEffects: true` copy of the package
// (BASELINE — always retains everything) and against the package AS SHIPPED. Any
// retention SIGNAL present in the baseline that is missing from the shipped build
// is a dropped side effect => FAIL. Across:
//   • ALL export entries (not just main/hook/crud) — a per-entry miss regresses
//     only that entry's consumers, invisible to a main-entry-only check.
//   • TWO tree-shaker engines — Rollup (Vite's core; the engine the bug was
//     originally proven in) AND Rspack (webpack-compatible sideEffects semantics).
//     esbuild does NOT reproduce the pruning, so it is not a valid guard engine.
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rspack } from '@rspack/core';
import {
  mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync, readFileSync, readdirSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Override point for controls only (NEGATIVE CONTROL A): point the SHIPPED side
// of the comparison at a mutated, staged copy of dist/ without touching the
// repo's real build output. Deliberately NOT applied to the baseline (see
// `stage()`/`workBaseline` below) — the baseline is ground truth for "what a
// non-pruning bundler retains"; if a control's injected regression also mutated
// the baseline, both sides of the diff would be equally broken and nothing could
// ever be detected as a regression (this was caught live: an earlier version of
// this override applied to both sides and NEGATIVE CONTROL A's baseline anchors
// went vacuous instead of the shipped side showing the injected undefined export).
const REAL_DIST = join(root, 'dist');
const DIST = process.env.MDP_TREESHAKE_DIST ?? REAL_DIST;

// Every published entry (the exports map), so no consumer-facing entry is unchecked.
const ENTRIES = Object.entries(pkg.exports)
  .filter(([sub, t]) => sub !== './package.json' && t?.import)
  .map(([sub]) => (sub === '.' ? 'minder-data-provider' : `minder-data-provider/${sub.replace('./', '')}`));

// Independent of ENTRIES.length itself: if the exports map silently loses an
// entry (accidental edit, bad merge), ENTRIES shrinks WITH it, so comparing
// executed-count to ENTRIES.length alone can never notice. This constant is the
// second, independent witness — keep it in sync with package.json's exports map
// IN THE SAME COMMIT as any intentional entry add/remove.
const EXPECTED_ENTRY_COUNT = 31;

// Entries explicitly excluded from the execution probe, with a reason recorded
// inline. Empty today. An entry silently falling out of execution (thrown away by
// a bug in this script, not declared here) is itself a guard failure — see the
// executedEntries assertion below.
const SKIP = [];

// The library's OWN code is internal (resolved + tree-shaken); everything else —
// react, @tanstack, axios, provider peer SDKs, node builtins — is external so the
// only signals in the output come from this package, never a bundled dependency.
const isInternal = (id) =>
  id === 'minder-data-provider' || id.startsWith('minder-data-provider/') ||
  id.startsWith('.') || id.startsWith('/');
const isExternal = (id) => !isInternal(id);

// ---------------------------------------------------------------------------
// SIGNALS — single source of truth for every retention check this guard makes.
// `re` (for text signals) is READ FROM HERE by computeEntry() and the identity
// check below — there is deliberately no second, duplicate regex constant
// anywhere else in this file. A signal that is not wired to its own declared
// `re`/`anchors` is exactly how defect 6 stayed dead after a repair attempt
// (NEGATIVE CONTROL B in the task record mutates `re` here and demands the
// self-test catch it — that control only works because nothing else in this
// file hardcodes its own copy of the pattern).
// Each signal declares `anchors`: baseline entries where it is EXPECTED to fire.
// Before any shipped-vs-baseline comparison, every signal is proven non-vacuous
// against its own anchors. This is what makes "the signal died and nobody
// noticed" (defect 6) structurally hard to repeat.
// ---------------------------------------------------------------------------
const SIGNALS = [
  {
    name: 'exports-defined',
    kind: 'exec',
    field: 'exec', // per-entry data key this signal's snapshots live under (see fires())
    description: 'every named export that has a real value in the baseline must not become undefined/THREW when shipped (namespace-import probe — cheap, but ~17x undercounts real breakage; see named-import-defined)',
    anchors: {
      'minder-data-provider': ['HttpMethod', 'MinderDataProvider'],
      'minder-data-provider/hook': ['useMinder'],
    },
  },
  {
    name: 'named-import-defined',
    kind: 'exec',
    field: 'namedExec', // per-entry data key this signal's snapshots live under (see fires())
    description: 'every named export must not become undefined/THREW when shipped, measured the way a real consumer bundles it: ONE named import per probe module, never batched (batching is vacuous — see header)',
    anchors: {
      'minder-data-provider': ['HttpMethod', 'MinderDataProvider'],
      'minder-data-provider/hook': ['useMinder'],
    },
  },
  {
    name: 'ctx-dedupe',
    kind: 'text',
    description: 'React context creation must be retained (and only for the fork/dedupe identity check below)',
    // engine-agnostic: Rollup `createContext(null)`, Rspack `.createContext)(null)`
    re: /createContext/g,
    anchors: {
      'minder-data-provider': 1,
      'minder-data-provider/hook': 1,
    },
  },
];

const CTX_SIGNAL = SIGNALS.find((s) => s.name === 'ctx-dedupe');
const CTX_RE = CTX_SIGNAL.re; // every match() call below reads THIS, i.e. the signal table's own regex

// Stage the built package under node_modules/ so resolution — including the
// "sideEffects" manifest field — behaves exactly as for a real consumer. Peer
// dependencies (react, axios, provider SDKs, …) are symlinked in as siblings so
// the EXECUTED bundles can actually resolve and run them, not just parse.
function stage(forceSideEffectsTrue, distSource = DIST) {
  const work = mkdtempSync(join(tmpdir(), 'mdp-treeshake-'));
  mkdirSync(join(work, 'node_modules'), { recursive: true });
  for (const d of readdirSync(join(root, 'node_modules'))) {
    try {
      symlinkSync(join(root, 'node_modules', d), join(work, 'node_modules', d));
    } catch {
      // best-effort: a handful of scoped/dot entries may already exist or be unreadable
    }
  }
  const staged = join(work, 'node_modules', 'minder-data-provider');
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  cpSync(distSource, join(staged, 'dist'), { recursive: true });
  const pj = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (forceSideEffectsTrue) pj.sideEffects = true;
  writeFileSync(join(staged, 'package.json'), JSON.stringify(pj));
  return work;
}

const textConsumer = (entry) => `import * as NS from ${JSON.stringify(entry)};\nexport const __keep = NS;\n`;

// The execution probe: for every named export, capture either (a) the JSON of a
// flat const object (so an enum-shaped object's VALUES are compared, not merely
// its type), or (b) `typeof`, or (c) 'THREW' if merely reading it throws. This is
// deliberately generic — it makes no per-export assumption, so it catches a
// dropped context, a dropped enum, or any future shared-singleton class the same
// way: as an unexpected `undefined`/`THREW` where the baseline had a real value.
const execProbe = (entry) => `
import * as NS from ${JSON.stringify(entry)};
export const snapshot = (() => {
  const out = {};
  for (const k of Object.keys(NS)) {
    let v; try { v = NS[k]; } catch { out[k] = 'THREW'; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ks = Object.keys(v);
      if (ks.length && ks.every(x => ['string','number'].includes(typeof v[x]))) { out[k] = JSON.stringify(v); continue; }
    }
    out[k] = typeof v;
  }
  return out;
})();
`;

// The per-export named-import probe (A9/A10): exactly ONE named import per
// bundle — this is what makes it measure real-consumer retention instead of
// the namespace probe's "any reference retains everything" over-approximation.
// Deliberately not batched (see header) — one probe module per export, always.
const namedImportProbe = (entry, exportName) => `
import { ${exportName} as _0 } from ${JSON.stringify(entry)};
export const snapshot = { ${exportName}: _0 === undefined ? 'undefined' : typeof _0 };
`;

async function bundleRollupText(work, code) {
  const f = join(work, `t-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, code);
  const bundle = await rollup({
    input: f,
    plugins: [nodeResolve({ rootDir: work, browser: false, preferBuiltins: true })],
    external: isExternal,
    onwarn: () => {},
  });
  const { output } = await bundle.generate({ format: 'es' });
  await bundle.close();
  return output.map((o) => ('code' in o ? o.code : '')).join('\n');
}

function bundleRspackText(work, code) {
  return new Promise((resolve, reject) => {
    const f = join(work, `t-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(f, code);
    const out = join(work, `rspack-out-${Math.random().toString(36).slice(2)}`);
    const compiler = rspack({
      mode: 'production',
      context: work,
      entry: f,
      externalsType: 'module',
      externals: [(data, cb) => (data.request && isExternal(data.request) ? cb(null, data.request) : cb())],
      optimization: {
        minimize: false, sideEffects: true, usedExports: true, providedExports: true, concatenateModules: false,
      },
      experiments: { outputModule: true },
      output: { path: out, filename: 'b.mjs', module: true, library: { type: 'module' } },
    });
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({ errors: true }).slice(0, 800)));
      const code2 = readdirSync(out).map((f2) => readFileSync(join(out, f2), 'utf8')).join('\n');
      compiler.close(() => resolve(code2));
    });
  });
}

// Rollup EXECUTION pass: write a real file (not just `generate()` in memory) and
// `import()` it. `bundle.write({ file, format: 'es' })` errors ("when building
// multiple chunks, the output.dir option must be used") unless dynamic imports are
// inlined, so `inlineDynamicImports: true` forces one importable file. Shared by
// both the namespace probe (execRollup) and the per-export named-import probe
// (execRollupNamed) — the only difference between the two signals is which probe
// CODE gets bundled, not how the bundling/execution machinery works.
async function execRollupCode(work, code, tag) {
  const f = join(work, `c-${tag}.mjs`);
  writeFileSync(f, code);
  const bundle = await rollup({
    input: f,
    plugins: [nodeResolve({ rootDir: work, browser: false, preferBuiltins: true })],
    external: isExternal,
    onwarn: () => {},
  });
  const outFile = join(work, `o-${tag}.mjs`);
  await bundle.write({ file: outFile, format: 'es', inlineDynamicImports: true });
  await bundle.close();
  const mod = await import(pathToFileURL(outFile).href + '?t=' + Math.random());
  return mod.snapshot;
}

function execRspackCode(work, code, tag) {
  return new Promise((resolve, reject) => {
    const f = join(work, `k-${tag}.mjs`);
    writeFileSync(f, code);
    const out = join(work, `rk-${tag}`);
    const compiler = rspack({
      mode: 'production',
      context: work,
      entry: f,
      externalsType: 'module',
      externals: [(data, cb) => (data.request && isExternal(data.request) ? cb(null, data.request) : cb())],
      optimization: {
        minimize: false, sideEffects: true, usedExports: true, providedExports: true, concatenateModules: false,
      },
      experiments: { outputModule: true },
      output: { path: out, filename: 'b.mjs', module: true, library: { type: 'module' } },
    });
    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({ errors: true }).slice(0, 800)));
      compiler.close(async (closeErr) => {
        if (closeErr) return reject(closeErr);
        try {
          const mod = await import(pathToFileURL(join(out, 'b.mjs')).href + '?t=' + Math.random());
          resolve(mod.snapshot);
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

const execRollup = (work, entry, tag) => execRollupCode(work, execProbe(entry), tag);
const execRspack = (work, entry, tag) => execRspackCode(work, execProbe(entry), tag);

// Per-export named-import probes (A9/A10, named-import-defined signal). Each
// call bundles/runs exactly ONE named import and returns its `typeof` (or
// 'undefined'/'THREW') — never a batch. A rejected bundle (e.g. the export
// genuinely does not exist in this build) is caught by the caller, not here,
// so one broken export can never abort probing the rest of an entry's exports.
const execRollupNamed = async (work, entry, exportName, tag) => {
  const snap = await execRollupCode(work, namedImportProbe(entry, exportName), tag);
  return snap[exportName];
};
const execRspackNamed = async (work, entry, exportName, tag) => {
  const snap = await execRspackCode(work, namedImportProbe(entry, exportName), tag);
  return snap[exportName];
};

// Run the per-export named-import probe for EVERY export of one entry, on both
// engines, against one staged work dir. Returns the same shape as the namespace
// probe's `exec.{rollup,rspack}` snapshots (exportName -> 'string'|'number'|
// 'undefined'|'THREW') so the comparison/anti-vacuity logic below can treat
// `namedExec` exactly like `exec`. A single export's bundle failure is recorded
// as 'THREW' for that export ONLY — it must never drop the export from the
// snapshot (that would silently exclude it from the differential comparison).
async function computeNamedImports(work, entry, exportNames, tag) {
  const rollupOut = {};
  const rspackOut = {};
  for (const name of exportNames) {
    try {
      rollupOut[name] = await execRollupNamed(work, entry, name, `${tag}-${name}-r`);
    } catch {
      rollupOut[name] = 'THREW';
    }
    try {
      rspackOut[name] = await execRspackNamed(work, entry, name, `${tag}-${name}-k`);
    } catch {
      rspackOut[name] = 'THREW';
    }
  }
  return { rollup: rollupOut, rspack: rspackOut };
}

// The set of export names to run the per-export named-import probe against,
// for ONE build variant (baseline or shipped). Sourced from THAT SAME variant's
// own just-computed namespace-probe snapshot (`result.exec`), never from a
// hardcoded list or from the other variant: `Object.keys(NS)` on an ESM
// namespace object always lists every export the module DECLARES, whether or
// not its value ends up initialized — a dropped side-effect makes `NS[key]`
// come back `undefined`, it does not remove `key` from the namespace. Using
// each variant's own keys this way means the named-import probe never has to
// assume the baseline and shipped builds agree on shape ahead of time; it
// just asks "does this build's own declared export surface still resolve?"
// Union of both engines' keys guards against one engine's namespace bundle
// having thrown (see the __THREW checks) while the other still succeeded.
function collectExportNames(exec) {
  const names = new Set();
  for (const engine of ['rollup', 'rspack']) {
    const snap = exec[engine];
    if (snap && !snap.__THREW) {
      for (const k of Object.keys(snap)) names.add(k);
    }
  }
  return [...names];
}

// Compute all signal kinds, on both engines, for one entry against one staged
// work dir. Never throws — an unexpected failure is recorded IN the result (as
// 'THREW'/an Error message) rather than silently dropping the entry from the run,
// so the executedEntries count stays truthful.
//
// Includes the named-import-defined probe (A9/A10): for EVERY export name this
// entry's own namespace probe just discovered, bundle+execute a SEPARATE
// single-named-import module (never batched — see namedImportProbe's header)
// on both engines. This is what makes the guard measure real single-named-
// import consumer retention instead of the namespace probe's "any reference
// retains everything" over-approximation, and it is what previously never ran
// at all — `namedExec` was declared as a signal `field` but nothing in this
// function ever populated it, which is the exact reason 'named-import-defined'
// reported SIGNAL VACUOUS: the anti-vacuity self-test correctly refused to
// trust a signal whose data store was permanently empty.
async function computeEntry(work, entry, tag) {
  const result = {
    ctx: { rollup: 0, rspack: 0 },
    exec: { rollup: null, rspack: null },
    namedExec: { rollup: null, rspack: null },
    execError: {},
  };
  try {
    result.ctx.rollup = (await bundleRollupText(work, textConsumer(entry))).match(CTX_RE)?.length ?? 0;
  } catch (e) {
    result.execError.ctxRollup = String(e).slice(0, 200);
  }
  try {
    result.ctx.rspack = (await bundleRspackText(work, textConsumer(entry))).match(CTX_RE)?.length ?? 0;
  } catch (e) {
    result.execError.ctxRspack = String(e).slice(0, 200);
  }
  try {
    result.exec.rollup = await execRollup(work, entry, `${tag}-r`);
  } catch (e) {
    result.exec.rollup = { __THREW: String(e).slice(0, 200) };
  }
  try {
    result.exec.rspack = await execRspack(work, entry, `${tag}-k`);
  } catch (e) {
    result.exec.rspack = { __THREW: String(e).slice(0, 200) };
  }

  const exportNames = collectExportNames(result.exec);
  if (exportNames.length) {
    try {
      const named = await computeNamedImports(work, entry, exportNames, `${tag}-named`);
      result.namedExec.rollup = named.rollup;
      result.namedExec.rspack = named.rspack;
    } catch (e) {
      result.execError.namedExec = String(e).slice(0, 200);
    }
  }

  return result;
}

function fires(signal, data) {
  for (const [anchorEntry, expectation] of Object.entries(signal.anchors)) {
    const d = data[anchorEntry];
    if (!d) continue;
    if (signal.kind === 'text') {
      if (d.ctx.rollup >= expectation || d.ctx.rspack >= expectation) return true;
    } else if (signal.kind === 'exec') {
      const store = d[signal.field ?? 'exec'];
      if (!store) continue;
      for (const engine of ['rollup', 'rspack']) {
        const snap = store[engine];
        if (!snap || snap.__THREW) continue;
        for (const name of expectation) {
          const v = snap[name];
          if (v !== undefined && v !== 'undefined' && v !== 'THREW') return true;
        }
      }
    }
  }
  return false;
}

const workBaseline = stage(true, REAL_DIST); // forced "sideEffects": true, ALWAYS the real dist/ — ground truth
const workActual = stage(false, DIST);       // the package exactly as it will ship (overridable for controls)
const failures = [];
const summaryLines = [];

try {
  // ---- Pass 1: baseline only, for every entry ----
  const baselineData = {};
  let executedEntries = 0;
  for (const entry of ENTRIES) {
    if (SKIP.includes(entry)) continue;
    baselineData[entry] = await computeEntry(workBaseline, entry, `base-${executedEntries}`);
    executedEntries += 1;
  }

  const expectedExecuted = ENTRIES.length - SKIP.length;
  if (ENTRIES.length !== EXPECTED_ENTRY_COUNT) {
    console.error(
      `verify-consumer-treeshake: ENTRY COUNT MISMATCH — package.json's exports map now yields ` +
      `${ENTRIES.length} entries, but EXPECTED_ENTRY_COUNT in this script is ${EXPECTED_ENTRY_COUNT}. ` +
      `If this is an intentional exports-map change, update EXPECTED_ENTRY_COUNT in the SAME commit. ` +
      `If it is not intentional, an entry was silently lost — that is exactly the failure mode this ` +
      `assertion exists to catch.`,
    );
    process.exit(1);
  }
  if (executedEntries !== expectedExecuted) {
    console.error(
      `verify-consumer-treeshake: EXECUTED-COUNT MISMATCH — expected to execute ${expectedExecuted} ` +
      `entries (${ENTRIES.length} total - ${SKIP.length} skipped) but only ${executedEntries} actually ` +
      `ran. An entry fell out of execution silently instead of being explicitly declared in SKIP.`,
    );
    process.exit(1);
  }

  // ---- Anti-vacuity self-test: every signal must fire on at least one of its
  // own anchors IN THE BASELINE before we trust it to detect anything. This is
  // the check that would have caught defect 6 the moment the enum regex died. ----
  for (const signal of SIGNALS) {
    if (!fires(signal, baselineData)) {
      console.error(
        `SIGNAL VACUOUS: '${signal.name}' was not observed in the BASELINE on any anchor entry.\n` +
        `The guard has gone blind — the emitted shape changed. Re-derive the signal; do NOT\n` +
        `delete the anchor. (This is exactly how the enum signal died at the as-const reshape.)`,
      );
      process.exit(1);
    }
  }

  // ---- Pass 2: shipped, compared against the already-computed baseline ----
  let n = 0;
  for (const entry of ENTRIES) {
    if (SKIP.includes(entry)) continue;
    const label = entry.replace('minder-data-provider', '.');
    const base = baselineData[entry];
    const shipped = await computeEntry(workActual, entry, `ship-${n}`);
    n += 1;

    if (shipped.ctx.rollup < base.ctx.rollup) failures.push(`${label}: Rollup DROPPED React context (createContext ${shipped.ctx.rollup} < baseline ${base.ctx.rollup}) — MDPD-17`);
    if (shipped.ctx.rspack < base.ctx.rspack) failures.push(`${label}: Rspack DROPPED React context (createContext ${shipped.ctx.rspack} < baseline ${base.ctx.rspack}) — MDPD-17`);

    let shippedUndefinedCount = 0;
    let executedExportCount = 0;
    let baselineDefinedCount = 0;
    for (const engine of ['rollup', 'rspack']) {
      const bs = base.exec[engine];
      const as = shipped.exec[engine];
      if (!bs || bs.__THREW) continue; // baseline itself failed to execute — not this signal's concern here
      executedExportCount = Math.max(executedExportCount, Object.keys(bs).length);
      const definedKeys = Object.keys(bs).filter((k) => bs[k] !== 'undefined' && bs[k] !== 'THREW');
      baselineDefinedCount = Math.max(baselineDefinedCount, definedKeys.length);
      if (!as || as.__THREW) {
        failures.push(`${label}: ${engine} shipped build THREW on import (baseline executed cleanly) — ${as?.__THREW ?? 'unknown error'}`);
        shippedUndefinedCount = Math.max(shippedUndefinedCount, definedKeys.length);
        continue;
      }
      const regressed = definedKeys.filter((k) => as[k] !== bs[k]);
      if (regressed.length) {
        shippedUndefinedCount = Math.max(shippedUndefinedCount, regressed.length);
        failures.push(
          `${label}: ${engine} shipped export(s) [${regressed.join(', ')}] regressed vs baseline ` +
          `(e.g. ${regressed[0]}: baseline=${bs[regressed[0]]} shipped=${as[regressed[0]]}) — dabd92d / MDPD-17 class`,
        );
      }
    }

    // named-import-defined (A9/A10): the real signal. Same regression logic as
    // the namespace probe above, but each export was bundled in ITS OWN module
    // (`import { X as _0 } from entry`) — this is what actually reproduces a
    // real consumer's `sideEffects: false` bundle, and it is the check that
    // catches breakage the namespace probe under-counts (see file header).
    let namedShippedUndefinedCount = 0;
    let namedExecutedCount = 0;
    let namedBaselineDefinedCount = 0;
    for (const engine of ['rollup', 'rspack']) {
      const bs = base.namedExec[engine];
      const as = shipped.namedExec[engine];
      if (!bs) continue; // baseline named-import probe didn't run for this engine — not this signal's concern here
      namedExecutedCount = Math.max(namedExecutedCount, Object.keys(bs).length);
      const definedKeys = Object.keys(bs).filter((k) => bs[k] !== 'undefined' && bs[k] !== 'THREW');
      namedBaselineDefinedCount = Math.max(namedBaselineDefinedCount, definedKeys.length);
      if (!as) {
        if (definedKeys.length) {
          failures.push(`${label}: ${engine} named-import probe did not run for the shipped build (baseline had ${definedKeys.length} defined export(s) via single named import)`);
          namedShippedUndefinedCount = Math.max(namedShippedUndefinedCount, definedKeys.length);
        }
        continue;
      }
      const regressed = definedKeys.filter((k) => as[k] !== bs[k]);
      if (regressed.length) {
        namedShippedUndefinedCount = Math.max(namedShippedUndefinedCount, regressed.length);
        failures.push(
          `${label}: ${engine} NAMED IMPORT export(s) [${regressed.join(', ')}] regressed vs baseline ` +
          `(e.g. import { ${regressed[0]} } from '${entry}' -> baseline=${bs[regressed[0]]} ` +
          `shipped=${as[regressed[0]]}) — A9/A10 named-import-defined`,
        );
      }
    }

    summaryLines.push(
      `${label}: executed ${executedExportCount} exports, baseline-defined ${baselineDefinedCount}, ` +
      `shipped-undefined ${shippedUndefinedCount}, named-probed ${namedExecutedCount} baseline-defined ` +
      `${namedBaselineDefinedCount} shipped-undefined ${namedShippedUndefinedCount}, ` +
      `ctx ${shipped.ctx.rollup}/${shipped.ctx.rspack}`,
    );
  }

  // Single-context identity: bundling two context-consuming entries together must
  // NOT increase the context count — the shared context module must dedupe, not
  // fork into two. (Runtime Symbol.for identity is proven separately in Jest.)
  const combinedCode =
    `import * as A from 'minder-data-provider';\nimport * as B from 'minder-data-provider/hook';\nexport const __keep = [A, B];\n`;
  const shippedMain = await computeEntry(workActual, 'minder-data-provider', 'combined-main');
  const shippedHook = await computeEntry(workActual, 'minder-data-provider/hook', 'combined-hook');
  const combR = ((await bundleRollupText(workActual, combinedCode)).match(CTX_RE) ?? []).length;
  const combK = ((await bundleRspackText(workActual, combinedCode)).match(CTX_RE) ?? []).length;
  const ceilingR = Math.max(shippedMain.ctx.rollup, shippedHook.ctx.rollup);
  const ceilingK = Math.max(shippedMain.ctx.rspack, shippedHook.ctx.rspack);
  if (combR > ceilingR) failures.push(`identity: Rollup combined main+hook has ${combR} createContext > ${ceilingR} — context module FORKED (not deduped)`);
  if (combK > ceilingK) failures.push(`identity: Rspack combined main+hook has ${combK} createContext > ${ceilingK} — context module FORKED (not deduped)`);
} finally {
  rmSync(workBaseline, { recursive: true, force: true });
  rmSync(workActual, { recursive: true, force: true });
}

if (failures.length) {
  console.error('verify-consumer-treeshake: FAIL — a shipped-package bundle dropped, forked, or broke a side effect:\n');
  for (const f of failures) console.error('  - ' + f);
  console.error(
    '\nsideEffects: false is only safe while every cross-entry singleton is behind either a lazy\n' +
    'getter with globalThis identity (src/core/singletons.ts) OR a local concrete-value binding\n' +
    'that forces bundlers to retain the initializer (see src/index.ts\'s HttpMethod re-export).\n' +
    'Fix the regression, or (last resort, kill-switch) set package.json "sideEffects": true and rebuild.',
  );
  process.exit(1);
}

console.log(
  `verify-consumer-treeshake: OK — ${ENTRIES.length} entries x 2 engines (Rollup + Rspack), differential ` +
  `execution probe (defect-6 revival: exports-defined + ctx-dedupe, both anchor-verified non-vacuous). ` +
  `sideEffects="${pkg.sideEffects}".\n  ${summaryLines.join('\n  ')}`,
);
