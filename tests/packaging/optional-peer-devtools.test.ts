/**
 * @jest-environment node
 *
 * B5 (fix-2.2.0-blockers) — `@tanstack/react-query-devtools` must be
 * GENUINELY optional. It is a `devDependency` + `peerDependenciesMeta`
 * `optional: true`, so a real consumer install does not provide it. A
 * *dynamic* `import("@tanstack/react-query-devtools")` does not stop
 * esbuild/Metro from statically resolving the specifier at build time
 * (FIX_PLAN.md B5) — proof against the pre-fix built artifact:
 * `grep -o "react-query-devtools" dist/chunk-PNCSONKQ.mjs` found it inside a
 * SHARED chunk reachable from root, `/core`, `/hook`, and every platform
 * entry (`/web`, `/nextjs`, `/native`, `/expo`, `/electron`).
 *
 * This test proves the fix by bundling each of those entries with esbuild
 * (the same bundler `tests/dist-entry-exports.test.ts`'s `probeBundled`
 * already uses in this repo as the tree-shaking-bundler stand-in — Metro
 * itself is not installed here) against an ISOLATED staged copy of `dist/`
 * whose `node_modules` genuinely does NOT contain
 * `@tanstack/react-query-devtools` — same lightweight staging technique
 * `scripts/verify-consumer-treeshake.mjs` already uses (copy `dist/` into a
 * fresh `node_modules/minder-data-provider/`, no real `npm install`, so
 * resolution genuinely fails if the specifier is still statically reachable).
 * Every framework/runtime dependency (`react`, `axios`, `dompurify`, ...) is
 * marked `--external` (a real consumer always has those); ONLY
 * `@tanstack/react-query-devtools` is left for esbuild to actually resolve —
 * that is the one dependency this test is checking for.
 *
 * A genuinely-optional dependency also means the split-out entry must still
 * exist and still use it — this test additionally asserts the new opt-in
 * entry point (`minder-data-provider/devtools-rq`, exported in
 * `package.json`) is present in `dist/` and still contains the specifier —
 * i.e. the feature moved, it was not deleted.
 */
import { existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(__dirname, '../..');
const distDir = resolve(root, 'dist');

if (!existsSync(distDir)) {
  throw new Error(
    `tests/packaging expects dist/ to exist (found nothing at ${distDir}). ` +
      'This suite must run AFTER `npm run build`, never standalone.',
  );
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// Matches evidence appendix #7's reported blast radius exactly: root, /core,
// /hook, and every platform entry.
const ENTRIES_MUST_NOT_NEED_DEVTOOLS: Array<{ name: string; subpath: string }> = [
  { name: 'root (minder-data-provider)', subpath: '.' },
  { name: '/core', subpath: './core' },
  { name: '/hook', subpath: './hook' },
  { name: '/web', subpath: './web' },
  { name: '/nextjs', subpath: './nextjs' },
  { name: '/native', subpath: './native' },
  { name: '/expo', subpath: './expo' },
  { name: '/electron', subpath: './electron' },
];

// Real framework/runtime deps a consumer always provides — must NOT be part
// of what this test resolves (that would just test esbuild's own node_modules
// lookup, not the devtools specifier).
const EXTERNAL = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  '@tanstack/react-query',
  '@tanstack/query-core',
  'axios',
  'dompurify',
  'immer',
];

function stageIsolatedDist(): string {
  const work = mkdtempSync(join(tmpdir(), 'mdp-devtools-guard-'));
  const staged = join(work, 'node_modules', 'minder-data-provider');
  mkdirSync(staged, { recursive: true });
  cpSync(distDir, join(staged, 'dist'), { recursive: true });
  // A package.json with the real exports map (so `require.resolve` below
  // reflects the real shipped shape) but deliberately NO node_modules
  // installed alongside it — `@tanstack/react-query-devtools` is genuinely
  // unresolvable from here, exactly like a bare consumer install without it.
  writeFileSync(join(staged, 'package.json'), JSON.stringify(pkg));
  return work;
}

function tryBundle(entryEsmAbsPath: string): { ok: true } | { ok: false; message: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'mdp-devtools-entry-'));
  try {
    const entry = join(tmp, 'probe.mjs');
    const out = join(tmp, 'bundle.js');
    writeFileSync(entry, `import * as NS from ${JSON.stringify(entryEsmAbsPath)};\nexport const __keep = NS;\n`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const esbuildBin = require.resolve('esbuild/bin/esbuild');
    execFileSync(
      esbuildBin,
      [
        entry,
        '--bundle',
        '--format=esm',
        '--platform=browser',
        ...EXTERNAL.map((e) => `--external:${e}`),
        `--outfile=${out}`,
        '--log-level=silent',
      ],
      { encoding: 'utf8' },
    );
    return { ok: true };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    return { ok: false, message: String(e.stderr ?? e.message ?? err) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('B5: @tanstack/react-query-devtools is genuinely optional', () => {
  const stagedRoot = stageIsolatedDist();
  const stagedPkgPath = join(stagedRoot, 'node_modules', 'minder-data-provider', 'package.json');
  const stagedPkg = JSON.parse(readFileSync(stagedPkgPath, 'utf8'));
  const stagedPkgDir = join(stagedRoot, 'node_modules', 'minder-data-provider');

  afterAll(() => {
    rmSync(stagedRoot, { recursive: true, force: true });
  });

  for (const { name, subpath } of ENTRIES_MUST_NOT_NEED_DEVTOOLS) {
    test(`${name}: esbuild bundles it with no unresolved '@tanstack/react-query-devtools' error (devtools not installed)`, () => {
      const exportEntry = stagedPkg.exports?.[subpath];
      expect(exportEntry).toBeDefined();
      const esmPath = resolve(stagedPkgDir, exportEntry.import);
      expect(existsSync(esmPath)).toBe(true);

      const result = tryBundle(esmPath);
      const failedOnDevtools = !result.ok && /react-query-devtools/.test(result.message);
      if (!result.ok && !failedOnDevtools) {
        // A failure unrelated to devtools resolution (e.g. this repo's dist/
        // shape changed) is a different bug — surface it distinctly rather
        // than mislabel it as the B5 regression.
        throw new Error(`esbuild failed for a reason unrelated to react-query-devtools: ${result.message}`);
      }
      expect(result.ok).toBe(true);
    });
  }

  test('the new opt-in devtools-rq entry exists in dist/ and package.json exports it', () => {
    const exportEntry = pkg.exports?.['./devtools-rq'];
    expect(exportEntry).toBeDefined();
    const esmPath = resolve(distDir, exportEntry.import.replace(/^\.\/dist\//, ''));
    expect(existsSync(esmPath)).toBe(true);
    const code = readFileSync(esmPath, 'utf8');
    expect(code).toMatch(/react-query-devtools/);
  });
});
