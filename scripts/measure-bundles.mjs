#!/usr/bin/env node
/**
 * measure-bundles.mjs — honest per-subpath bundle cost.
 *
 * For every subpath export, bundles the built dist entry the way a consumer's
 * bundler would (entry + transitive shared chunks), minifies, and reports
 * raw / minified / min+gzip sizes. All node_modules stay external, so numbers
 * are the LIBRARY's own cost — peer deps and runtime deps priced separately.
 *
 * Usage:
 *   node scripts/measure-bundles.mjs                   # table of all subpaths
 *   node scripts/measure-bundles.mjs --json            # machine-readable output
 *   node scripts/measure-bundles.mjs --check           # fail if any budget exceeded
 *   node scripts/measure-bundles.mjs --write-budgets   # baseline budgets = current +10%
 *
 * Budgets live in __snapshots__/bundle-budgets.json (committed). --check also
 * measures consumer SCENARIOS (code-split initial-load cost of common imports)
 * so headline numbers — e.g. the Level-0 useMinder path — can never regress
 * silently. A new subpath without a budget fails --check: budgets are set
 * consciously, never implicitly.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
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

const results = [];
for (const { subpath, file } of entries) {
  const out = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
  });
  const minified = Buffer.concat(out.outputFiles.map((f) => Buffer.from(f.contents)));
  const raw = await build({
    entryPoints: [file],
    bundle: true,
    minify: false,
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
  });
  const rawBytes = raw.outputFiles.reduce((n, f) => n + f.contents.length, 0);
  results.push({
    subpath,
    raw: rawBytes,
    min: minified.length,
    gzip: gzipSync(minified, { level: 9 }).length,
  });
}

results.sort((a, b) => b.gzip - a.gzip);

// Consumer scenarios: named imports bundled WITH code-splitting; only the
// initial (entry) chunk counts — dynamic-import chunks defer until used.
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
