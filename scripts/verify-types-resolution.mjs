#!/usr/bin/env node
/**
 * verify-types-resolution.mjs — ADR-A guard (node10/node `moduleResolution`
 * type-resolution for every subpath export).
 *
 * `exports` in package.json is ignored ENTIRELY under `moduleResolution:
 * node10`/`node` (the DEFAULT whenever `module: commonjs` and no explicit
 * `moduleResolution` — old Next, CRA-era projects, ts-node, many Jest
 * setups): only the root `types` field resolves, so every deep subpath
 * import (`minder-data-provider/logger`, `.../server`, ...) fails TS2307
 * for a consumer on that resolution mode. `typesVersions` is the documented
 * TypeScript fallback for exactly this — this script is what makes the
 * MAPPING between the two structurally hard to let drift, in three stages:
 *
 *   1. Parity (pure, fast): package.json's `exports` and `typesVersions["*"]`
 *      must describe the IDENTICAL set of subpaths, byte-for-byte on the
 *      `.types` target. A new `exports` subpath added without a matching
 *      `typesVersions` entry fails here — the structural anti-omission
 *      property this guard exists for.
 *   2. Existence: every mapped `typesVersions` target file actually exists
 *      under `dist/` (requires a build — see the sequencing note below).
 *   3. Real resolution: `npm pack` the real tarball, `npm install` it into a
 *      throwaway consumer OUTSIDE this repo (a real `node_modules`
 *      resolution, not a `moduleNameMapper`/symlink shortcut), generate a
 *      single `.ts` file importing EVERY subpath read from the INSTALLED
 *      package's own `exports` map, and run the repo's own `tsc` three
 *      times — `node10`, `bundler`, `nodenext` — asserting zero `TS2307`
 *      mentioning the package name in any of the three.
 *
 * SEQUENCING (load-bearing): stage 2 needs a built `dist/`; stage 3's
 * `npm pack` triggers the `prepack` hook (`generate:bundle-sizes`), which
 * itself requires `dist/` to exist. This script MUST run after `npm run
 * build` — wired into `release:check`/`prepublishOnly` immediately after
 * `verify-build` — and must never run in a read-only or parallel-agent
 * phase (it packs + installs into a real temp directory).
 *
 * `verify:api` interaction: NONE. scripts/verify-api-surface.mjs builds its
 * entry list from `pkg.exports` only and never reads `typesVersions`; a
 * `package.json`-only change here produces no `__snapshots__/api/` diff. If
 * one appears anyway, something ELSE changed — that is a bug in THAT change,
 * not evidence this script needs `snapshot:api` re-run.
 */
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const tscBin = join(repoRoot, 'node_modules', '.bin', 'tsc');

let failures = 0;
function fail(stage, message) {
  failures++;
  console.error(`[verify:types] STAGE ${stage} FAILURE: ${message}`);
}
function ok(message) {
  console.log(`[verify:types] ${message}`);
}

// ── Stage 1: parity (pure) ──────────────────────────────────────────────
function stage1Parity() {
  const exportEntries = Object.entries(pkg.exports || {}).filter(
    ([sub]) => sub !== '.' && sub !== './package.json'
  );
  const tv = (pkg.typesVersions && pkg.typesVersions['*']) || null;

  if (!tv) {
    fail(1, 'package.json has no typesVersions["*"] map at all.');
    return;
  }

  const forbiddenKeys = ['*', '.', 'index'];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(tv, key)) {
      fail(
        1,
        `typesVersions["*"] must not contain the key "${key}" — the root already resolves via ` +
          `the top-level "types" field; a catch-all/root key here changes resolution behavior ` +
          `that was deliberately measured and rejected (see the ADR).`
      );
    }
  }

  const expectedKeys = new Set(exportEntries.map(([sub]) => sub.slice(2)));
  const actualKeys = new Set(Object.keys(tv));

  for (const sub of expectedKeys) {
    if (!actualKeys.has(sub)) {
      fail(1, `exports["./${sub}"] has no matching typesVersions["*"]["${sub}"] entry.`);
    }
  }
  for (const key of actualKeys) {
    if (!expectedKeys.has(key) && !forbiddenKeys.includes(key)) {
      fail(
        1,
        `typesVersions["*"]["${key}"] does not correspond to any exports subpath — remove it ` +
          `or add the matching "./${key}" export.`
      );
    }
  }

  for (const [sub, target] of exportEntries) {
    const key = sub.slice(2);
    const expected = target && typeof target === 'object' ? target.types : undefined;
    const actual = tv[key];
    if (expected === undefined) continue; // not a conditional-exports entry; nothing to compare
    const actualIsExactSingleton =
      Array.isArray(actual) && actual.length === 1 && actual[0] === expected;
    if (!actualIsExactSingleton) {
      fail(
        1,
        `typesVersions["*"]["${key}"] = ${JSON.stringify(actual)} does not deep-equal ` +
          `[${JSON.stringify(expected)}] (exports["${sub}"].types).`
      );
    }
  }

  const floor = 31 - 1; // 31 subpaths total, minus "." — "./package.json" was already excluded above
  if (actualKeys.size < floor) {
    fail(
      1,
      `typesVersions["*"] has only ${actualKeys.size} entries; the floor is ${floor} (31 total ` +
        `exports subpaths, minus the root "."). A subpath was removed without updating this guard, ` +
        `or this guard's floor needs a deliberate, reviewed raise alongside a real exports change.`
    );
  }

  if (failures === 0) {
    ok(`stage 1 (parity): ${actualKeys.size} typesVersions entries match exports 1:1.`);
  }
}

