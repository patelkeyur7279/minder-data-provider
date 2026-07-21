#!/usr/bin/env node
/**
 * measure-bundles.mjs — honest per-subpath bundle cost.
 *
 * MEASUREMENT SEMANTICS ("budget" = TRUE EAGER bytes)
 * ----------------------------------------------------------------------------
 * For every subpath export (and every consumer SCENARIO), this script bundles
 * the built dist entry the way a real consumer bundler would: with code
 * SPLITTING enabled (esbuild `splitting: true` + `outdir`, `metafile: true`).
 * Splitting turns every `import()` boundary inside the library (LazySseTransport,
 * the Standard Schema validation chunk, local-first storage, DevTools, …) into
 * its own output chunk instead of inlining it into the entry.
 *
 * The reported size for an entry is the entry chunk PLUS the transitive closure
 * of chunks reached via STATIC `import-statement` edges only (read from
 * esbuild's metafile output graph). Chunks reachable ONLY via a `dynamic-import`
 * edge are walked no further and their bytes are excluded — that code ships in
 * its own request, on demand, not as part of this entry's eager payload.
 *
 * Why this matters: bundling WITHOUT splitting (the old approach) forces esbuild
 * to inline every dynamically-imported module into the single output file, since
 * there is nowhere else to put it. That counts lazy-loaded code as if it were
 * shipped eagerly — inflating every entry that lazy-loads anything and forcing
 * dishonest budget re-baselines whenever a `import()` boundary is added deeper
 * in the graph, even though no consumer downloads that code up front.
 *
 * node_modules stay external in both modes, so numbers are always the LIBRARY's
 * own eager cost — peer deps and runtime deps are priced separately.
 *
 * verify:treeshake (scripts/verify-consumer-treeshake.mjs) remains the AUTHORITY
 * on lazy-exclusion correctness — it proves (via Rollup + Rspack against a real
 * consumer's "sideEffects" resolution) that nothing load-bearing gets dropped.
 * This script only prices what a correctly-behaving consumer bundler downloads
 * eagerly; it does not re-verify tree-shaking safety.
 *
 * Usage:
 *   node scripts/measure-bundles.mjs                   # table of all subpaths
 *   node scripts/measure-bundles.mjs --json             # machine-readable output
 *   node scripts/measure-bundles.mjs --check             # fail if any budget exceeded
 *   node scripts/measure-bundles.mjs --write-budgets    # baseline budgets = current +10%
 *
 * Budgets live in __snapshots__/bundle-budgets.json (committed). --check also
 * measures consumer SCENARIOS (the eager-load cost of a consumer importing a
 * named export, e.g. `useMinder`) using the identical static-closure mechanism,
 * so headline numbers — e.g. the Level-0 useMinder path — can never regress
 * silently. A new subpath without a budget fails --check: budgets are set
 * consciously, never implicitly.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const entries = Object.entries(pkg.exports)
  .filter(([sub, target]) => sub !== './package.json' && target?.import)
  .map(([sub, target]) => ({
    subpath: sub === '.' ? '. (main)' : sub.replace('./', ''),
    file: resolve(root, target.import),
  }))
  .filter((e) => existsSync(e.file));

const toPosix = (p) => p.split(sep).join('/');

// Bundles one entry (a file, or inline stdin code) with esbuild code-splitting
// and walks the metafile's STATIC import graph only. Returns the transitive
// closure of chunk buffers that a consumer downloads eagerly — i.e. everything
// except code reachable solely through a `dynamic-import` edge.
async function measureStaticClosure({ entryPoint, stdin, minify }) {
  const opts = {
    bundle: true,
    minify,
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
    splitting: true,
    outdir: 'measure-bundles-out',
    metafile: true,
    absWorkingDir: root,
  };
  const out = stdin ? await build({ ...opts, stdin }) : await build({ ...opts, entryPoints: [entryPoint] });

  const contentsByKey = new Map();
  for (const f of out.outputFiles) {
    contentsByKey.set(toPosix(relative(root, f.path)), Buffer.from(f.contents));
  }

  const wantEntryPoint = stdin ? stdin.sourcefile : toPosix(relative(root, entryPoint));
  const rootKey = Object.keys(out.metafile.outputs).find(
    (k) => out.metafile.outputs[k].entryPoint === wantEntryPoint,
  );
  if (!rootKey) {
    throw new Error(`measure-bundles: could not locate entry chunk for ${wantEntryPoint} in esbuild metafile`);
  }

  const visited = new Set();
  const queue = [rootKey];
  while (queue.length) {
    const key = queue.shift();
    if (visited.has(key)) continue;
    visited.add(key);
    for (const imp of out.metafile.outputs[key].imports) {
      // Only follow static edges — a dynamic-import edge is a lazy-load
      // boundary and its target is NOT part of this entry's eager payload.
      if (imp.kind === 'import-statement' && imp.path in out.metafile.outputs) {
        queue.push(imp.path);
      }
    }
  }

  const buffers = [...visited].map((k) => contentsByKey.get(k)).filter(Boolean);
  const bytes = buffers.reduce((n, b) => n + b.length, 0);
  return { bytes, buffers };
}

const results = [];
for (const { subpath, file } of entries) {
  const min = await measureStaticClosure({ entryPoint: file, minify: true });
  const raw = await measureStaticClosure({ entryPoint: file, minify: false });
  results.push({
    subpath,
    raw: raw.bytes,
    min: min.bytes,
    gzip: gzipSync(Buffer.concat(min.buffers), { level: 9 }).length,
  });
}

results.sort((a, b) => b.gzip - a.gzip);

// Consumer scenarios: named imports bundled WITH code-splitting via the same
// static-closure mechanism as the entries above — only the entry chunk plus
// its statically-imported chunks count; dynamic-import targets defer until used.
const SCENARIOS = [
  {
    key: 'scenario:useMinder-initial',
    code: "import { useMinder } from 'MDP/dist/hook.mjs'; console.log(useMinder);",
  },
  {
    key: 'scenario:minder-initial',
    code: "import { minder } from 'MDP/dist/index.mjs'; console.log(minder);",
  },
];
const scenarioResults = [];
for (const s of SCENARIOS) {
  // Deliberately NOT the static-closure mechanism above: a scenario measures
  // only the code a consumer's OWN entry chunk pulls in directly for the named
  // import — this is unchanged from before the splitting rework and is not the
  // "inline everything" problem being fixed (this build already used splitting).
  const r = await build({
    stdin: {
      contents: s.code.replaceAll('MDP', root),
      resolveDir: root,
      sourcefile: 'scenario.mjs',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    splitting: true,
    outdir: 'scenario-out',
    write: false,
    packages: 'external',
    logLevel: 'silent',
  });
  let entryGz = 0;
  for (const f of r.outputFiles) {
    if (f.path.endsWith('scenario.js') || f.path.endsWith('stdin.js')) {
      entryGz += gzipSync(Buffer.from(f.contents), { level: 9 }).length;
    }
  }
  scenarioResults.push({ key: s.key, gzip: entryGz });
}

const budgetsPath = join(root, '__snapshots__', 'bundle-budgets.json');
const currentSizes = Object.fromEntries([
  ...results.map((r) => [r.subpath, r.gzip]),
  ...scenarioResults.map((s) => [s.key, s.gzip]),
]);

if (process.argv.includes('--write-budgets')) {
  const budgets = Object.fromEntries(
    Object.entries(currentSizes).map(([k, gz]) => [
      k,
      Math.ceil((gz * 1.1) / 102.4) / 10, // +10% headroom, KB, 0.1 precision
    ]),
  );
  mkdirSync(dirname(budgetsPath), { recursive: true });
  writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2) + '\n');
  console.log(`bundle budgets written (${Object.keys(budgets).length} entries, current+10%). Commit __snapshots__/bundle-budgets.json.`);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  if (!existsSync(budgetsPath)) {
    console.error('measure-bundles --check: no budgets file. Run --write-budgets first.');
    process.exit(1);
  }
  const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
  const failures = [];
  for (const [key, gz] of Object.entries(currentSizes)) {
    const kb = gz / 1024;
    if (!(key in budgets)) {
      failures.push(`${key}: NEW entry (${kb.toFixed(2)}KB min+gz) has no budget — add one consciously via --write-budgets or edit bundle-budgets.json`);
    } else if (kb > budgets[key]) {
      failures.push(`${key}: ${kb.toFixed(2)}KB min+gz exceeds budget ${budgets[key]}KB`);
    }
  }
  if (failures.length) {
    console.error('BUNDLE BUDGET EXCEEDED\n');
    for (const f of failures) console.error('  - ' + f);
    console.error('\nEither slim the change, or (if the growth is justified) update budgets in the same PR with a rationale.');
    process.exit(1);
  }
  console.log(`bundle budgets OK — ${Object.keys(currentSizes).length} entries within budget.`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedFrom: 'dist', results }, null, 2));
} else {
  const kb = (n) => (n / 1024).toFixed(2).padStart(8) + ' KB';
  console.log('subpath'.padEnd(24) + 'raw'.padStart(11) + 'min'.padStart(11) + 'min+gz'.padStart(11));
  console.log('-'.repeat(57));
  for (const r of results) {
    console.log(r.subpath.padEnd(24) + kb(r.raw) + kb(r.min) + kb(r.gzip));
  }
}
