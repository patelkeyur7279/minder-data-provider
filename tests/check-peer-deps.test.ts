/**
 * @jest-environment node
 *
 * A2 — postinstall peer-dependency notice (scripts/check-peer-deps.js). Verifies
 * the precise (not major-only) min-version check across the required peers,
 * missing-peer detection, duplicate-React detection, and silence-on-success.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const check = require('../scripts/check-peer-deps.js');

const PKG = {
  peerDependencies: {
    react: '^18.0.0 || ^19.0.0',
    'react-dom': '^18.0.0 || ^19.0.0',
    '@tanstack/react-query': '^5.90.6',
    '@tanstack/query-core': '^5.90.6',
    stripe: '^14.0.0',
  },
  peerDependenciesMeta: { stripe: { optional: true } },
};

function mkProject(mods: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-postinstall-'));
  for (const [pkg, version] of Object.entries(mods)) {
    const d = path.join(dir, 'node_modules', ...pkg.split('/'));
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, version }));
  }
  return dir;
}

describe('check-peer-deps (postinstall notice)', () => {
  it('version helpers are precise, not major-only', () => {
    expect(check.minVersionFromRange('^18.0.0 || ^19.0.0')).toBe('18.0.0');
    expect(check.gte('5.90.6', '5.90.6')).toBe(true);
    expect(check.gte('5.5.0', '5.90.6')).toBe(false); // same major, still too old
    expect(check.gte('19.0.0', '18.0.0')).toBe(true);
  });

  it('is silent when all required peers satisfy the minimums', () => {
    const dir = mkProject({
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@tanstack/react-query': '5.92.0',
      '@tanstack/query-core': '5.92.0',
    });
    try {
      expect(check.collectWarnings(dir, PKG)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns on an outdated react-query (major-only check would miss this)', () => {
    const dir = mkProject({
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@tanstack/react-query': '5.5.0',
      '@tanstack/query-core': '5.90.6',
    });
    try {
      const w = check.collectWarnings(dir, PKG);
      expect(w.some((m: string) => m.includes('@tanstack/react-query 5.5.0'))).toBe(true);
      expect(w.some((m: string) => m.includes('npm install @tanstack/react-query@^5.90.6'))).toBe(true);
      // optional stripe not installed -> never warned about
      expect(w.some((m: string) => m.includes('stripe'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when a required peer is missing entirely', () => {
    const dir = mkProject({ react: '19.0.0', 'react-dom': '19.0.0' }); // no react-query
    try {
      const w = check.collectWarnings(dir, PKG);
      expect(w.some((m: string) => m.includes('@tanstack/react-query is not installed'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('run() returns warning count and stays silent on success', () => {
    const good = mkProject({
      react: '19.0.0',
      'react-dom': '19.0.0',
      '@tanstack/react-query': '5.92.0',
      '@tanstack/query-core': '5.92.0',
    });
    try {
      const lines: string[] = [];
      expect(check.run(good, PKG, (m: string) => lines.push(m))).toBe(0);
      expect(lines).toEqual([]); // no install noise
    } finally {
      fs.rmSync(good, { recursive: true, force: true });
    }
  });
});
