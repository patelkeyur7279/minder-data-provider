/**
 * @jest-environment node
 *
 * M2 (version UX) — guard that the canonical example (examples/nextjs-app) does
 * not drift behind the versions minder declares. examples/ already accumulated a
 * stale duplicate once (old React-18 nextjs/blog); this fails CI if the
 * maintained example pins react / react-dom / @tanstack/react-query below
 * minder's own peer minimums, so examples stay current with the library.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function minVersion(range: string | undefined): string | null {
  const m = String(range).match(/\d+\.\d+\.\d+/g);
  if (!m) return null;
  return m
    .map((v) => v.split('.').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])[0]
    .join('.');
}

function gte(a: string, b: string): boolean {
  const pa = a.match(/(\d+)\.(\d+)\.(\d+)/);
  const pb = b.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!pa || !pb) return true;
  for (let i = 1; i <= 3; i++) {
    if (+pa[i] > +pb[i]) return true;
    if (+pa[i] < +pb[i]) return false;
  }
  return true;
}

describe('canonical example stays current with minder peer minimums', () => {
  const peers = readJson(path.join(root, 'package.json')).peerDependencies || {};
  const example = readJson(path.join(root, 'examples/nextjs-app/package.json'));
  const deps = { ...example.dependencies, ...example.devDependencies };

  for (const name of ['react', 'react-dom', '@tanstack/react-query']) {
    it(`nextjs-app pins ${name} at or above minder's minimum`, () => {
      const min = minVersion(peers[name]);
      const have = minVersion(deps[name]);
      expect(min).toBeTruthy();
      expect(have).toBeTruthy();
      expect(gte(have as string, min as string)).toBe(true);
    });
  }

  it('the stale duplicate Next.js example (nextjs/blog) is removed', () => {
    expect(fs.existsSync(path.join(root, 'examples/nextjs'))).toBe(false);
  });
});

describe('A5 — dependency-automation config is valid', () => {
  it('renovate preset is valid JSON with grouping rules', () => {
    const p = path.join(root, '.github/renovate-preset.json');
    const cfg = readJson(p);
    expect(Array.isArray(cfg.packageRules)).toBe(true);
    const groups = cfg.packageRules.map((r: { groupName?: string }) => r.groupName).filter(Boolean);
    expect(groups).toEqual(expect.arrayContaining(['react', 'tanstack-query']));
  });
});
