/**
 * Regression guard: built-dist entry interop (CJS + ESM).
 *
 * Context — the bug this guards against:
 *   `HttpMethod` (and every other member of `src/constants/enums.ts`) is
 *   emitted by tsup/esbuild into a *shared* chunk. Under `splitting: true`,
 *   esbuild wraps that shared chunk in a lazy `__esm(() => { … })` init thunk,
 *   so the enum objects are `undefined` until the thunk is invoked. A plain
 *   `export { HttpMethod } from '../constants/enums.js'` re-export merely
 *   forwards the (still-uninitialised) binding without invoking the thunk.
 *   Node happens to run the thunk while evaluating the full module graph, but
 *   a consumer bundler that honours our `sideEffects: false` (e.g. webpack in
 *   the Next.js example) tree-shakes the side-effect evaluation away — leaving
 *   `HttpMethod` `undefined` in the browser client bundle and throwing
 *   `TypeError: Cannot read properties of undefined (reading 'GET')`.
 *
 * The fix ties the enum re-export to a concrete value binding
 * (`import { HttpMethod as _HttpMethod }; export const HttpMethod = _HttpMethod`)
 * in each public entry, which forces esbuild to invoke the init thunk eagerly
 * wherever `HttpMethod` is imported.
 *
 * This test loads the *built* dist entries the way real consumers do — through
 * Node's own CJS (`require`) and ESM (`import`) loaders, in a fresh child
 * process so jest's transform pipeline can't paper over the interop — and
 * asserts the enum value is present in BOTH module systems. It skips
 * gracefully when `dist/` has not been built yet.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(__dirname, '../dist');

// What a given entry is expected to export, and therefore which assertion
// applies to it. 'HttpMethod' is the original dist-interop regression this
// file guards (see header comment); 'registerSupabaseProvider',
// 'registerStripeProvider', and 'registerClerkProvider' are the
// providers/supabase, providers/stripe, and providers/clerk entries' public
// exports — none of them export HttpMethod at all, so each gets its own
// probe/assertion instead.
type ExpectKind =
  | 'HttpMethod'
  | 'registerSupabaseProvider'
  | 'registerStripeProvider'
  | 'registerClerkProvider';

// Public entries the Next.js example (and typical consumers) import from.
// Each is asserted in both module systems.
const entries: Array<{ name: string; cjs: string; esm: string; expect: ExpectKind }> = [
  {
    name: 'root (minder-data-provider)',
    cjs: path.join(distDir, 'index.js'),
    esm: path.join(distDir, 'index.mjs'),
    expect: 'HttpMethod',
  },
  {
    name: 'nextjs (minder-data-provider/nextjs)',
    cjs: path.join(distDir, 'platforms/nextjs.js'),
    esm: path.join(distDir, 'platforms/nextjs.mjs'),
    expect: 'HttpMethod',
  },
  {
    name: 'web (minder-data-provider/web)',
    cjs: path.join(distDir, 'platforms/web.js'),
    esm: path.join(distDir, 'platforms/web.mjs'),
    expect: 'HttpMethod',
  },
  {
    name: 'providers/supabase (minder-data-provider/providers/supabase)',
    cjs: path.join(distDir, 'providers/supabase.js'),
    esm: path.join(distDir, 'providers/supabase.mjs'),
    expect: 'registerSupabaseProvider',
  },
  {
    name: 'providers/stripe (minder-data-provider/providers/stripe)',
    cjs: path.join(distDir, 'providers/stripe.js'),
    esm: path.join(distDir, 'providers/stripe.mjs'),
    expect: 'registerStripeProvider',
  },
  {
    name: 'providers/clerk (minder-data-provider/providers/clerk)',
    cjs: path.join(distDir, 'providers/clerk.js'),
    esm: path.join(distDir, 'providers/clerk.mjs'),
    expect: 'registerClerkProvider',
  },
];

const distBuilt = fs.existsSync(path.join(distDir, 'index.js'));

/**
 * Probe a built entry through a fresh Node process using the given module
 * system. For non-'HttpMethod' kinds, the export under test is a
 * `registerXProvider` function — the ExpectKind string itself IS the export
 * name, so the probe is generic across every provider entry (no per-provider
 * branch needed to add a new one).
 */
