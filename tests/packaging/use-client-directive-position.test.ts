/**
 * @jest-environment node
 *
 * Forced to the "node" environment (root jest's default is "jsdom" for the
 * rest of the suite) — see the sibling `cjs-no-esm-dynamic-import.test.ts`'s
 * header for why esbuild's native binary bridge needs real Node Buffer
 * semantics.
 *
 * BLOCKER 1 (fix-nextjs-appouter-build-and-redirect-header-leak) —
 * packaging invariant guard (dist-artifact level, not source level).
 *
 * Regression: tsup's `splitting:true` (required — see tsup.config.ts's own
 * header comment) merges every source module that starts with a real
 * `"use client";` directive (MinderContext.tsx, MinderDataProvider.tsx,
 * useMinder.ts, useConfiguration.ts, ...) into ONE shared chunk whose
 * top-level code esbuild wraps in a deferred lazy initializer:
 *
 *   var p = b(() => { "use client"; c(); });
 *
 * A `"use client"` directive is only meaningful — per the ECMAScript
 * "directive prologue" grammar React/Next.js's compiler relies on — as the
 * FIRST STATEMENT of a module. Buried inside a function body it does
 * nothing, and Next.js's App Router build (both `next build` and
 * `next dev`) fails outright for any import of `minder`/`configureMinder`
 * that transitively reaches the merged chunk.
 * `scripts/fix-use-client-directive.mjs`, wired into the build via
 * `tsup.config.ts`'s `onSuccess` hook, re-hoists the directive to the
 * file's true first statement post-build and strips every misplaced
 * occurrence (each one is an inert no-op statement, so removing it changes
 * nothing at runtime).
 *
 * This file asserts the invariant that fix must hold, for BOTH build
 * artifacts (the bug reproduced in both, per the fix's own investigation):
 *   (a) NO dist/**\/*.mjs or dist/**\/*.js file contains the literal
 *       "use client" directive text anywhere OTHER than as its own first
 *       statement.
 *   (b) at least one dist file DOES carry the directive as its first
 *       statement — a suite that trivially passes because dist/ no longer
 *       ships "use client" at all anywhere would be a silent regression of
 *       a DIFFERENT kind (Next.js would then see the module as a plain
 *       server module and reject the React hooks it calls for a different
 *       reason) and must fail loudly here, not pass vacuously.
 *
 * Guarded with a hard existsSync(dist) FAIL, not a skip — see the sibling
 * dist-level tests in this directory for why a silent skip here is exactly
 * how this class of regression ships unnoticed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const distDir = resolve(__dirname, '../../dist');

if (!existsSync(distDir)) {
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone.',
  );
}

function walkFiles(dir: string, extensions: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, extensions, out);
    } else if (extensions.some((ext) => entry.endsWith(ext)) && !entry.endsWith('.map')) {
      out.push(full);
    }
  }
  return out;
}

// Matches a standalone `"use client";` or `'use client';` directive
// statement — same pattern scripts/fix-use-client-directive.mjs itself uses.
const DIRECTIVE_RE = /(["'])use client\1;/g;

describe('every "use client" directive in dist is the first statement of its module', () => {
  const distFiles = walkFiles(distDir, ['.mjs', '.js']);

  test('dist contains build artifacts to check', () => {
    expect(distFiles.length).toBeGreaterThan(0);
  });

  const filesWithDirective = distFiles
    .map((f) => ({ file: f, code: readFileSync(f, 'utf8') }))
    .filter(({ code }) => DIRECTIVE_RE.test(code));

  test('at least one dist file still carries a "use client" directive (sanity: the fix does not just delete it)', () => {
    expect(filesWithDirective.length).toBeGreaterThan(0);
  });

  test.each(filesWithDirective.map(({ file }) => [file.replace(`${distDir}/`, '')]))(
    '%s has "use client" as its first statement, and only once',
    (relPath) => {
      const file = join(distDir, relPath);
      const code = readFileSync(file, 'utf8');

      const matches = [...code.matchAll(DIRECTIVE_RE)];
      expect(matches.length).toBe(1);
      expect(matches[0].index).toBe(0);
    },
  );
});
