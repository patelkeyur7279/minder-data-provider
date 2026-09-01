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
 * asserts the enum value is present in BOTH module systems.
 *
 * T1/W5 (fix-2.2.0-blockers): this file used to skip gracefully (`describe.skip`)
 * when `dist/` had not been built yet, AND lived at `tests/dist-entry-exports.test.ts`
 * where `npm test` (ci.yml's "Run tests" step) runs BEFORE `npm run build` — so on
 * every clean CI checkout `dist/` was absent and this suite skipped on EVERY run it
 * ever had; it never executed once. Fixed two ways: (1) moved into `tests/packaging/`,
 * which only runs via `npm run test:packaging`, strictly AFTER the build step
 * (package.json script + .github/workflows/ci.yml), matching every sibling file in
 * this directory (see cjs-no-esm-dynamic-import.test.ts's header for the same
 * reasoning); (2) the missing-dist case below is now a hard `throw`, not a skip —
 * identical posture to every other tests/packaging/*.test.ts file.
 *
 * 'registerRazorpayProvider' and 'registerSentryProvider' are the
 * providers/razorpay and providers/sentry entries' public exports — added
 * alongside the other provider entries, same generic probe/assertion.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(__dirname, '../../dist');

if (!fs.existsSync(distDir)) {
  // Hard fail — see file header. This suite must run AFTER `npm run build`,
  // never standalone — see the "test:packaging" wiring in package.json and
  // .github/workflows/ci.yml.
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone.',
  );
}

// What a given entry is expected to export, and therefore which assertion
// applies to it. 'HttpMethod' is the original dist-interop regression this
// file guards (see header comment); 'registerSupabaseProvider',
// 'registerStripeProvider', 'registerClerkProvider', and
// 'registerFirebaseProvider' are the providers/supabase, providers/stripe,
// providers/clerk, and providers/firebase entries' public exports — none of
// them export HttpMethod at all, so each gets its own probe/assertion
// instead.
type ExpectKind =
  | 'HttpMethod'
  | 'registerSupabaseProvider'
  | 'registerStripeProvider'
  | 'registerClerkProvider'
  | 'registerFirebaseProvider'
  | 'registerRazorpayProvider'
  | 'registerSentryProvider';

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
  // Wave H: the mobile/desktop entries. Each = its base entry + a storage
  // adapter; they must eagerly export HttpMethod like web/nextjs (an Expo/RN
  // dev doing `import { HttpMethod } from 'minder-data-provider/expo'` used to
  // get `undefined` → the dabd92d dist-interop crash, on entries the guard
  // never covered).
  {
    name: 'native (minder-data-provider/native)',
    cjs: path.join(distDir, 'platforms/native.js'),
    esm: path.join(distDir, 'platforms/native.mjs'),
    expect: 'HttpMethod',
  },
  {
    name: 'expo (minder-data-provider/expo)',
    cjs: path.join(distDir, 'platforms/expo.js'),
    esm: path.join(distDir, 'platforms/expo.mjs'),
    expect: 'HttpMethod',
  },
  {
    name: 'electron (minder-data-provider/electron)',
    cjs: path.join(distDir, 'platforms/electron.js'),
    esm: path.join(distDir, 'platforms/electron.mjs'),
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
  {
    name: 'providers/firebase (minder-data-provider/providers/firebase)',
    cjs: path.join(distDir, 'providers/firebase.js'),
    esm: path.join(distDir, 'providers/firebase.mjs'),
    expect: 'registerFirebaseProvider',
  },
  {
    name: 'providers/razorpay (minder-data-provider/providers/razorpay)',
    cjs: path.join(distDir, 'providers/razorpay.js'),
    esm: path.join(distDir, 'providers/razorpay.mjs'),
    expect: 'registerRazorpayProvider',
  },
  {
    name: 'providers/sentry (minder-data-provider/providers/sentry)',
    cjs: path.join(distDir, 'providers/sentry.js'),
    esm: path.join(distDir, 'providers/sentry.mjs'),
    expect: 'registerSentryProvider',
  },
];

// The top-level `dist/` existence check above already throws (hard fail, not
// skip) when the build hasn't run at all. `dist/index.js` specifically is
// asserted per-entry below (`fileExists`/`esmExists`) — that's a different,
// legitimate concern (a partial build missing ONE entry), not "did anyone
// build at all".

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
    // Run the esbuild launcher DIRECTLY, not via `node <esbuildBin>`. Under a clean
    // install `esbuild/bin/esbuild` is the platform-native executable (Mach-O / ELF),
    // so prefixing it with `process.execPath` makes node try to parse a binary as JS
    // ("Invalid or unexpected token"). Executing it directly works for both the native
    // binary and the shebang JS shim some platforms ship (npm marks it +x either way).
    execFileSync(
      esbuildBin,
      [entry, '--bundle', '--format=cjs', '--platform=node',
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

describe('built dist entry exports (dist interop regression guard)', () => {
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


/**
 * G-08 negative probe (recommended by the G-06 security review): the BUILT
 * root entry must never gain `resolveCredential` — the server-only boundary
 * must hold in dist artifacts, not just in source. A bundler/barrel regression
 * that leaks it would pass ts-jest source tests but fail here.
 */
describe('dist boundary: resolveCredential is server-entry-only (G-08)', () => {
  const rootCjs = path.join(distDir, 'index.js');
  const rootEsm = path.join(distDir, 'index.mjs');
  const serverCjs = path.join(distDir, 'server.js');

  it('root CJS + ESM dist entries do NOT export resolveCredential', () => {
    const cjsOut = execFileSync(
      process.execPath,
      ['-e', `const m=require(${JSON.stringify(rootCjs)});process.stdout.write(typeof m.resolveCredential);`],
      { encoding: 'utf8' }
    );
    expect(cjsOut).toBe('undefined');
    const esmOut = execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
       `import(${JSON.stringify('file://' + rootEsm)}).then(m=>process.stdout.write(typeof m.resolveCredential));`],
      { encoding: 'utf8' }
    );
    expect(esmOut).toBe('undefined');
  });

  it('server dist entry DOES export resolveCredential (sanity: the probe can see it)', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', `const m=require(${JSON.stringify(serverCjs)});process.stdout.write(typeof m.resolveCredential);`],
      { encoding: 'utf8' }
    );
    expect(out).toBe('function');
  });
});

/**
 * Wave H: the node (server) entry exports HttpMethod but not the React
 * provider/hook by design, so it doesn't fit the standard HttpMethod probe.
 * Assert the enum alone here — same eager-binding regression guard.
 */
describe('node entry HttpMethod (Wave H)', () => {
  const nodeCjs = path.join(distDir, 'platforms/node.js');
  const nodeEsm = path.join(distDir, 'platforms/node.mjs');
  const t = fs.existsSync(nodeCjs) ? it : it.skip;

  t('exports HttpMethod.GET === "GET" in CJS and ESM', () => {
    const cjs = execFileSync(
      process.execPath,
      ['-e', `const m=require(${JSON.stringify(nodeCjs)});process.stdout.write(String((m.HttpMethod||{}).GET));`],
      { encoding: 'utf8' }
    );
    expect(cjs).toBe('GET');
    const esm = execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
       `import(${JSON.stringify('file://' + nodeEsm)}).then(m=>process.stdout.write(String((m.HttpMethod||{}).GET)));`],
      { encoding: 'utf8' }
    );
    expect(esm).toBe('GET');
  });
});
