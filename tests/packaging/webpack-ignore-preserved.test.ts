/**
 * @jest-environment node
 *
 * MEDIUM (transport-and-packaging fix) — packaging invariant guard
 * (dist-artifact level, not source level), mirroring the sibling
 * `cjs-no-esm-dynamic-import.test.ts` in this directory.
 *
 * src/security/credentials.ts:214 dynamically imports `node:fs` with a
 * `/* webpackIgnore: true *\/` magic comment — Node-only code, guarded so it
 * never runs in the browser (resolveCredential throws first there), but
 * still statically visible to any bundler that parses the shipped chunk.
 * Without the comment, webpack (Next.js's default bundler, dev AND prod, for
 * any app importing `minder-data-provider/server`) resolves the bare
 * `node:fs` specifier and emits "Critical dependency: the request of a
 * dependency is an expression".
 *
 * Regression: tsup/esbuild's minification pass strips ALL ordinary comments
 * (verified empirically — `legalComments` only controls where comments
 * esbuild already classifies as "legal" land, not whether an ordinary one
 * survives minification at all), so the pre-fix built chunk
 * (`dist/chunk-BRA4QDNJ.mjs` at the time of the report) shipped
 * `await import(n)` with the comment gone. `scripts/preserve-webpack-
 * ignore.mjs`, wired into the build via `tsup.config.ts`'s `onSuccess` hook,
 * re-inserts it post-build.
 *
 * This test asserts:
 *   (a) some dist/**\/*.mjs chunk carries a real `import(/* webpackIgnore:
 *       true *\/IDENT)` call sourced from a `"node:fs"` string-literal
 *       assignment — parser-verified via esbuild (not a bare text `grep`,
 *       which could also match the comment sitting somewhere unrelated).
 *   (b) dist/server.mjs (the entry point the bug report names verbatim)
 *       transitively reaches that chunk — end-to-end reachability, not just
 *       "the comment exists somewhere in dist/".
 *   (c) the CJS artifact (dist/**\/*.js) is UNAFFECTED — its `import(...)`
 *       is already lowered to a plain `require()` by
 *       downlevel-cjs-dynamic-import.mjs, so no bundler ever parses an
 *       `import()` there, and a webpackIgnore comment would be meaningless
 *       (and, if this fix regressed to touching .js too, that would itself
 *       be a sign the two post-build scripts started stepping on each
 *       other).
 *
 * Guarded with a hard existsSync(dist) FAIL, not a skip — see the sibling
 * file's header for why a silent skip here is exactly how this class of
 * regression ships unnoticed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import * as esbuild from 'esbuild';

const distDir = resolve(__dirname, '../../dist');

if (!existsSync(distDir)) {
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone.',
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

/**
 * Parser-verified (not text-grep) check that `code` contains a real
 * `import(/* webpackIgnore: true *\/ IDENT)` call fed by a `"node:fs"`
 * string-literal assignment. Uses esbuild's own parser (already a
 * dependency here) via `transformSync` with `format: 'esm'` and NO
 * minification, so comments survive intact — then inspects the parsed
 * output's text for the pattern. Round-tripping through esbuild (rather than
 * `new Function`/`vm`) also proves the file is syntactically valid ESM.
 */
function hasPreservedNodeFsImport(code: string): boolean {
  if (!code.includes('node:fs')) return false;
  // Re-emit unminified to normalize whitespace/quoting without altering
  // semantics or comments, then check the normalized text directly.
  const result = esbuild.transformSync(code, { format: 'esm', minify: false, legalComments: 'inline' });
  return /import\(\s*\/\*\s*webpackIgnore:\s*true\s*\*\/\s*[A-Za-z_$][\w$]*\s*\)/.test(result.code);
}

describe('ESM build preserves the webpackIgnore comment on the node:fs dynamic import (dist/**/*.mjs)', () => {
  const mjsFiles = walkFiles(distDir, '.mjs');

  test('dist contains ESM .mjs files to check', () => {
    expect(mjsFiles.length).toBeGreaterThan(0);
  });

  test('some .mjs chunk still carries a real "node:fs" import(...) with the webpackIgnore comment intact', () => {
    const found = mjsFiles.some((f) => hasPreservedNodeFsImport(readFileSync(f, 'utf8')));
    expect(found).toBe(true);
  });

  test('dist/server.mjs transitively reaches the chunk carrying the preserved comment', () => {
    const serverEntry = join(distDir, 'server.mjs');
    expect(existsSync(serverEntry)).toBe(true);

    const entryCode = readFileSync(serverEntry, 'utf8');
    const entryDir = dirname(serverEntry);

    // BFS one-or-more hops through `from '...mjs'` / `import '...mjs'`
    // references — matches how Rollup/webpack/esbuild resolve tsup's
    // split-chunk ESM output. Deliberately NOT hardcoding a chunk hash:
    // hashes are content-derived and change across builds.
    const refRe = /(?:from|import)\s*(["'])(\.\.?\/[^"']+\.mjs)\1/g;
    const visited = new Set<string>([serverEntry]);
    const queue: Array<{ file: string; code: string; dir: string }> = [
      { file: serverEntry, code: entryCode, dir: entryDir },
    ];
    let foundInChain = false;

    while (queue.length > 0) {
      const { code, dir } = queue.shift()!;
      if (hasPreservedNodeFsImport(code)) {
        foundInChain = true;
        break;
      }
      let m: RegExpExecArray | null;
      const re = new RegExp(refRe);
      while ((m = re.exec(code))) {
        const refPath = resolve(dir, m[2]);
        if (!visited.has(refPath) && existsSync(refPath)) {
          visited.add(refPath);
          queue.push({ file: refPath, code: readFileSync(refPath, 'utf8'), dir: dirname(refPath) });
        }
      }
    }

    expect(foundInChain).toBe(true);
  });
});

describe('CJS build is untouched by the webpackIgnore fix (dist/**/*.js)', () => {
  const jsFiles = walkFiles(distDir, '.js');

  test('dist contains CJS .js files to check', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  test('no .js file contains a literal "webpackIgnore" comment — its import() is already a require()', () => {
    const anyHasIt = jsFiles.some((f) => readFileSync(f, 'utf8').includes('webpackIgnore'));
    expect(anyHasIt).toBe(false);
  });
});