// ── Stage 2: existence (requires a build) ───────────────────────────────
function stage2Existence() {
  const tv = pkg.typesVersions && pkg.typesVersions['*'];
  if (!tv) return; // stage 1 already failed loudly for this
  let missing = [];
  for (const [key, targets] of Object.entries(tv)) {
    for (const target of targets) {
      const abs = join(repoRoot, target);
      if (!existsSync(abs)) {
        missing.push(`"${key}" -> ${target}`);
      }
    }
  }
  if (missing.length > 0) {
    fail(
      2,
      `${missing.length} typesVersions target(s) do not exist under dist/ — run \`npm run build\` ` +
        `first. Missing: ${missing.join(', ')}`
    );
    return;
  }
  ok(`stage 2 (existence): every typesVersions target exists under dist/.`);
}

// ── Stage 3: real resolution (packed tarball, installed OUTSIDE the repo) ─
function runTsc(dir, label, extraFlags) {
  try {
    const out = execFileSync(
      tscBin,
      [
        '--noEmit',
        '--strict', 'false',
        '--skipLibCheck',
        '--esModuleInterop',
        '--target', 'esnext',
        ...extraFlags,
        'index.ts',
      ],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { output: out, threw: false };
  } catch (err) {
    // tsc exits non-zero on ANY diagnostic — expected; we only care whether
    // TS2307 mentioning the package name appears in the output.
    const output = `${err.stdout || ''}${err.stderr || ''}`;
    return { output, threw: true };
  }
}

function assertNoTs2307(label, output) {
  const lines = output.split('\n').filter((l) => l.includes('TS2307') && l.includes(pkg.name));
  if (lines.length > 0) {
    fail(
      3,
      `[${label}] ${lines.length} TS2307 error(s) resolving "${pkg.name}" subpaths:\n` +
        lines.map((l) => `    ${l}`).join('\n')
    );
    return false;
  }
  ok(`stage 3 (${label}): 0 TS2307 for "${pkg.name}" subpaths.`);
  return true;
}

function stage3RealResolution() {
  if (!existsSync(join(repoRoot, 'dist'))) {
    fail(3, 'dist/ does not exist — run `npm run build` first.');
    return;
  }

  const scratchRoot = mkdtempSync(join(tmpdir(), 'minder-verify-types-'));
  const packDestDir = mkdtempSync(join(tmpdir(), 'minder-verify-types-pack-'));
  try {
    ok(`packing tarball (scratch consumer OUTSIDE the repo: ${scratchRoot})`);
    const packStdout = execFileSync(
      'npm',
      ['pack', '--silent', '--pack-destination', packDestDir],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    const tarballName = packStdout.trim().split('\n').filter(Boolean).pop()?.trim();
    if (!tarballName) {
      fail(3, `npm pack produced no tarball name (stdout: ${JSON.stringify(packStdout)}).`);
      return;
    }
    const tarballPath = join(packDestDir, tarballName);
    if (!existsSync(tarballPath)) {
      fail(3, `npm pack reported "${tarballName}" but it does not exist at ${tarballPath}.`);
      return;
    }

    writeFileSync(
      join(scratchRoot, 'package.json'),
      JSON.stringify({ name: 'minder-verify-types-consumer', version: '0.0.0', private: true }, null, 2)
    );

    execFileSync(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--silent',
        '--no-save',
        tarballPath,
        'react@19',
        'react-dom@19',
        '@tanstack/react-query@5.90.6',
        '@tanstack/query-core@5.90.6',
        'typescript@5.9.3',
      ],
      { cwd: scratchRoot, stdio: ['ignore', 'inherit', 'inherit'] }
    );

    const installedPkgPath = join(scratchRoot, 'node_modules', pkg.name, 'package.json');
    if (!existsSync(installedPkgPath)) {
      fail(3, `installed package not found at ${installedPkgPath}.`);
      return;
    }
    const installedPkg = JSON.parse(readFileSync(installedPkgPath, 'utf8'));
    const subpaths = Object.keys(installedPkg.exports || {}).filter(
      (sub) => sub !== './package.json'
    );

    const importLines = subpaths.map((sub, i) => {
      const specifier = sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      return `import * as mod${i} from ${JSON.stringify(specifier)}; void mod${i};`;
    });
    writeFileSync(join(scratchRoot, 'index.ts'), importLines.join('\n') + '\n');

    ok(`generated index.ts importing all ${subpaths.length} subpaths from the installed package's own exports.`);

    const node10 = runTsc(scratchRoot, 'node10', [
      '--module', 'commonjs',
      '--moduleResolution', 'node10',
    ]);
    assertNoTs2307('node10', node10.output);

    const bundler = runTsc(scratchRoot, 'bundler', [
      '--module', 'esnext',
      '--moduleResolution', 'bundler',
    ]);
    assertNoTs2307('bundler', bundler.output);

    const nodenext = runTsc(scratchRoot, 'nodenext', [
      '--module', 'nodenext',
      '--moduleResolution', 'nodenext',
    ]);
    assertNoTs2307('nodenext', nodenext.output);
  } catch (err) {
    fail(3, `unexpected error during real-resolution check: ${err?.message || err}`);
  } finally {
    try {
      rmSync(scratchRoot, { recursive: true, force: true });
      rmSync(packDestDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
}

stage1Parity();
stage2Existence();
stage3RealResolution();

if (failures > 0) {
  console.error(`\n[verify:types] FAILED — ${failures} failure(s) across the three stages above.`);
  process.exit(1);
}
console.log('\n[verify:types] PASSED — typesVersions parity, existence, and real tsc resolution all green.');
