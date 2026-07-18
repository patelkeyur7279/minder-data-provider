/**
 * Provider manifest + certification tests.
 *
 * Two layers:
 *  1. Unit tests for `validateProviderManifest` (src/plugins/manifest.ts) — each field rule,
 *     exercised in isolation against a known-good baseline manifest.
 *  2. End-to-end tests that shell out to `scripts/certify-provider.js` (via child_process,
 *     exactly as a provider author or CI would run it) against the good/bad fixtures under
 *     `tests/fixtures/providers/`, asserting overall pass/fail and specific failed checks.
 */
import { describe, it, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as path from 'path';
import {
  validateProviderManifest,
  defineProviderManifest,
  providerManifestSchema,
  PROVIDER_CATEGORIES,
  PROVIDER_RUNTIMES,
  PROVIDER_FRAMEWORKS,
  type ProviderManifest,
} from '../src/plugins/manifest';

// ---------------------------------------------------------------------------
// 1. validateProviderManifest — unit tests, one per field rule
// ---------------------------------------------------------------------------

const baseManifest: ProviderManifest = {
  name: '@minder/provider-example',
  version: '1.0.0',
  displayName: 'Example',
  categories: ['other'],
  capabilities: ['storage'],
  config: {
    clientSafe: ['url'],
    serverOnly: ['secretKey'],
  },
  scopes: [{ scope: 'storage:read', why: 'Read uploaded files on behalf of the user.' }],
  runtimes: ['web'],
  frameworks: ['react'],
  peerDependencies: { 'example-sdk': '^1.0.0' },
  docs: {
    setup: './README.md',
    example: './example.ts',
    security: './README.md',
  },
};

describe('validateProviderManifest', () => {
  it('accepts a fully valid manifest', () => {
    const result = validateProviderManifest(baseManifest);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects non-object input', () => {
    expect(validateProviderManifest(null).valid).toBe(false);
    expect(validateProviderManifest('nope').valid).toBe(false);
    expect(validateProviderManifest(42).valid).toBe(false);
    expect(validateProviderManifest(['array']).valid).toBe(false);
  });

  it('validates "name" is a scoped-package-shaped string', () => {
    const missing = validateProviderManifest({ ...baseManifest, name: '' });
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.includes('"name"'))).toBe(true);

    const unscoped = validateProviderManifest({ ...baseManifest, name: 'no-scope' });
    expect(unscoped.valid).toBe(false);
    expect(unscoped.errors.some((e) => e.includes('scoped package pattern'))).toBe(true);

    const ok = validateProviderManifest({ ...baseManifest, name: '@scope/name-2' });
    expect(ok.valid).toBe(true);
  });

  it('validates "version" is semver', () => {
    const bad = validateProviderManifest({ ...baseManifest, version: 'v1.0' });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.includes('"version"'))).toBe(true);

    const prerelease = validateProviderManifest({ ...baseManifest, version: '1.0.0-beta.0' });
    expect(prerelease.valid).toBe(true);
  });

  it('validates "displayName" is a non-empty string', () => {
    const result = validateProviderManifest({ ...baseManifest, displayName: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"displayName"'))).toBe(true);
  });

  it('validates "categories" is a non-empty array of known values', () => {
    const empty = validateProviderManifest({ ...baseManifest, categories: [] });
    expect(empty.valid).toBe(false);
    expect(empty.errors.some((e) => e.includes('"categories"'))).toBe(true);

    const invalid = validateProviderManifest({ ...baseManifest, categories: ['not-a-category'] });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((e) => e.includes('invalid value'))).toBe(true);

    // Every enum member is individually accepted.
    for (const category of PROVIDER_CATEGORIES) {
      expect(validateProviderManifest({ ...baseManifest, categories: [category] }).valid).toBe(true);
    }
  });

  it('validates "capabilities" is an array of strings', () => {
    const result = validateProviderManifest({ ...baseManifest, capabilities: [1, 2] as unknown as string[] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"capabilities"'))).toBe(true);
  });

  it('requires config.clientSafe and config.serverOnly to be disjoint', () => {
    const overlapping = validateProviderManifest({
      ...baseManifest,
      config: { clientSafe: ['apiKey'], serverOnly: ['apiKey'] },
    });
    expect(overlapping.valid).toBe(false);
    expect(overlapping.errors.some((e) => e.includes('disjoint'))).toBe(true);

    const disjoint = validateProviderManifest({
      ...baseManifest,
      config: { clientSafe: ['apiKey'], serverOnly: ['secretKey'] },
    });
    expect(disjoint.valid).toBe(true);
  });

  it('requires every scope to have a non-empty "why"', () => {
    const missingWhy = validateProviderManifest({
      ...baseManifest,
      scopes: [{ scope: 'storage:read', why: '' }],
    });
    expect(missingWhy.valid).toBe(false);
    expect(missingWhy.errors.some((e) => e.includes('scopes[0].why'))).toBe(true);

    const missingScope = validateProviderManifest({
      ...baseManifest,
      scopes: [{ scope: '', why: 'because' }],
    });
    expect(missingScope.valid).toBe(false);
    expect(missingScope.errors.some((e) => e.includes('scopes[0].scope'))).toBe(true);
  });

  it('requires "runtimes" to be a non-empty array of known values', () => {
    const empty = validateProviderManifest({ ...baseManifest, runtimes: [] });
    expect(empty.valid).toBe(false);
    expect(empty.errors.some((e) => e.includes('"runtimes"'))).toBe(true);

    const invalid = validateProviderManifest({ ...baseManifest, runtimes: ['browser-extension'] as unknown as string[] });
    expect(invalid.valid).toBe(false);

    for (const runtime of PROVIDER_RUNTIMES) {
      expect(validateProviderManifest({ ...baseManifest, runtimes: [runtime] }).valid).toBe(true);
    }
  });

  it('allows "frameworks" to be empty but rejects unknown values', () => {
    expect(validateProviderManifest({ ...baseManifest, frameworks: [] }).valid).toBe(true);

    const invalid = validateProviderManifest({ ...baseManifest, frameworks: ['angular'] as unknown as string[] });
    expect(invalid.valid).toBe(false);

    for (const framework of PROVIDER_FRAMEWORKS) {
      expect(validateProviderManifest({ ...baseManifest, frameworks: [framework] }).valid).toBe(true);
    }
  });

  it('requires "peerDependencies" to be an object of non-empty range strings', () => {
    const notObject = validateProviderManifest({ ...baseManifest, peerDependencies: [] as unknown as Record<string, string> });
    expect(notObject.valid).toBe(false);

    const emptyRange = validateProviderManifest({ ...baseManifest, peerDependencies: { 'some-sdk': '' } });
    expect(emptyRange.valid).toBe(false);
    expect(emptyRange.errors.some((e) => e.includes('peerDependencies.some-sdk'))).toBe(true);
  });

  it('requires docs.setup/example/security to be relative, non-URL paths', () => {
    const absolute = validateProviderManifest({
      ...baseManifest,
      docs: { ...baseManifest.docs, setup: '/etc/README.md' },
    });
    expect(absolute.valid).toBe(false);
    expect(absolute.errors.some((e) => e.includes('docs.setup'))).toBe(true);

    const url = validateProviderManifest({
      ...baseManifest,
      docs: { ...baseManifest.docs, example: 'https://example.com/example.ts' },
    });
    expect(url.valid).toBe(false);
    expect(url.errors.some((e) => e.includes('docs.example'))).toBe(true);

    const missing = validateProviderManifest({
      ...baseManifest,
      docs: { setup: './README.md', example: './example.ts', security: '' },
    });
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.includes('docs.security'))).toBe(true);
  });

  it('accepts an optional non-empty "license" string but rejects an empty one', () => {
    expect(validateProviderManifest({ ...baseManifest, license: 'MIT' }).valid).toBe(true);
    expect(validateProviderManifest({ ...baseManifest, license: '' }).valid).toBe(false);
  });

  it('accumulates multiple errors in a single pass rather than failing fast', () => {
    const result = validateProviderManifest({
      name: 'bad',
      version: 'bad',
      displayName: '',
      categories: [],
      capabilities: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

describe('defineProviderManifest', () => {
  it('is an identity helper', () => {
    expect(defineProviderManifest(baseManifest)).toBe(baseManifest);
  });
});

describe('providerManifestSchema', () => {
  it('declares all ProviderManifest fields as required (except the optional license)', () => {
    expect(providerManifestSchema.required).toEqual(
      expect.arrayContaining([
        'name',
        'version',
        'displayName',
        'categories',
        'capabilities',
        'config',
        'scopes',
        'runtimes',
        'frameworks',
        'peerDependencies',
        'docs',
      ])
    );
    expect(providerManifestSchema.required).not.toContain('license');
  });
});

// ---------------------------------------------------------------------------
// 2. scripts/certify-provider.js — end-to-end via child_process against fixtures
// ---------------------------------------------------------------------------

const CERT_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'certify-provider.js');
const GOOD_PROVIDER_DIR = path.resolve(__dirname, 'fixtures', 'providers', 'good-provider');
const BAD_PROVIDER_DIR = path.resolve(__dirname, 'fixtures', 'providers', 'bad-provider');

function runCert(dir?: string) {
  const args = dir ? [CERT_SCRIPT, dir] : [CERT_SCRIPT];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return result;
}

describe('scripts/certify-provider.js (child_process)', () => {
  it('exits 0 and reports 10/10 for the good-provider fixture', () => {
    const result = runCert(GOOD_PROVIDER_DIR);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('10/10 checks passed');
    expect(result.stdout).not.toContain('❌');
  });

  it('exits 1 for the bad-provider fixture and fails at least 4 distinct points', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.status).toBe(1);

    const failedLines = result.stdout.split('\n').filter((line) => line.includes('❌'));
    expect(failedLines.length).toBeGreaterThanOrEqual(4);
  });

  it('fails the manifest-validity check for bad-provider (point 1)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ manifest\.json exists and validates/);
    expect(result.stdout).toContain('scoped package pattern');
  });

  it('fails the README-sections check for bad-provider (point 2)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ README\.md exists with required sections/);
    expect(result.stdout).toContain('Missing required section "## Security"');
    expect(result.stdout).toContain('Missing required section "## Credentials"');
  });

  it('fails the client/server config-disjoint check for bad-provider (point 3)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ config\.clientSafe and config\.serverOnly are disjoint/);
    expect(result.stdout).toContain('overlap on: apiKey');
  });

  it('fails the example-file check for bad-provider (point 4)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ Example file exists/);
    expect(result.stdout).toContain('missing-example.ts');
  });

  it('fails the mock-file check for bad-provider (point 5)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ A mock file exists/);
  });

  it('fails the LICENSE check for bad-provider (point 6)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ A LICENSE file or manifest "license" field/);
  });

  it('fails the scopes-why check for bad-provider (point 7)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ Every scope in manifest\.scopes has a non-empty "why"/);
    expect(result.stdout).toContain('payments:charge');
  });

  it('fails the runtimes-non-empty check for bad-provider (point 8)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ manifest\.runtimes declares at least one runtime/);
  });

  it('fails the peerDependencies-vs-imports check for bad-provider (point 9)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ peerDependencies declared for every SDK import/);
    expect(result.stdout).toContain('stripe');
  });

  it('fails the test-file check for bad-provider (point 10)', () => {
    const result = runCert(BAD_PROVIDER_DIR);
    expect(result.stdout).toMatch(/❌ A test file exists/);
  });

  it('exits 2 with usage info when no directory is given', () => {
    const result = runCert();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
  });

  it('exits 2 when the provider directory does not exist', () => {
    const result = runCert(path.resolve(__dirname, 'fixtures', 'providers', 'does-not-exist'));
    expect(result.status).toBe(2);
  });
});
