/**
 * @jest-environment node
 *
 * Forced to the "node" environment for the same reason as the sibling guard
 * tests/packaging/cjs-no-esm-dynamic-import.test.ts: this file parses code
 * with esbuild (Part A) and with Rollup's AST parser (Part B), and both do
 * real filesystem/buffer work that jsdom's patched globals are known to
 * break for esbuild specifically ("Buffer.from('') instanceof Uint8Array is
 * incorrectly false").
 */

/**
 * Packaging invariant guard for the A9/A10 tree-shake defect class (the
 * `__esm` lazy-init wrapper regression documented in
 * src/constants/enums.ts's "CORRECTION 2" note and tsup.config.ts's
 * INVARIANT comment). Referenced by both of those comments — this file did
 * not previously exist; it is the guard they promised.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, restated
 * ---------------------------------------------------------------------------
 * A bundle-INTERNAL relative `require('../x')` (or `require('./x')`) call
 * ANYWHERE reachable from a tsup build entry forces esbuild to wrap the
 * required module — and everything it statically depends on — in a deferred
 * `__esm(() => {...})` lazy-init thunk, because a synchronous `require()`
 * must return a fully-initialized module. Inside that thunk, only function
 * DECLARATIONS stay hoisted; every `const`/`class`/object value becomes a
 * bare `var X;` whose initializer runs only when the thunk is invoked. tsup
 * entries become pure re-export forwarders around the shared chunk that owns
 * the thunk; a consumer bundler that believes the package `sideEffects:
 * false` resolves the re-export straight to the defining chunk, drops the
 * forwarder (and the init call it carried), and the `var` stays permanently
 * `undefined` for any real single-named-import consumer. This is what
 * produced the 226/652 (entry, export) pairs regression fixed by A9/A10 (9
 * call sites in src/core/FeatureLoader.ts, 1 in src/platforms/node.ts).
 *
 * This file guards BOTH ends of that mechanism, independently:
 *   (A) SOURCE: zero bundle-internal relative require() calls anywhere under
 *       src/** (excluding src/cli/**, see below) — the CAUSE.
 *   (B) BUILT ARTIFACT: no `__esm` lazy-init wrapper shape in dist/**'s
 *       runtime chunks — the EFFECT, asserted directly on what a consumer
 *       actually receives, so this guard cannot be defeated by a future fix
 *       that avoids `require()` syntax but reintroduces the same wrapper via
 *       some other bundler-internal path.
 *
 * ---------------------------------------------------------------------------
 * WHY PART B IS NOT `grep -r "__esm" dist/` (this would be a vacuous guard)
 * ---------------------------------------------------------------------------
 * tsup builds with `minify: true` (tsup.config.ts). esbuild's minifier
 * RENAMES its own internal helper identifiers — including the literal name
 * `__esm` — exactly like any other local binding. Empirically verified while
 * building this guard: reproducing the exact historical defect (restoring
 * all 10 removed require() calls) and rebuilding this package's real dist/
 * output produces attacker-visible breakage (proven by
 * scripts/verify-consumer-treeshake.mjs's named-import-defined signal, e.g.
 * `MinderError` undefined under ./hook) — but a plain `grep -c "__esm"
 * dist/**\/*.{js,mjs}` still reports ZERO matches, in BOTH the broken and the
 * fixed build. A text signal keyed to the literal helper name can NEVER fail
 * once minification is on — the exact "guard that cannot fail" class this
 * whole defect belongs to (see scripts/verify-consumer-treeshake.mjs's own
 * header on the enum-regex precedent).
 *
 * What DOES survive minification is the helper's STRUCTURAL SHAPE. esbuild's
 * `__esm` helper is always generated as:
 *   (fn, res) => (() => (fn && (res = fn(fn = 0)), res))
 * (the specialized single-key form; there is also a generic multi-key form
 * whose call site is `(0, fn[key])(...)` instead of `fn(...)` — both are
 * matched below) — parameter names get minified, but the SHAPE (a two-
 * param arrow returning a zero-param function whose body short-circuits on
 * the first param, calls it with itself zeroed out, assigns the result to
 * the second param, and returns that param) is esbuild's own fixed lowering
 * and does not change under minification. This guard walks the built AST
 * (via Rollup's own parser — already a devDependency, see
 * scripts/__controls__/kill-enum-init.mjs for the same technique) looking
 * for that exact shape, so it survives identifier renaming AND any
 * incidental whitespace/formatting differences a future esbuild version
 * might produce, unlike a text/regex match would.
 *
 * Confirmed absent from a clean build (this guard passes against the
 * as-shipped dist/) and confirmed present the moment the historical defect
 * is reintroduced and dist/ is rebuilt (this guard fails, naming the file) —
 * see the task record for the full re-introduce/rebuild/revert proof.
 *
 * ---------------------------------------------------------------------------
 * WHY src/cli/index.cjs IS EXCLUDED FROM PART A
 * ---------------------------------------------------------------------------
 * src/cli/index.cjs legitimately does `require('../../scripts/generate-catalog.js')`,
 * `require('../../scripts/lib/openapi-codegen.js')`, and
 * `require('../../scripts/lib/codemod-redux-removal.js')`. This is safe and
 * intentional: index.cjs is plain CommonJS that ships as SOURCE (see
 * package.json "files": ["src/cli", ...]) and is `require()`-d directly by
 * bin/minder.js — it is never a tsup build entry (see tsup.config.ts's
 * `entry` map) and is therefore never bundled, never code-split, and never
 * subject to the `__esm` wrapping mechanism this guard exists to catch.
 * Scanning it anyway would be a false positive with zero relationship to the
 * defect class this file guards against.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import * as esbuild from 'esbuild';
// eslint-disable-next-line import/no-extraneous-dependencies -- rollup is
// already a devDependency (used by scripts/verify-consumer-treeshake.mjs and
// scripts/__controls__/kill-enum-init.mjs); no new dependency is added here.
import { parseAst } from 'rollup/parseAst';

const root = resolve(__dirname, '../..');
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

if (!existsSync(distDir)) {
  // Hard fail — see tests/packaging/cjs-no-esm-dynamic-import.test.ts's
  // header for why this is a throw, not a skip: test:packaging must run
  // strictly after `npm run build`, and a silent skip is exactly how a
  // build-artifact regression ships unnoticed.
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone — see ' +
      'the "test:packaging" wiring in package.json and .github/workflows/ci.yml.',
  );
}

function walkFiles(dir: string, predicate: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, predicate, out);
    } else if (predicate(entry)) {
      out.push(full);
    }
  }
  return out;
}

// ===========================================================================
// PART A — SOURCE: zero bundle-internal relative require() under src/**
// ===========================================================================

// Deliberately excludes src/cli/** — see file header. No other exclusions:
// the guard-worthy invariant (enums.ts, tsup.config.ts) is "zero
// require('../...') in src/**", full stop.
const sourceFiles = walkFiles(
  srcDir,
  (name) => (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts'),
).filter((f) => !f.startsWith(join(srcDir, 'cli') + '/'));

// Matches `require(` followed by a string literal starting with `./` or
// `../` — i.e. exactly a bundle-internal RELATIVE require. Deliberately does
// NOT match `require(someVariable)` (e.g. src/security/credentials.ts's
// `require(fsSpecifier)`) or `require('bare-package-name')` (e.g.
// src/core/AuthManager.ts's `require('@react-native-async-storage/...')`) —
// those resolve to EXTERNAL modules (never bundled; tsup's `external`
// handling keeps them as real runtime require() calls in the CJS output and
// real dynamic-import-shimmed calls in ESM) and are not this defect class.
const RELATIVE_REQUIRE_RE = /\brequire\(\s*(['"])(\.\.?\/[^'"]*)\1\s*\)/g;

describe('src/** contains zero bundle-internal require() calls (A9/A10 CAUSE)', () => {
  test('sanity: found TypeScript source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  test('no src/**/*.{ts,tsx} file (excluding src/cli/**) require()s a relative specifier', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const original = readFileSync(file, 'utf8');
      // Strip comments/types via esbuild BEFORE regex-scanning. This is not
      // optional: several files in this exact area (src/constants/enums.ts,
      // tsup.config.ts's own comment, this file's own header above) discuss
      // the pattern `require('../x')` IN PROSE, inside a doc comment, as an
      // example of the defect being guarded against. A raw text/regex scan
      // of the original source would flag those comments as violations —
      // stripping comments first (and TS type syntax, which cannot itself
      // contain a require() call) removes that entire false-positive class
      // without weakening what real code is checked.
      let stripped: string;
      try {
        stripped = esbuild.transformSync(original, {
          loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
          format: 'esm',
          target: 'es2020',
          minify: false,
          legalComments: 'none',
        }).code;
      } catch (e) {
        throw new Error(`no-esm-lazy-wrapper: esbuild failed to parse ${relative(root, file)}: ${String(e).slice(0, 300)}`);
      }

      RELATIVE_REQUIRE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RELATIVE_REQUIRE_RE.exec(stripped))) {
        offenders.push(`${relative(root, file)}: require(${JSON.stringify(m[2])})`);
      }
    }

    if (offenders.length) {
      throw new Error(
        `no-esm-lazy-wrapper: found bundle-internal relative require() call(s) under src/** ` +
        `(excluding src/cli/**) — this is EXACTLY the A9/A10 defect class (see this file's ` +
        `header): esbuild wraps the required module, and everything it statically depends on, ` +
        `in a deferred __esm lazy-init thunk, which a sideEffects:false consumer bundler then ` +
        `drops, leaving named exports undefined in production. Replace with a static \`import\` ` +
        `or a dynamic \`import()\` (see src/core/FeatureLoader.ts's importFeatureNamespace for ` +
        `the pattern this project uses):\n\n  - ${offenders.join('\n  - ')}`,
      );
    }
  });
});

// ===========================================================================
// PART B — BUILT ARTIFACT: no __esm lazy-init wrapper shape in dist/**
// ===========================================================================

const runtimeChunkFiles = walkFiles(
  distDir,
  (name) => (name.endsWith('.mjs') || name.endsWith('.js')) && !name.endsWith('.d.ts') && !name.endsWith('.map'),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

function isIdentifierNamed(node: AstNode, name: string): boolean {
  return !!node && node.type === 'Identifier' && node.name === name;
}

// Matches esbuild's `__esm` helper — see file header for the shape and why
// it, not a text pattern, is what this guard looks for. `p0`/`p1` are the
// helper's own two parameter names (renamed by minification; read from the
// node under test, never hardcoded).
function isEsmLazyInitHelper(node: AstNode): boolean {
  if (!node || node.type !== 'ArrowFunctionExpression') return false;
  if (!Array.isArray(node.params) || node.params.length !== 2) return false;
  const [p0, p1] = node.params;
  if (p0.type !== 'Identifier' || p1.type !== 'Identifier') return false;

  const inner = node.body;
  if (!inner || (inner.type !== 'ArrowFunctionExpression' && inner.type !== 'FunctionExpression')) return false;
  if (!Array.isArray(inner.params) || inner.params.length !== 0) return false;

  // The inner zero-arg function's body is either a direct expression (arrow
  // with `expression: true`) or a `{ return <expr>; }` block (the
  // non-minified `function __init() { return ...; }` shape) — both lower to
  // the same SequenceExpression underneath.
  let seq: AstNode = null;
  if (inner.type === 'ArrowFunctionExpression' && inner.expression) {
    seq = inner.body;
  } else if (inner.body?.type === 'BlockStatement' && inner.body.body?.length === 1) {
    const stmt = inner.body.body[0];
    if (stmt.type === 'ReturnStatement' && stmt.argument) seq = stmt.argument;
  }
  if (!seq || seq.type !== 'SequenceExpression' || seq.expressions?.length !== 2) return false;

  const [logical, tail] = seq.expressions;
  if (!isIdentifierNamed(tail, p1.name)) return false;
  if (logical.type !== 'LogicalExpression' || logical.operator !== '&&') return false;
  if (!isIdentifierNamed(logical.left, p0.name)) return false;

  const assign = logical.right;
  if (!assign || assign.type !== 'AssignmentExpression' || assign.operator !== '=') return false;
  if (!isIdentifierNamed(assign.left, p1.name)) return false;

  const call = assign.right;
  if (!call || call.type !== 'CallExpression') return false;

  // callee is either the outer param directly (esbuild's single-key
  // specialization — the shape confirmed against this repo's own dist/ when
  // the defect is reintroduced) or `(0, fn[...])` — a SequenceExpression
  // ending in a MemberExpression on the outer param (esbuild's generic
  // multi-key indirection, documented in src/constants/enums.ts's
  // CORRECTION note's non-minified example).
  const callee = call.callee;
  const calleeMatches =
    isIdentifierNamed(callee, p0.name) ||
    (callee?.type === 'SequenceExpression' &&
      Array.isArray(callee.expressions) &&
      callee.expressions.length > 0 &&
      callee.expressions[callee.expressions.length - 1]?.type === 'MemberExpression' &&
      isIdentifierNamed(callee.expressions[callee.expressions.length - 1].object, p0.name));
  if (!calleeMatches) return false;

  if (!Array.isArray(call.arguments) || call.arguments.length !== 1) return false;
  const arg0 = call.arguments[0];
  if (!arg0 || arg0.type !== 'AssignmentExpression' || arg0.operator !== '=') return false;
  if (!isIdentifierNamed(arg0.left, p0.name)) return false;
  if (arg0.right?.type !== 'Literal' || arg0.right.value !== 0) return false;

  return true;
}

function findEsmLazyInitHelper(ast: AstNode): boolean {
  let found = false;
  (function walk(node: AstNode) {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (isEsmLazyInitHelper(node)) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      walk(node[key]);
    }
  })(ast.body ?? ast);
  return found;
}

describe('dist/** contains zero __esm lazy-init wrapper shapes (A9/A10 EFFECT)', () => {
  test('sanity: found built runtime chunk files to scan', () => {
    expect(runtimeChunkFiles.length).toBeGreaterThan(50);
  });

  test.each(runtimeChunkFiles.map((f) => [relative(distDir, f)]))(
    'dist/%s does not define an __esm-shaped lazy-init helper',
    (relPath) => {
      const file = join(distDir, relPath);
      const code = readFileSync(file, 'utf8');
      let ast: AstNode;
      try {
        ast = parseAst(code);
      } catch (e) {
        throw new Error(`no-esm-lazy-wrapper: failed to parse dist/${relPath}: ${String(e).slice(0, 300)}`);
      }
      expect(findEsmLazyInitHelper(ast)).toBe(false);
    },
  );
});
