#!/usr/bin/env node
// Post-build fix (BLOCKER 1, fix-nextjs-appouter-build-and-redirect-header-
// leak): tsup's cross-entry `splitting:true` merges several originally
// separate source modules — each starting with a real "use client";
// directive (MinderContext.tsx, MinderDataProvider.tsx, useMinder.ts,
// useConfiguration.ts, ...) — into ONE shared chunk file whose top-level
// code esbuild wraps in a deferred "call once" lazy initializer (the SAME
// `var x = b(() => {...})` shape src/plugins/PluginSystem.ts's header
// comment documents for the App Router PluginManager crash). Each merged
// module's own `"use client";` directive survives INSIDE that wrapper
// function body, e.g.:
//
//   var p = b(() => { "use client"; c(); });
//
// A `"use client"` directive is only meaningful — per the ECMAScript
// "directive prologue" grammar React/Next.js's compiler relies on — as the
// FIRST STATEMENT of a module. Buried inside a function body it is an inert,
// no-op string-literal expression statement: it does nothing, and critically
// Next.js's build (both `next build` and `next dev`) never sees the module
// as client-marked at all. Any App Router import of `minder`/
// `configureMinder` (which transitively reaches one of these merged chunks)
// then fails to build, because Next treats the chunk as a plain
// (non-"use client") module that nonetheless calls React hooks.
//
// THE FIX is packaging-layer, not a source change (tsup.config.ts's own
// header comment on `splitting:true` explains why the merge itself is
// required — disabling it regresses a DIFFERENT, already-fixed defect
// class, MDPD-17/dabd92d): this script runs after tsup finishes and, for
// EVERY dist output file (ESM `.mjs` AND CJS `.js` — the merge/wrapper
// shape happens in both artifacts, verified empirically) that contains the
// literal directive text anywhere other than as the file's own first
// statement, strips every occurrence (each one is a no-op string-literal
// statement — removing it changes nothing at runtime) and re-inserts EXACTLY
// ONE `"use client";` as the file's literal first line. Next.js's directive
// detection then correctly treats the WHOLE merged chunk (and everything
// re-exported from it) as a client boundary — restoring the semantics the
// original per-module directives expressed before tsup's splitting pass
// merged them together.
//
// CANNOT SILENTLY SKIP: exits non-zero if dist/ is missing (must run after
// tsup, matching the sibling scripts in this directory) and if NO dist file
// anywhere contains a "use client" directive at all — every build to date
// has produced at least one (see the source files listed above); a build
// that suddenly produces zero means the merge shape changed and this script
// needs to be re-examined, not silently pass over a build it doesn't
// understand.
//
// Ordering: wired into tsup.config.ts's own `onSuccess` hook (runs while
// `tsup` is still the active process, immediately after
// preserve-webpack-ignore.mjs), i.e. strictly BEFORE package.json's
// `build` script separately invokes `scripts/downlevel-cjs-dynamic-
// import.mjs` on the CJS artifact. That script only rewrites `.js` files
// containing a real `import(...)` expression (none of the "use client"
// chunks do, as of this fix — verified empirically), and additionally
// asserts a leading directive it finds survives its own esbuild
// re-minification unharmed (see its own header comment) — so even if a
// future source change makes those two concerns overlap, the interaction
// fails loudly instead of silently shipping a corrupted directive.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

// Matches a standalone `"use client";` or `'use client';` directive
// statement. Both quote styles are handled defensively even though the
// source files (and esbuild's minifier, which preserves the input's quote
// style when the string contains no quote characters to escape) consistently
// use double quotes.
const DIRECTIVE_RE = /(["'])use client\1;/g;

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, out);
    } else if (extname(entry) === '.mjs' || extname(entry) === '.js') {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(distDir)) {
  console.error('fix-use-client-directive: dist/ not found — run this after tsup, not standalone.');
  process.exit(1);
}

const files = walkFiles(distDir);
let filesRewritten = 0;
let sawDirective = false;

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const matches = [...code.matchAll(DIRECTIVE_RE)];
  if (matches.length === 0) continue;
  sawDirective = true;

  const alreadyCorrect = matches.length === 1 && matches[0].index === 0;
  if (alreadyCorrect) continue;

  const stripped = code.replace(DIRECTIVE_RE, '');
  const fixed = `"use client";${stripped}`;
  writeFileSync(file, fixed);
  filesRewritten += 1;
  console.log(
    `fix-use-client-directive: hoisted "use client" to the first statement of ${relative(root, file)} ` +
      `(removed ${matches.length} misplaced occurrence(s))`,
  );
}

if (!sawDirective) {
  console.error(
    'fix-use-client-directive: no dist/**/*.{js,mjs} file contains a "use client" directive at all — ' +
      'expected at least one (MinderContext.tsx/MinderDataProvider.tsx/useMinder.ts/... all declare it). ' +
      'Either the build shape changed or this ran against a stale/partial dist/.',
  );
  process.exit(1);
}

console.log(`fix-use-client-directive: ${filesRewritten} file(s) rewritten.`);
