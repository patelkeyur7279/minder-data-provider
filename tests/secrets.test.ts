/**
 * @jest-environment node
 *
 * Phase 5B: secret-key safety — server side + detection.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  secret,
  env,
  SecretRef,
  isSecretRef,
  findExposedSecrets,
  assertNoExposedSecrets,
  redactSecrets,
} from '../src/security/secrets';
import { resolveSecret } from '../src/server';

describe('secrets — server + detection (Phase 5B)', () => {
  beforeEach(() => {
    process.env.MINDER_TEST_SECRET = 'super-secret-value';
  });

  it('SecretRef never stringifies its value', () => {
    const s = new SecretRef('API_KEY', 'real-value');
    expect(String(s)).toBe('[SECRET:API_KEY]');
    expect(JSON.stringify({ key: s })).toBe('{"key":"[SECRET:API_KEY]"}');
    expect(`${s}`).not.toContain('real-value');
    expect(isSecretRef(s)).toBe(true);
    expect(isSecretRef({ name: 'x' })).toBe(false);
  });

  it('secret() resolves from process.env on the server', () => {
    const s = secret('MINDER_TEST_SECRET');
    expect(s.hasValue()).toBe(true);
    expect(s.reveal()).toBe('super-secret-value');
    expect(resolveSecret(s)).toBe('super-secret-value');
    expect(resolveSecret('MINDER_TEST_SECRET')).toBe('super-secret-value');
  });

  it('env() returns plain non-secret values with a fallback', () => {
    process.env.MINDER_PUBLIC = 'https://api.example.com';
    expect(env('MINDER_PUBLIC')).toBe('https://api.example.com');
    expect(env('MINDER_DOES_NOT_EXIST', 'default')).toBe('default');
  });

  it('findExposedSecrets flags raw secret-shaped values, not public ones', () => {
    const cfg = {
      apiUrl: 'https://api.example.com',
      publishable: 'pk_live_abc123',
      stripe: { secretKey: 'sk_live_ABCDEFGH12345678' },
      aws: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE' },
      creds: { password: 'hunter2hunter2' },
    };
    const paths = findExposedSecrets(cfg).map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining(['stripe.secretKey', 'aws.accessKeyId', 'creds.password'])
    );
    expect(paths).not.toContain('apiUrl');
    expect(paths).not.toContain('publishable');
  });

  it('does NOT flag SecretRef values', () => {
    const cfg = { stripe: { secretKey: secret('STRIPE_SECRET_KEY') } };
    expect(findExposedSecrets(cfg)).toHaveLength(0);
  });

  it('assertNoExposedSecrets is a no-op on the server', () => {
    expect(() =>
      assertNoExposedSecrets({ stripe: { secretKey: 'sk_live_ABCDEFGH12345678' } })
    ).not.toThrow();
  });

  it('redactSecrets masks SecretRefs and secret-shaped strings', () => {
    const out: any = redactSecrets({
      a: secret('K', 'v'),
      b: 'sk_live_ABCDEFGH12345678',
      password: 'whatever123',
      ok: 'fine',
    });
    expect(out.a).toBe('[SECRET:K]');
    expect(out.b).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.ok).toBe('fine');
  });
});
