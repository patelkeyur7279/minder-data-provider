#!/usr/bin/env node
// Post-build fix (BLOCKER 1, fix-nextjs-appouter-build-and-redirect-header-
// leak; rewritten for the sideEffects:false __esm-wrapper fix, MDPD-17-class
// tree-shake defect A9/A10):
//
// Until now, tsup's cross-entry `splitting:true` merged several originally
// separate source modules — each starting with a real "use client"; directive
// (MinderContext.tsx, MinderDataProvider.tsx, useMinder.ts, ...) — into ONE
// shared chunk file whose top-level code esbuild wrapped in a deferred
// "call once" lazy initializer (`__esm`). Each merged module's own
// "use client"; directive survived INSIDE that wrapper function body, e.g.
// `var p = b(() => { "use client"; c(); });` — inert there, but this script
// used to be able to HOIST it back to the file's true first statement,
// because the text was still present somewhere in the emitted file.
//
// Removing the bundle-internal `require()` calls that forced that `__esm`
// wrapping (see src/core/FeatureLoader.ts, src/platforms/node.ts, and the
// invariant documented in tsup.config.ts) fixes the tree-shake defect, but
// has a confirmed side effect: once nothing forces the eager wrapper, esbuild
// treats a "use client"; that is not literally a module's first statement as
// what it now actually is under normal (non-`__esm`) bundling — a directive
// in an invalid (non-prologue) position — and DROPS it outright, emitting
// `Module level directives cause errors when bundled, "use client" ... was
// ignored`. There is nothing left in the emitted files to hoist.
//
// THE FIX is therefore INJECTION, driven by tsup's `metafile: true` output
// (dist/metafile-esm.json, dist/metafile-cjs.json — see tsup.config.ts),
// which tells us which SOURCE files (`outputs[path].inputs`) ended up in
// which built output file. For every source file under src/**/*.{ts,tsx}
// whose first non-empty line is a real "use client"; directive (the
// CLIENT_SOURCES set — identical rule to tests/use-client-directive.test.ts),
// every dist output that metafile says was built from at least one of those
// sources gets exactly one "use client"; directive re-inserted as its
// literal first line. This restores the semantics the original per-module
// directives expressed before tsup's splitting pass merged them together,
// without depending on esbuild having left any trace of the directive behind.
//
// CANNOT SILENTLY SKIP: exits non-zero if dist/ or either metafile is
// missing (must run after tsup with metafile:true, matching the sibling
// scripts in this directory), if CLIENT_SOURCES is empty (the detection rule
// itself broke), or if zero dist outputs were marked (every build to date
// has produced at least one client chunk — MinderContext.tsx alone reaches
// every platform entry that provides context).
//
// HARD CONSTRAINT: dist/server.{mjs,js} and dist/platforms/node.{mjs,js} are
// server-only surfaces and must NEVER carry "use client" — if metafile says
// one of them transitively includes a client-marked source, that indicates a
// real graph problem (server code pulling in client-only React-hook code),
// and this script STOPS with a non-zero exit and names the offending
// output/inputs rather than silently marking (or silently skipping marking)
// it.
//
// dist/metafile-*.json are deleted at the end of a successful run —
// package.json's `files` glob includes `dist/**/*.json`, and these
// diagnostic-only files must not ship in the published tarball (verified by
// `npm pack --dry-run`, see tests/packaging/*).
//
// Ordering: wired into tsup.config.ts's own `onSuccess` hook (runs while
// `tsup` is still the active process, immediately after
// preserve-webpack-ignore.mjs), i.e. strictly BEFORE package.json's `build`
// script separately invokes `scripts/downlevel-cjs-dynamic-import.mjs` on the
// CJS artifact.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, extname, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const srcDir = join(root, 'src');

