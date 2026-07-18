/**
 * G-06: public export-surface tests closing the custom-provider API gap G-03
 * found (see docs/providers/CUSTOM.md, formerly its "Known gap" callout).
 *
 * Every certified provider (providers/clerk, providers/stripe,
 * providers/supabase, providers/firebase, providers/razorpay,
 * providers/sentry) calls `registerClientSafeProviderKeys` at module load and,
 * on the server side, resolves a typed `CredentialInput` via
 * `resolveCredential`/`describeCredential`/`isCredentialInput`. Before this
 * change none of these were reachable from the PUBLISHED package — only via a
 * relative import straight into this repo's `src/`, which only works for code
 * that lives inside this monorepo. This file asserts the fix: each symbol is
 * importable from the entry point an external app actually uses.
 *
 * It also asserts the server-only boundary holds at the EXPORT level:
 * `resolveCredential` touches `process.env`/`fs` and throws if called in the
 * browser (see src/security/credentials.ts), so it must be reachable ONLY
 * from 'minder-data-provider/server' — never from the root package.
 *
 * Note: a dist-level (built-entry) check is intentionally NOT added here —
 * tests/dist-entry-exports.test.ts already guards the built dist entries
 * generically for a curated set of symbols; this file covers the source-level
 * export surface only, per G-06's scope.
 */
import { describe, it, expect } from '@jest/globals';

import * as rootEntry from '../src/index';
import {
  registerClientSafeProviderKeys,
  isCredentialInput,
  describeCredential,
} from '../src/index';
import type { CredentialInput } from '../src/index';

import * as serverEntry from '../src/server';
import {
  resolveCredential,
  describeCredential as serverDescribeCredential,
  isCredentialInput as serverIsCredentialInput,
} from '../src/server';
import type { CredentialInput as ServerCredentialInput } from '../src/server';

import { secret } from '../src/security/secrets';

describe('custom-provider public API surface (G-06)', () => {
  describe("root entry ('minder-data-provider' / ../src/index)", () => {
    it('exports registerClientSafeProviderKeys as a callable function', () => {
      expect(typeof registerClientSafeProviderKeys).toBe('function');
      expect(typeof rootEntry.registerClientSafeProviderKeys).toBe('function');
      // Smoke-test it actually does something, not just present-but-inert.
      expect(() => registerClientSafeProviderKeys('g06-test-provider', ['publicKey'])).not.toThrow();
    });

    it('exports isCredentialInput as a callable function that recognizes a real CredentialInput', () => {
      expect(typeof isCredentialInput).toBe('function');
      const cred: CredentialInput = secret('G06_TEST_SECRET');
      expect(isCredentialInput(cred)).toBe(true);
      expect(isCredentialInput('just-a-string')).toBe(false);
    });

    it('exports describeCredential as a callable function that never resolves a value', () => {
      expect(typeof describeCredential).toBe('function');
      const described = describeCredential(secret('G06_TEST_SECRET'));
      expect(described).toEqual(
        expect.objectContaining({
          kind: 'env',
          label: expect.any(String),
          present: expect.any(Boolean),
        })
      );
      // masked — never the raw name/value in full.
      expect(described.label).not.toBe('G06_TEST_SECRET');
    });

    it('does NOT export resolveCredential — the server-only boundary holds at the root entry', () => {
      expect((rootEntry as Record<string, unknown>).resolveCredential).toBeUndefined();
    });

    // G-08: createCorsMiddleware follows the same server-only placement rule.
    it('exports createCorsMiddleware from the server entry only', () => {
      expect(typeof serverEntry.createCorsMiddleware).toBe('function');
      expect((rootEntry as Record<string, unknown>).createCorsMiddleware).toBeUndefined();
    });
  });

  describe("server entry ('minder-data-provider/server' / ../src/server)", () => {
    it('exports resolveCredential as a callable function', () => {
      expect(typeof resolveCredential).toBe('function');
      expect(typeof serverEntry.resolveCredential).toBe('function');
    });

    it('exports describeCredential as a callable function', () => {
      expect(typeof serverDescribeCredential).toBe('function');
    });

    it('exports isCredentialInput as a callable function that recognizes a real CredentialInput', () => {
      expect(typeof serverIsCredentialInput).toBe('function');
      const cred: ServerCredentialInput = secret('G06_TEST_SECRET_SERVER');
      expect(serverIsCredentialInput(cred)).toBe(true);
    });
  });
});
