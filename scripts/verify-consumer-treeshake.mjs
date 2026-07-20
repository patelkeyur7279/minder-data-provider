#!/usr/bin/env node
// Regression guard for MDPD-17: proves a treeshaking consumer bundler keeps
// the module side effects that initialize this package's React context.
//
// Mechanism being guarded: with code splitting, shared state (createContext,
// classes, enums) lives in chunks initialized by lazy __esm thunks that run as
// *module side effects* of chunk imports. A bundler that believes the package
// is side-effect-free ("sideEffects": false) drops those imports; the app then
// throws only in production builds ("… reading '_currentValue'"). jest/jsdom
// and a green `vite build` exit code cannot catch this — only bundling like a
// real consumer can.
//
// Engine choice matters: esbuild does NOT reproduce the pruning for this graph
// (validated during MDPD-17's diagnosis — it kept the chunk imports under both
// manifest states), so this guard uses REAL Rollup + @rollup/plugin-node-resolve,
// the pipeline (Vite's core) in which the bug was originally proven. The guard
// was validated to discriminate: it FAILS against the broken packaging
// ("sideEffects": false) and PASSES against the fixed one.
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'mdp-treeshake-'));

// Stage the package under node_modules/ so resolution — including the
// "sideEffects" manifest field — behaves exactly as for a real consumer.
const staged = join(work, 'node_modules', 'minder-data-provider');
mkdirSync(staged, { recursive: true });
cpSync(join(root, 'dist'), join(staged, 'dist'), { recursive: true });
cpSync(join(root, 'package.json'), join(staged, 'package.json'));

// The minimal consumer: exactly what a real app's first page does.
writeFileSync(
  join(work, 'consumer.mjs'),
  `import { useMinder, configureMinder } from 'minder-data-provider';\n` +
    `configureMinder({ apiUrl: 'http://localhost:9' });\n` +
    `export const hook = useMinder;\n`,
);

const EXTERNALS = new Set([
  'react', 'react-dom', 'react/jsx-runtime',
  '@tanstack/react-query', '@tanstack/query-core', '@tanstack/react-query-devtools',
  'axios', 'immer', 'dompurify',
]);

try {
  const bundle = await rollup({
    input: join(work, 'consumer.mjs'),
    plugins: [nodeResolve({ rootDir: work, browser: true, preferBuiltins: false })],
    external: (id) => EXTERNALS.has(id) || id.startsWith('node:'),
    onwarn: () => {},
  });
  const { output } = await bundle.generate({ format: 'es' });
  await bundle.close();
  const out = output.map((o) => ('code' in o ? o.code : '')).join('\n');

  const contextCalls = (out.match(/createContext\(/g) ?? []).length;
  if (contextCalls === 0) {
    console.error(
      'verify-consumer-treeshake: FAIL — a treeshaking Rollup consumer bundle of dist/ lost all ' +
        'createContext() calls. useMinder() will throw in production builds (MDPD-17). ' +
        'Check package.json "sideEffects" (must be true while tsup splitting is on) — see the ' +
        'INVARIANT note in tsup.config.ts.',
    );
    process.exit(1);
  }
  console.log(
    `verify-consumer-treeshake: OK — ${contextCalls} createContext call(s) survive a treeshaking ` +
      `Rollup consumer bundle (${(out.length / 1024).toFixed(0)}KB unminified).`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