function probeEntry(
  kind: 'cjs' | 'esm',
  file: string,
  expectKind: ExpectKind
): {
  httpGet: unknown;
  provider: string;
  hook: string;
  [exportName: string]: unknown;
} {
  const jsonFor = (accessor: string) =>
    expectKind === 'HttpMethod'
      ? `JSON.stringify({` +
        `httpGet:(${accessor}.HttpMethod||{}).GET,` +
        `provider:typeof ${accessor}.MinderDataProvider,` +
        `hook:typeof ${accessor}.useMinder` +
        `})`
      : `JSON.stringify({${expectKind}:typeof ${accessor}.${expectKind}})`;

  let stdout: string;
  if (kind === 'cjs') {
    const script = `const m=require(${JSON.stringify(file)});process.stdout.write(${jsonFor('m')});`;
    stdout = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  } else {
    // Use a file:// URL so Node's ESM loader resolves the .mjs the same way a
    // bundler's `import` condition would.
    const url = `file://${file}`;
    const script =
      `import(${JSON.stringify(url)})` +
      `.then((m)=>{process.stdout.write(${jsonFor('m')});})` +
      `.catch((e)=>{console.error(e);process.exit(1);});`;
    stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });
  }
  return JSON.parse(stdout);
}

/**
 * Bundler-level probe: Node's loaders run the full module graph, so the lazy
 * init thunk always executes and a require/import check passes EVEN ON THE
 * BROKEN dist. Only a tree-shaking bundler that honours `sideEffects: false`
 * (webpack, esbuild) reproduces the bug — so this probe bundles a tiny entry
 * with esbuild (available transitively via tsup) and runs the output.
 *
 * Same genericization as `probeEntry`: for non-'HttpMethod' kinds, the
 * ExpectKind string is used directly as both the named import and the JSON
 * key, so no per-provider branch is needed to add a new provider entry.
 */
function probeBundled(esmFile: string, expectKind: ExpectKind): unknown {
  // esbuild's in-process JS API cannot run under jest's jsdom environment
  // (Buffer/Uint8Array realm mismatch), so invoke its CLI in a child process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os') as typeof import('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-probe-'));
  try {
    const entry = path.join(tmp, 'probe.mjs');
    const out = path.join(tmp, 'bundle.cjs');
    const entrySource =
      expectKind === 'HttpMethod'
        ? `import { HttpMethod } from ${JSON.stringify(esmFile)};` +
          `process.stdout.write(JSON.stringify({ httpGet: (HttpMethod || {}).GET }));`
        : `import { ${expectKind} } from ${JSON.stringify(esmFile)};` +
          `process.stdout.write(JSON.stringify({ ${expectKind}: typeof ${expectKind} }));`;
    fs.writeFileSync(entry, entrySource);
    const esbuildBin = require.resolve('esbuild/bin/esbuild');
    execFileSync(
      process.execPath,
      [esbuildBin, entry, '--bundle', '--format=cjs', '--platform=node',
       '--tree-shaking=true', `--outfile=${out}`, '--log-level=silent'],
      { encoding: 'utf8' }
    );
    const stdout = execFileSync(process.execPath, [out], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout) as { httpGet?: unknown; [exportName: string]: unknown };
    return expectKind === 'HttpMethod' ? parsed.httpGet : parsed[expectKind];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const maybe = distBuilt ? describe : describe.skip;

maybe('built dist entry exports (dist interop regression guard)', () => {
  if (!distBuilt) {
    // eslint-disable-next-line no-console
    console.warn('[dist-entry-exports] dist/ not built — skipping. Run `npm run build` first.');
  }

  for (const entry of entries) {
    describe(entry.name, () => {
      for (const kind of ['cjs', 'esm'] as const) {
        const file = kind === 'cjs' ? entry.cjs : entry.esm;

        describe(`${kind.toUpperCase()} (${path.basename(file)})`, () => {
          const fileExists = fs.existsSync(file);
          const t = fileExists ? test : test.skip;

          if (entry.expect === 'HttpMethod') {
            t('HttpMethod.GET is defined and equals "GET"', () => {
              const r = probeEntry(kind, file, entry.expect);
              expect(r.httpGet).toBe('GET');
            });

            t('MinderDataProvider and useMinder are defined', () => {
              const r = probeEntry(kind, file, entry.expect);
              expect(r.provider).not.toBe('undefined');
              expect(r.hook).not.toBe('undefined');
            });
          } else {
            t(`${entry.expect} is a function`, () => {
              const r = probeEntry(kind, file, entry.expect);
              expect(r[entry.expect]).toBe('function');
            });
          }
        });
      }

      const esmExists = fs.existsSync(entry.esm);
      const tb = esmExists ? test : test.skip;
      if (entry.expect === 'HttpMethod') {
        tb('BUNDLED (esbuild, tree-shaking): HttpMethod.GET survives', () => {
          expect(probeBundled(entry.esm, entry.expect)).toBe('GET');
        });
      } else {
        tb(`BUNDLED (esbuild, tree-shaking): ${entry.expect} survives`, () => {
          expect(probeBundled(entry.esm, entry.expect)).toBe('function');
        });
      }
    });
  }
});