// Matches a standalone `"use client";` or `'use client';` directive
// statement, anywhere in a file (used only to strip stray leftovers before
// re-inserting a single canonical copy — idempotent on re-run).
const DIRECTIVE_RE = /(["'])use client\1;/g;

const SERVER_ONLY_OUTPUTS = new Set([
  'dist/server.mjs',
  'dist/server.js',
  'dist/platforms/node.mjs',
  'dist/platforms/node.js',
]);

function toPosix(p) {
  return p.split(sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (extname(entry) === '.ts' || extname(entry) === '.tsx') {
      out.push(full);
    }
  }
  return out;
}

// --- 1. Compute CLIENT_SOURCES: every src/**/*.{ts,tsx} whose first
// non-empty line is a real "use client" directive. Same rule
// tests/use-client-directive.test.ts enforces at source level (it checks the
// literal first line for hook-calling/Component-extending modules; this is
// the inverse direction — which files DO declare the directive).
if (!existsSync(srcDir)) {
  console.error('fix-use-client-directive: src/ not found — cannot compute CLIENT_SOURCES.');
  process.exit(1);
}

const CLIENT_SOURCES = new Set();
for (const file of walk(srcDir)) {
  const code = readFileSync(file, 'utf8');
  const firstNonEmptyLine = code.split('\n').find(line => line.trim().length > 0);
  const trimmed = (firstNonEmptyLine ?? '').trim();
  if (trimmed === '"use client";' || trimmed === "'use client';") {
    CLIENT_SOURCES.add(toPosix(relative(root, file)));
  }
}

if (CLIENT_SOURCES.size === 0) {
  console.error(
    'fix-use-client-directive: CLIENT_SOURCES is empty — no src/**/*.{ts,tsx} file has "use client"; ' +
      'as its first line. Expected at least one (MinderContext.tsx/MinderDataProvider.tsx/useMinder.ts/...). ' +
      'Either the build shape changed or detection is broken — refusing to silently pass.',
  );
  process.exit(1);
}

// --- 2. Read the metafiles tsup (via esbuild) writes when `metafile: true`
// is set in tsup.config.ts.
if (!existsSync(distDir)) {
  console.error('fix-use-client-directive: dist/ not found — run this after tsup, not standalone.');
  process.exit(1);
}

const METAFILES = ['metafile-esm.json', 'metafile-cjs.json'];
const metafilePaths = METAFILES.map(name => join(distDir, name));
const missing = metafilePaths.filter(p => !existsSync(p));
if (missing.length > 0) {
  console.error(
    `fix-use-client-directive: missing metafile(s): ${missing.map(p => relative(root, p)).join(', ')}. ` +
      'tsup.config.ts must set metafile: true so esbuild writes dist/metafile-{esm,cjs}.json.',
  );
  process.exit(1);
}

let metafiles;
try {
  metafiles = metafilePaths.map(p => JSON.parse(readFileSync(p, 'utf8')));
} catch (error) {
  console.error(`fix-use-client-directive: failed to parse a metafile: ${error}`);
  process.exit(1);
}

// --- 3. For every output in every metafile, mark it if any of its inputs is
// a CLIENT_SOURCES file.
const outputsToMark = new Map(); // dist-relative posix path -> Set of matched inputs

for (const metafile of metafiles) {
  const outputs = metafile.outputs || {};
  for (const [outputPath, outputInfo] of Object.entries(outputs)) {
    const inputs = Object.keys(outputInfo.inputs || {});
    const matched = inputs.filter(input => CLIENT_SOURCES.has(input));
    if (matched.length === 0) continue;

    const key = toPosix(outputPath); // already dist-relative, e.g. "dist/hooks/index.mjs"
    if (!outputsToMark.has(key)) outputsToMark.set(key, new Set());
    for (const m of matched) outputsToMark.get(key).add(m);
  }
}

// --- 4. Hard constraint: server-only outputs must never be marked.
const serverViolations = [...outputsToMark.entries()].filter(([key]) => SERVER_ONLY_OUTPUTS.has(key));
if (serverViolations.length > 0) {
  console.error(
    'fix-use-client-directive: HARD CONSTRAINT VIOLATED — a server-only output transitively includes ' +
      'client-marked ("use client") source(s). Refusing to mark it and refusing to silently drop it:',
  );
  for (const [key, inputs] of serverViolations) {
    console.error(`  ${key} <- ${[...inputs].join(', ')}`);
  }
  console.error(
    'This means server-only code (dist/server.* or dist/platforms/node.*) now pulls in a client-only ' +
      'React-hook module. Investigate the import graph — do not paper over this by marking or by silently skipping.',
  );
  process.exit(1);
}

// --- 5. Rewrite each marked output: strip stray directive occurrences, then
// prepend exactly one as the literal first line.
let filesRewritten = 0;
let filesAlreadyCorrect = 0;

for (const [outputKey, matchedInputs] of outputsToMark) {
  const filePath = join(root, outputKey);
  if (!existsSync(filePath)) {
    console.error(
      `fix-use-client-directive: metafile references output "${outputKey}" (from ${[...matchedInputs].join(', ')}) ` +
        'but that file does not exist on disk.',
    );
    process.exit(1);
  }

  const code = readFileSync(filePath, 'utf8');
  const matches = [...code.matchAll(DIRECTIVE_RE)];
  const alreadyCorrect = matches.length === 1 && matches[0].index === 0;
  if (alreadyCorrect) {
    filesAlreadyCorrect += 1;
    continue;
  }

  const stripped = code.replace(DIRECTIVE_RE, '');
  const fixed = `"use client";${stripped}`;
  writeFileSync(filePath, fixed);
  filesRewritten += 1;
  console.log(
    `fix-use-client-directive: injected "use client" as the first statement of ${outputKey} ` +
      `(source: ${[...matchedInputs].join(', ')}; removed ${matches.length} stray occurrence(s))`,
  );
}

const totalMarked = filesRewritten + filesAlreadyCorrect;
if (totalMarked === 0) {
  console.error(
    'fix-use-client-directive: zero dist outputs were marked as client boundaries, even though ' +
      `CLIENT_SOURCES has ${CLIENT_SOURCES.size} entr${CLIENT_SOURCES.size === 1 ? 'y' : 'ies'}. ` +
      'Either the metafile input paths no longer match CLIENT_SOURCES formatting, or the build shape ' +
      'changed — investigate, do not silently pass.',
  );
  process.exit(1);
}

// --- 6. Clean up: metafiles are diagnostic-only and must not ship (verified
// by tests/packaging: `npm pack --dry-run` must not list them).
for (const p of metafilePaths) {
  try {
    unlinkSync(p);
  } catch {
    // best-effort; a missing file at this point is not an error
  }
}

console.log(
  `fix-use-client-directive: ${filesRewritten} file(s) rewritten, ${filesAlreadyCorrect} already correct ` +
    `(${totalMarked} total client-marked output(s) from ${CLIENT_SOURCES.size} client source(s)).`,
);
