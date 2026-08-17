#!/usr/bin/env node
/**
 * verify-api-surface.mjs — public API snapshot gate (P1: the API is sacred).
 *
 * Two complementary surfaces, both from built dist:
 *  - runtime: exported names per subpath, via esbuild metafile (never executes code,
 *    so react-native/provider entries with absent peers snapshot fine)
 *  - types:   tsnapi-generated .d.ts surface, normalized so internal churn
 *    (content-hash chunk names, minified re-export aliases) never shows up —
 *    only genuine public-surface changes do.
 *
 * Usage:
 *   node scripts/verify-api-surface.mjs            # verify against committed snapshots
 *   node scripts/verify-api-surface.mjs --update   # rewrite the baseline
 *
 * Snapshots live in __snapshots__/api/ and MUST be committed. A verify failure
 * means the public API changed: either revert the change, or update the baseline
 * in the same PR with a semver impact note (patch/minor/major).
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync,
} from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapDir = join(root, '__snapshots__', 'api');
const update = process.argv.includes('--update');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const entries = Object.entries(pkg.exports)
  .filter(([sub, t]) => sub !== './package.json' && t?.import)
  .map(([sub, t]) => ({
    name: sub === '.' ? 'index' : sub.replace('./', '').replaceAll('/', '__'),
    file: resolve(root, t.import),
  }));

// --- runtime surface: export names via esbuild metafile (no execution) ---
const runtime = {};
for (const { name, file } of entries) {
  const r = await build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    packages: 'external',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const out = Object.values(r.metafile.outputs)[0];
  runtime[name] = (out.exports ?? []).slice().sort();
}
const runtimeSnapshot = JSON.stringify(runtime, null, 2) + '\n';

// --- type surface: tsnapi output, normalized ---
const scratch = join(tmpdir(), `minder-api-surface-${process.pid}`);
rmSync(scratch, { recursive: true, force: true });
execFileSync('npx', ['tsnapi', '-u', '-o', scratch], { cwd: root, stdio: 'pipe' });

const normalize = (s) =>
  s
    // content-hash suffixes in chunk file references: types-TxkWaWJ5.js -> types-HASH.js
    .replace(/-[A-Za-z0-9_-]{8}\.js/g, '-HASH.js')
    // minified internal re-export aliases: "export { j as Foo }" -> "export { _ as Foo }"
    .replace(/\{ ([A-Za-z_$][\w$]*) as /g, '{ _ as ')
    .replace(/, ([A-Za-z_$][\w$]*) as /g, ', _ as ');

const collectDts = (dir) => {
  const files = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.snapshot.d.ts')) {
        files[relative(dir, p)] = normalize(readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return files;
};
const types = collectDts(scratch);
rmSync(scratch, { recursive: true, force: true });

// --- write or verify ---
if (update) {
  rmSync(snapDir, { recursive: true, force: true });
  mkdirSync(snapDir, { recursive: true });
  writeFileSync(join(snapDir, 'runtime-exports.json'), runtimeSnapshot);
  for (const [rel, content] of Object.entries(types)) {
    const p = join(snapDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  console.log(
    `verify-api-surface: baseline updated — ${entries.length} entries, ` +
    `${Object.keys(types).length} type snapshots. Commit __snapshots__/api/ with a semver impact note.`,
  );
} else {
  const failures = [];
  const committedRuntime = existsSync(join(snapDir, 'runtime-exports.json'))
    ? readFileSync(join(snapDir, 'runtime-exports.json'), 'utf8')
    : null;
  if (committedRuntime === null) {
    console.error('verify-api-surface: no baseline found. Run with --update first.');
    process.exit(1);
  }
  if (committedRuntime !== runtimeSnapshot) {
    const before = JSON.parse(committedRuntime);
    for (const name of new Set([...Object.keys(before), ...Object.keys(runtime)])) {
      const a = new Set(before[name] ?? []);
      const b = new Set(runtime[name] ?? []);
      const removed = [...a].filter((x) => !b.has(x));
      const added = [...b].filter((x) => !a.has(x));
      if (removed.length) failures.push(`${name}: REMOVED exports: ${removed.join(', ')}`);
      if (added.length) failures.push(`${name}: added exports: ${added.join(', ')}`);
    }
  }
  for (const [rel, content] of Object.entries(types)) {
    const p = join(snapDir, rel);
    if (!existsSync(p)) failures.push(`${rel}: type snapshot missing from baseline`);
    else if (readFileSync(p, 'utf8') !== content) failures.push(`${rel}: type surface changed`);
  }
  for (const rel of readdirSync(snapDir, { recursive: true })) {
    const relStr = String(rel);
    if (relStr.endsWith('.snapshot.d.ts') && !(relStr in types)) {
      failures.push(`${relStr}: entry removed from exports map`);
    }
  }
  if (failures.length) {
    console.error('verify-api-surface: PUBLIC API CHANGED\n');
    for (const f of failures) console.error('  - ' + f);
    console.error(
      '\nIf intentional: run `npm run snapshot:api`, commit __snapshots__/api/,' +
      ' and state the semver impact (patch/minor/major) in the PR.',
    );
    process.exit(1);
  }
  console.log(`verify-api-surface: OK — public API matches baseline (${entries.length} entries).`);
}
