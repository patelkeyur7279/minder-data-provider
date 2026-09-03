#!/usr/bin/env node
// TEST-ONLY INJECTOR — NEGATIVE CONTROL A for scripts/verify-consumer-treeshake.mjs.
//
// Copies dist/ to a fresh temp dir, then AST-precisely deletes every zero-arg call
// to the enums chunk's lazy `__esm` init thunk, anywhere it is imported across
// dist/**/*.mjs (not just the top-level entries — providers/, platforms/, etc. too).
// This simulates the exact production regression class defect 6 exists to catch:
// a bundler/consumer path that never invokes the shared-chunk initializer, leaving
// HttpMethod (and everything else the enums chunk owns) an unassigned `var`.
//
// Blunt regex removal of the call statement (e.g. `L();` -> ``) is NOT safe here:
// esbuild's minified chunk output often places these calls inside comma/sequence
// expressions, and deleting the text corrupts the expression, so Rollup fails with
// `PARSE_ERROR ... Expression expected` on the mutated file. Replacing the call
// EXPRESSION with `void 0` (same AST shape: still an expression) is safe.
//
// Usage:
//   node scripts/__controls__/kill-enum-init.mjs
// Prints the mutated dist directory path to stdout. Point the guard at it with:
//   MDP_TREESHAKE_DIST=<printed path> node scripts/verify-consumer-treeshake.mjs
import { parseAst } from 'rollup/parseAst';
import {
  mkdtempSync, writeFileSync, readFileSync, readdirSync, cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcDist = join(root, 'dist');

const work = mkdtempSync(join(tmpdir(), 'mdp-kill-enum-'));
const distDir = join(work, 'dist');
cpSync(srcDist, distDir, { recursive: true });

const ENUM_LITERAL_RE = /GET\s*:\s*(['"])GET\1/;

function allMjsFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => join(dir, f));
}

const files = allMjsFiles(distDir);
const enumChunkFile = files.find((f) => ENUM_LITERAL_RE.test(readFileSync(f, 'utf8')));
if (!enumChunkFile) {
  console.error('kill-enum-init: no chunk in dist/ matches the enums literal pattern — nothing to kill. ' +
    'Has the enums shape changed again? Update ENUM_LITERAL_RE.');
  process.exit(2);
}
const enumChunkName = enumChunkFile.split('/').pop();

let totalKilled = 0;
let filesTouched = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parseAst(src);
  } catch (e) {
    console.error(`kill-enum-init: failed to parse ${file}: ${String(e).slice(0, 200)}`);
    process.exit(2);
  }

  // Find local binding names imported FROM the enums chunk (by filename match —
  // the relative specifier depth varies with the importing file's directory).
  const locals = new Set();
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && String(node.source.value).endsWith(enumChunkName)) {
      for (const spec of node.specifiers) {
        if (spec.local?.name) locals.add(spec.local.name);
      }
    }
  }
  if (!locals.size) continue;

  // Walk the whole AST (not just top level — some entries call the thunk from
  // inside nested expressions) and collect every zero-arg call to one of those
  // locals, by [start, end) byte range.
  const cuts = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      locals.has(node.callee.name) &&
      node.arguments.length === 0
    ) {
      cuts.push([node.start, node.end]);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      walk(node[key]);
    }
  })(ast.body);

  if (!cuts.length) continue;
  cuts.sort((a, b) => b[0] - a[0]); // reverse order so earlier offsets stay valid
  for (const [start, end] of cuts) {
    src = src.slice(0, start) + 'void 0' + src.slice(end);
  }
  writeFileSync(file, src);
  totalKilled += cuts.length;
  filesTouched += 1;
}

console.error(`kill-enum-init: chunk=${enumChunkName} killed ${totalKilled} call(s) across ${filesTouched} file(s)`);
console.log(distDir);
