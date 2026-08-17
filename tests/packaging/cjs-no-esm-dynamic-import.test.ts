/**
 * @jest-environment node
 *
 * Forced to the "node" environment (root jest's default is "jsdom" for the
 * rest of the suite): esbuild's native binary bridge needs real Node
 * Buffer/Uint8Array semantics, and jest-environment-jsdom's patched globals
 * break esbuild's own startup invariant check ("Buffer.from('') instanceof
 * Uint8Array is incorrectly false") — verified empirically, this file fails
 * to even import 'esbuild' under the default jsdom environment.
 */

/**
 * Packaging invariant guard (dist-artifact level, not source level).
 *
 * Regression: a recent change (62bad54) made axios/dompurify lazy via a bare
 * `import(...)`. tsup's tree-shaking pass hands the CJS build to Rollup's
 * `bundle.generate({ format: 'cjs' })`, which — Rollup >=3 default
 * `output.dynamicImportInCjs: true` — leaves that `import(...)` as literal
 * ESM-only syntax inside the emitted .js file. That is fatal in any CJS VM
 * without `--experimental-vm-modules` (Jest, jest-expo, ts-node CJS, plain
 * `require()` consumers): "A dynamic import callback was invoked without
 * --experimental-vm-modules". `scripts/downlevel-cjs-dynamic-import.mjs`
 * fixes this post-build by lowering every `import(...)` found in
 * `dist/**\/*.js` to `Promise.resolve().then(() => require(...))` via
 * esbuild's `supported: { 'dynamic-import': false }`.
 *
 * This file asserts the invariant that fix must hold:
 *   (a) dist/**\/*.js (CJS) contains ZERO real ESM-only `import(...)`
 *       expressions — parser-verified via esbuild, not a text grep (a text
 *       grep also matches "import(" appearing inside unrelated string
 *       literals, e.g. the pre-existing `new Function('return import(...)')`
 *       netinfo probe in src/platform/adapters/network/NativeNetworkAdapter.ts
 *       — deliberately hidden from bundler static analysis, not a real
 *       `import()` expression, and out of this task's scope).
 *   (b) dist/**\/*.mjs (ESM) STILL contains real `import('dompurify')` and
 *       `import('./responseValidation-*.mjs')` boundaries — the laziness
 *       half of the invariant. This must fail if a future "fix" makes the
 *       ESM artifact static instead of touching only the CJS downlevel step.
 *   (c) dist/platforms/expo.mjs (the entry jest-expo/Metro actually resolve
 *       for React Native / Expo) still transitively resolves through a chunk
 *       carrying `import('dompurify')` — i.e. the RN/Expo consumer's ESM
 *       artifact keeps the lazy boundary too.
 *
 * Guarded with a hard existsSync(dist) FAIL, not a skip: the sibling
 * dist-level test (tests/dist-entry-exports.test.ts) silently skips when
 * dist/ is absent, and CI ran `npm test` BEFORE `npm run build` — which is
 * exactly how this regression shipped unnoticed. `test:packaging` runs
 * strictly after the Build step (package.json script + CI workflow), so
 * dist/ must exist by the time this file runs; if it doesn't, that ordering
 * broke and this must fail loudly, not skip quietly.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import * as esbuild from 'esbuild';

const distDir = resolve(__dirname, '../../dist');

if (!existsSync(distDir)) {
  // Hard fail — see file header. `test()` bodies below would report
  // "no tests found" style false-negatives; failing at collection time
  // is impossible to miss.
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone — see ' +
      'the "test:packaging" wiring in package.json and .github/workflows/ci.yml.',
  );
}

function walkFiles(dir: string, extension: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, extension, out);
    } else if (entry.endsWith(extension) && !entry.endsWith('.d.ts') && !entry.endsWith('.map')) {
      out.push(full);
    }
  }
  return out;
}

// Same lockstep-with-tsup.config.ts target/minify as
// scripts/downlevel-cjs-dynamic-import.mjs, so this test exercises the exact
// transform the build uses.
const TARGET = 'es2020';
const MINIFY = true;

function countDeferredRequire(code: string): number {
  return (code.match(/Promise\.resolve\(\)\.then\(\(\)\s*=>/g) ?? []).length;
}

describe('CJS build never emits ESM-only import() (dist/**/*.js)', () => {
  const jsFiles = walkFiles(distDir, '.js');

  // Sanity: the build actually produced CJS files to check. If this is 0,
  // tsup's output shape changed and the rest of this suite is vacuous.
  test('dist contains CJS .js files to check', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  test.each(jsFiles.map((f) => [f.replace(`${distDir}/`, '')]))(
    '%s is already a fixed point under the dynamic-import-lowering transform',
    (relPath) => {
      const file = join(distDir, relPath);
      const code = readFileSync(file, 'utf8');

      const result = esbuild.transformSync(code, {
        format: 'cjs',
        target: TARGET,
        minify: MINIFY,
        legalComments: 'none',
        supported: { 'dynamic-import': false },
      });

      const before = countDeferredRequire(code);
      const after = countDeferredRequire(result.code);

      // If `after > before`, the transform LOWERED a real `import(...)`
      // expression that was still present in the shipped file — i.e. this
      // file was NOT already a fixed point, meaning downlevel-cjs-dynamic-
      // import.mjs missed it (or never ran). A file that merely contains the
      // TEXT "import(" inside a string literal (e.g. the netinfo probe) is
      // NOT parsed as an expression by esbuild, so it introduces no new
      // occurrences here and correctly passes.
      expect(after).toBe(before);
    },
  );
});

describe('ESM build keeps its real lazy import() boundaries (dist/**/*.mjs)', () => {
  const mjsFiles = walkFiles(distDir, '.mjs');
  const allMjsCode = mjsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

  test('dist contains ESM .mjs files to check', () => {
    expect(mjsFiles.length).toBeGreaterThan(0);
  });

  test('some .mjs file still contains a real import(\'dompurify\') boundary', () => {
    expect(allMjsCode).toMatch(/import\((["'])dompurify\1\)/);
  });

  test('some .mjs file still contains a real responseValidation import() boundary', () => {
    expect(allMjsCode).toMatch(/import\((["'])\.\/responseValidation-[\w.-]+\1\)/);
  });
});

describe('dist/platforms/expo.mjs (the RN/Expo entry) keeps the dompurify lazy boundary', () => {
  const expoEntry = join(distDir, 'platforms', 'expo.mjs');

  test('dist/platforms/expo.mjs exists', () => {
    expect(existsSync(expoEntry)).toBe(true);
  });

  test('a chunk transitively referenced by expo.mjs carries import(\'dompurify\')', () => {
    const entryDir = dirname(expoEntry);
    const entryCode = readFileSync(expoEntry, 'utf8');

    // Follow every `from '...mjs'` / `import '...mjs'` reference one hop —
    // matches how Rollup/Metro/esbuild resolve tsup's split-chunk ESM output.
    // Deliberately NOT hardcoding a chunk hash: hashes are content-derived
    // and change across builds/versions.
    const refs = new Set<string>();
    const refRe = /(?:from|import)\s*(["'])(\.\.?\/[^"']+\.mjs)\1/g;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(entryCode))) {
      refs.add(resolve(entryDir, m[2]));
    }

    expect(refs.size).toBeGreaterThan(0);

    const dompurifyImportRe = /import\((["'])dompurify\1\)/;
    let found = false;
    for (const ref of refs) {
      if (!existsSync(ref)) continue;
      const code = readFileSync(ref, 'utf8');
      if (dompurifyImportRe.test(code)) {
        found = true;
        break;
      }
    }

    expect(found).toBe(true);
  });
});
