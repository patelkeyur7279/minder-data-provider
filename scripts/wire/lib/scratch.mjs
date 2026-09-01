/**
 * Consumer-isolation plumbing for the wire suite (FIX_PLAN.md §5, "Mechanism").
 *
 * `npm pack` the real tarball, then `npm install` it — by package name only,
 * exactly like a real consumer — into a throwaway scratch directory. No
 * `moduleNameMapper` to `src`, no `jest.mock('axios')`, no
 * `jest.mock('../src/core/ApiClient')`. Those three are precisely why
 * tests/useMinder-body-e2e.test.tsx passed while the wire was wrong
 * (FIX_PLAN.md §5, "Consumer isolation is the entire point").
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Packs the repo at `repoRoot` into a tarball written to `destDir` (kept out
 * of the repo root so it can never be accidentally committed) and returns
 * its absolute path.
 */
export function packTarball(repoRoot, destDir) {
  mkdirSync(destDir, { recursive: true });
  const stdout = execFileSync(
    'npm',
    ['pack', '--silent', '--pack-destination', destDir],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const lines = stdout.trim().split('\n').filter(Boolean);
  const tarballName = lines[lines.length - 1]?.trim();
  if (!tarballName) {
    throw new Error(`npm pack produced no output tarball name (raw stdout: ${JSON.stringify(stdout)})`);
  }
  const tarballPath = join(destDir, tarballName);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack reported '${tarballName}' but it does not exist at ${tarballPath}`);
  }
  return tarballPath;
}

/**
 * Creates a bare scratch npm project under `node_modules/.cache/minder-wire/`
 * (per FIX_PLAN.md §5) and installs the packed tarball plus the runtime
 * peers a real consumer would have: react, react-dom, @tanstack/react-query.
 * `jsdom` is ALSO installed here (not a shipped/runtime dependency of the
 * library — see run.mjs header comment) purely so this harness can drive the
 * real `useMinder()` React hook headlessly, the same way
 * `@testing-library/react`'s `renderHook` does under the hood.
 */
export function createScratchConsumer(cacheRoot) {
  mkdirSync(cacheRoot, { recursive: true });
  const dir = mkdtempSync(join(cacheRoot, 'consumer-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'minder-wire-consumer', version: '0.0.0', private: true }, null, 2),
  );
  return dir;
}

export function installIntoScratch(scratchDir, tarballPath) {
  execFileSync(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--silent',
      '--no-save',
      tarballPath,
      'react@19',
      'react-dom@19',
      '@tanstack/react-query@5.90.6',
      '@tanstack/query-core@5.90.6',
      'jsdom@24',
    ],
    { cwd: scratchDir, stdio: ['ignore', 'inherit', 'inherit'] },
  );
}

export function cleanupScratch(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort — a leftover temp dir must never fail the suite.
  }
}

export function makeCacheRoot(repoRoot) {
  return join(repoRoot, 'node_modules', '.cache', 'minder-wire');
}

export function makeTmpPackDir() {
  return mkdtempSync(join(tmpdir(), 'minder-wire-pack-'));
}
