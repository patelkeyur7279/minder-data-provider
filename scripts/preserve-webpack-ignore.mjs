#!/usr/bin/env node
// Post-build fix (MEDIUM, transport-and-packaging fix): tsup/esbuild's
// minification pass strips ALL ordinary comments — including the
// `/* webpackIgnore: true */` magic comment src/security/credentials.ts:214
// puts on its dynamic `import(/* webpackIgnore: true */ fsSpecifier)` of
// `node:fs`. Verified empirically (esbuild.transformSync with `minify:true`
// vs `minifyWhitespace:false`): `minifyWhitespace` is what removes the
// comment, and it cannot be selectively disabled for one expression via any
// `legalComments` setting — that option only controls where comments esbuild
// already classifies as "legal" (`//!`, `/*!`, or containing `@license`/
// `@preserve`) land, not whether an ordinary comment like this one survives
// minification at all. Turning off whitespace minification globally to save
// one comment would bloat every other chunk and break budgets:check, so this
// is a targeted post-build fixup instead — the exact pattern
// `downlevel-cjs-dynamic-import.mjs` (next to this file) already established
// for a different esbuild/Rollup gap.
//
// Without the comment, webpack (Next.js's default bundler, dev AND prod, for
// any app importing `minder-data-provider/server`) statically resolves the
// bare `node:fs` specifier and emits "Critical dependency: the request of a
// dependency is an expression" — the exact defect this fixes.
//
// Mechanism: `import(/* webpackIgnore: true */ fsSpecifier)` compiles (before
// minification) to something like:
//   let n = "node:fs", o;
//   try { o = (await import(n)).readFileSync; } catch { ... }
// The `"node:fs"` STRING LITERAL survives minification unchanged (string
// literals are never renamed) even though the variable it's assigned to is.
// This script:
//   1. walks dist/**/*.mjs (ESM only — the CJS artifact's `import(...)` is
//      already lowered to a plain `require()` by downlevel-cjs-dynamic-
//      import.mjs, so no bundler ever parses an `import()` there at all, and
//      a webpackIgnore comment would be meaningless on a `require()` call),
//   2. finds every `IDENT = "node:fs"` (or `'node:fs'`) assignment,
//   3. looks forward, in a bounded window, for the matching `import(IDENT)`
//      call that specifier feeds,
//   4. and inserts the comment immediately after `import(` and before the
//      identifier — `import(/* webpackIgnore: true */IDENT)` — the exact
//      position/format webpack's magic-comment parser requires.
//
// CANNOT SILENTLY SKIP: if `"node:fs"` appears in the ESM output but no
// matching `import(IDENT)` call can be found for it (e.g. a future source
// change reshaped this call site), this exits non-zero instead of silently
// producing a dist/ that ships the original, unfixed defect — the same
// "no graceful skip" discipline tests/wire/run.mjs documents for T1.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

const COMMENT = '/* webpackIgnore: true */';
// Matches `IDENT = "node:fs"` or `IDENT='node:fs'` (esbuild's minifier keeps
// the double-quoted form used in source, but both are handled defensively).
const FS_ASSIGN_RE = /([A-Za-z_$][\w$]*)\s*=\s*(["'])node:fs\2/g;
const WINDOW = 400; // chars to look forward from the assignment for the matching import(IDENT)

function walkMjsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkMjsFiles(full, out);
    } else if (extname(entry) === '.mjs') {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(distDir)) {
  console.error('preserve-webpack-ignore: dist/ not found — run this after tsup, not standalone.');
  process.exit(1);
}

const mjsFiles = walkMjsFiles(distDir);
let filesRewritten = 0;
let sitesFixed = 0;
let sawNodeFsLiteral = false;

for (const file of mjsFiles) {
  const code = readFileSync(file, 'utf8');
  if (!code.includes('node:fs')) continue;
  sawNodeFsLiteral = true;

  let out = code;
  let fixedInThisFile = 0;
  let searchFrom = 0;

  // Re-scan `out` on every iteration since edits shift later offsets —
  // there is only ever one such site in this codebase (verified: `node:fs`
  // appears nowhere else as a dynamic-import specifier), but this loop
  // handles more than one defensively rather than assuming exactly one.
  for (;;) {
    FS_ASSIGN_RE.lastIndex = searchFrom;
    const assignMatch = FS_ASSIGN_RE.exec(out);
    if (!assignMatch) break;

    const ident = assignMatch[1];
    const afterAssign = assignMatch.index + assignMatch[0].length;
    const window = out.slice(afterAssign, afterAssign + WINDOW);

    const importRe = new RegExp(`import\\(\\s*${ident}\\s*\\)`);
    const importMatch = importRe.exec(window);

    if (importMatch) {
      const absoluteImportStart = afterAssign + importMatch.index;
      const callText = out.slice(absoluteImportStart, absoluteImportStart + importMatch[0].length);
      if (!callText.includes('webpackIgnore')) {
        const openParenOffset = callText.indexOf('(') + 1;
        const insertAt = absoluteImportStart + openParenOffset;
        out = out.slice(0, insertAt) + COMMENT + out.slice(insertAt);
        fixedInThisFile += 1;
      }
      searchFrom = afterAssign; // re-scan from just past this assignment (offsets past it have shifted)
    } else {
      // A `node:fs` assignment with no matching `import(IDENT)` nearby is
      // exactly the "future source change reshaped this" case the header
      // comment warns about — fail loudly instead of shipping the unfixed
      // defect silently.
      console.error(
        `preserve-webpack-ignore: found "node:fs" assigned to "${ident}" in ` +
          `${relative(root, file)} but no matching import(${ident}) call within ` +
          `${WINDOW} chars afterward. The build shape changed — update this script.`,
      );
      process.exit(1);
    }
  }

  if (fixedInThisFile > 0) {
    writeFileSync(file, out);
    filesRewritten += 1;
    sitesFixed += fixedInThisFile;
    console.log(`preserve-webpack-ignore: re-inserted webpackIgnore in ${relative(root, file)} (${fixedInThisFile} site(s))`);
  }
}

if (!sawNodeFsLiteral) {
  console.error(
    'preserve-webpack-ignore: no dist/**/*.mjs file contains the "node:fs" specifier at all — ' +
      'expected at least one (src/security/credentials.ts, reachable from dist/server.mjs). ' +
      'Either the build shape changed or this ran against a stale/partial dist/.',
  );
  process.exit(1);
}

console.log(`preserve-webpack-ignore: ${filesRewritten} file(s) rewritten, ${sitesFixed} site(s) fixed.`);
