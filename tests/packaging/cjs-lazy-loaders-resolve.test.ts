/**
 * Behavioral proof, complementing cjs-no-esm-dynamic-import.test.ts's static
 * invariant. That file proves the shipped dist/**\/*.js contains no more raw
 * `import(...)` expressions; this file proves that CALLING the downleveled
 * loaders actually WORKS — resolves to the right module shape — under the
 * exact restricted-VM conditions that broke in CI
 * (examples/expo/quickstart/__tests__/useMinder.expo.test.tsx via jest-expo).
 *
 * Our own root jest ("preset": "ts-jest", CJS) reproduces that restriction
 * exactly: a bare `import(...)` evaluated from a built .js file, run under
 * plain `jest` (no `--experimental-vm-modules`), throws the identical
 * "A dynamic import callback was invoked without --experimental-vm-modules"
 * error jest-expo raised in the failing CI job. (ts-jest itself downlevels
 * every `import()` written in src/**\/*.ts — that's why our own suite never
 * caught the regression; this file requires the BUILT dist/**\/*.js output
 * instead, so it exercises the real toolchain gap.)
 *
 * The three loaders exercised (all inside dist/**\/*.js, never dist/**\/*.mjs
 * — the .mjs side is asserted to stay untouched by
 * cjs-no-esm-dynamic-import.test.ts):
 *   1. axios  — src/core/minder.ts:99  `axiosPromise ??= import('axios')`
 *   2. dompurify — src/utils/security.ts:21 `domPurifyPromise ??= import('dompurify')`
 *   3. responseValidation — src/core/minder.ts:732, src/core/ApiClient.ts:944/:1037
 *      `await import('./responseValidation.js')`
 *
 * `XSSSanitizer` (which wraps loader #2) is not exported from dist/index.js,
 * and loaders #1/#3 are internal, unexported closures inside split chunk
 * files too — so this file reaches them the only way available: by scanning
 * dist/**\/*.js for the file whose CONTENT carries the loader's structural
 * signature (never a hardcoded chunk hash — hashes are content-derived and
 * change across builds), then loading a lightly-instrumented copy of that
 * exact file via Node's own `Module` machinery (so relative `require(...)`
 * calls inside it still resolve against the file's real directory) with one
 * appended line exposing the already-matched loader as a new export. No
 * source logic is altered — the appended line only re-exposes what the file
 * already defines, so `.default ?? mod`-style interop identical to the real
 * call sites (src/core/minder.ts:633, src/utils/security.ts:176) applies.
 *
 * The instrumented copy is written to a real sibling `.js` file (same
 * directory as the original chunk, so its own relative `require(...)` calls
 * resolve identically) and loaded via plain `require(...)`, then deleted
 * immediately after — NOT Node's raw `Module`/`_compile` API. That distinction
 * matters here: this suite runs under `testEnvironment: "jsdom"`, and
 * jest-environment-jsdom only patches its jsdom globals (`window`, etc.) onto
 * modules reached through the normal `require()` chain it manages. Loading
 * the chunk any other way bypasses that sandbox, so `dompurify`'s own
 * `typeof window` runtime check sees no `window` and returns its Node
 * factory export instead of a ready `.sanitize`-bearing instance — a false
 * negative unrelated to the fix this suite guards. Verified empirically:
 * Node's raw `Module`/`_compile` here returns dompurify's factory shape (no
 * `.sanitize`); real `require()` returns the jsdom-detected instance shape,
 * matching what an actual consumer gets.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const distDir = resolve(__dirname, '../../dist');

if (!existsSync(distDir)) {
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build` — see the "test:packaging" ' +
      'wiring in package.json and .github/workflows/ci.yml.',
  );
}

function walkJsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const allJsFiles = walkJsFiles(distDir);

function findLoaderSite(pattern: RegExp): { file: string; match: RegExpMatchArray } | null {
  for (const file of allJsFiles) {
    const code = readFileSync(file, 'utf8');
    const match = code.match(pattern);
    if (match) {
      return { file, match };
    }
  }
  return null;
}

// Loads `filePath` with `appendCode` tacked onto the end via a temporary
// sibling file + plain `require(...)` — see the file header for why this
// (and not Node's raw Module/_compile API) is required for jsdom detection
// to behave like a real consumer's. The temp file lives next to the
// original so its own relative `require(...)` calls resolve identically,
// and is removed again immediately after requiring it.
//
// The path must be unique PER CALL, not just per source file: Jest's own
// `require()` caches modules by resolved absolute path, and more than one
// loader in this suite lives inside the same chunk file (e.g. the dompurify
// and responseValidation call sites can both land in the same split chunk
// depending on how esbuild groups things that build). If two calls reused
// the same `<file>.__packaging-probe-<pid>.js` path, the second `require()`
// would silently return the FIRST call's cached module — instrumented for a
// different loader entirely — even though the on-disk content was
// overwritten and later deleted in between. A monotonically increasing
// counter guarantees every call gets a path Jest has never seen before.
let instrumentedLoadCount = 0;
function loadInstrumented(filePath: string, appendCode: string): Record<string, unknown> {
  const tmpPath = filePath.replace(/\.js$/, `.__packaging-probe-${process.pid}-${instrumentedLoadCount++}.js`);
  writeFileSync(tmpPath, `${readFileSync(filePath, 'utf8')}\n${appendCode}`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(tmpPath);
  } finally {
    unlinkSync(tmpPath);
  }
}

// Structural signature of the memoized `X ??= import('axios')` /
// `import('dompurify')` pattern after downleveling — matches regardless of
// the minifier's chosen identifier names (`be`/`q`/`U` today, anything
// tomorrow), which is exactly why this is a regex over shape, not a
// hardcoded name.
// esbuild's minifier draws short identifiers from the full set of legal JS
// identifier characters — letters, digits, `_`, AND `$` — not just `\w`
// (which is `[A-Za-z0-9_]` and excludes `$`). Which exact name lands on which
// loader is an artifact of allocation order, not something this test can
// pin: a prior build put `_`/`K`/`N` on these sites, this build put `$` on
// the dompurify one (`$??($=Promise.resolve()...)`). A pattern built on `\w+`
// therefore fails NOT because the artifact is wrong (`$` is a perfectly
// valid, and common, minified identifier) but because the pattern's own
// character class was too narrow — so every identifier slot below uses
// `[\w$]+` instead of `\w+`.
const MINIFIED_IDENTIFIER = '[\\w$]+';

function memoizedLoaderPattern(pkg: string): RegExp {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const id = MINIFIED_IDENTIFIER;
  return new RegExp(
    `function\\s+(${id})\\s*\\(\\)\\s*\\{return\\s+${id}\\?\\?\\(${id}=Promise\\.resolve\\(\\)\\.then\\(\\(\\)=>${id}\\(require\\((["'])${escaped}\\2\\)\\)\\)\\),${id}\\}`,
  );
}

const RESPONSE_VALIDATION_RE = new RegExp(
  `Promise\\.resolve\\(\\)\\.then\\(\\(\\)=>${MINIFIED_IDENTIFIER}\\(require\\((["'])\\./responseValidation-[\\w$.-]+\\1\\)\\)\\)`,
);

// Constructing this string via concatenation (rather than a literal) keeps
// it out of any editor/CI text-search for the literal error string while
// still asserting on it exactly if the loaders regress.
const VM_MODULES_ERROR_SUBSTRING =
  'A dynamic import callback was invoked without --experimental-vm-modules';

describe('lazy loaders resolve under a restricted CJS VM (dist/**/*.js)', () => {
  test('axios loader resolves and .default is callable', async () => {
    const hit = findLoaderSite(memoizedLoaderPattern('axios'));
    expect(hit).not.toBeNull();
    if (!hit) return;

    const loaderName = hit.match[1];
    const instrumented = loadInstrumented(hit.file, `\nmodule.exports.__test_loader = ${loaderName};\n`);
    const loader = instrumented.__test_loader as () => Promise<unknown>;
    expect(typeof loader).toBe('function');

    let resolved: { default?: unknown } | undefined;
    try {
      resolved = (await loader()) as { default?: unknown };
    } catch (err) {
      throw new Error(
        `axios loader (dist/${hit.file.replace(`${distDir}/`, '')}) threw instead of resolving — ` +
          `this is the exact failure mode of the CI regression ("${VM_MODULES_ERROR_SUBSTRING}"). ` +
          `Caught: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    expect(resolved).toBeDefined();
    expect(typeof resolved?.default).toBe('function');
  });

  test('dompurify loader resolves and exposes a .sanitize function', async () => {
    const hit = findLoaderSite(memoizedLoaderPattern('dompurify'));
    expect(hit).not.toBeNull();
    if (!hit) return;

    const loaderName = hit.match[1];
    const instrumented = loadInstrumented(hit.file, `\nmodule.exports.__test_loader = ${loaderName};\n`);
    const loader = instrumented.__test_loader as () => Promise<unknown>;
    expect(typeof loader).toBe('function');

    let resolved: { default?: { sanitize?: unknown }; sanitize?: unknown } | undefined;
    try {
      resolved = (await loader()) as typeof resolved;
    } catch (err) {
      throw new Error(
        `dompurify loader (dist/${hit.file.replace(`${distDir}/`, '')}) threw instead of resolving — ` +
          `this is the exact failure mode of the CI regression ("${VM_MODULES_ERROR_SUBSTRING}"). ` +
          `Caught: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    expect(resolved).toBeDefined();
    // Mirrors src/utils/security.ts:176's own interop: `.default ?? mod`.
    const sanitizer = (resolved?.default ?? resolved) as { sanitize?: unknown } | undefined;
    expect(typeof sanitizer?.sanitize).toBe('function');
  });

  test('responseValidation loader resolves and validateResponseOrThrow is a function', async () => {
    const hit = findLoaderSite(RESPONSE_VALIDATION_RE);
    expect(hit).not.toBeNull();
    if (!hit) return;

    const instrumented = loadInstrumented(
      hit.file,
      `\nmodule.exports.__test_loader = function () { return ${hit.match[0]}; };\n`,
    );
    const loader = instrumented.__test_loader as () => Promise<unknown>;
    expect(typeof loader).toBe('function');

    let resolved: { default?: { validateResponseOrThrow?: unknown }; validateResponseOrThrow?: unknown } | undefined;
    try {
      resolved = (await loader()) as typeof resolved;
    } catch (err) {
      throw new Error(
        `responseValidation loader (dist/${hit.file.replace(`${distDir}/`, '')}) threw instead of ` +
          `resolving — this is the exact failure mode of the CI regression ` +
          `("${VM_MODULES_ERROR_SUBSTRING}"). Caught: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    expect(resolved).toBeDefined();
    const fn = resolved?.validateResponseOrThrow ?? resolved?.default?.validateResponseOrThrow;
    expect(typeof fn).toBe('function');
  });
});
