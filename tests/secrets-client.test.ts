/**
 * @jest-environment jsdom
 *
 * Phase 5B: secret-key safety — the client-side guard.
 */
import { describe, it, expect } from '@jest/globals';
import { secret, assertNoExposedSecrets, isSecretRef } from '../src/security/secrets';
import { resolveSecret } from '../src/server';
import { MinderConfigError } from '../src/errors/MinderError';

describe('secrets — client guard (Phase 5B)', () => {
  it('secret() carries no value on the client', () => {
    const s = secret('STRIPE_SECRET_KEY');
    expect(isSecretRef(s)).toBe(true);
    expect(s.hasValue()).toBe(false);
    expect(() => s.reveal()).toThrow();
    expect(String(s)).toBe('[SECRET:STRIPE_SECRET_KEY]');
  });

  it('assertNoExposedSecrets THROWS for a raw secret in client config', () => {
    expect(() =>
      assertNoExposedSecrets({ stripe: { secretKey: 'sk_live_ABCDEFGH12345678' } })
    ).toThrow(MinderConfigError);
  });

  it('allows SecretRef-based config on the client', () => {
    expect(() =>
      assertNoExposedSecrets({ stripe: { secretKey: secret('STRIPE_SECRET_KEY') } })
    ).not.toThrow();
  });

  it('resolveSecret refuses to run in the browser', () => {
    expect(() => resolveSecret('STRIPE_SECRET_KEY')).toThrow(/server/i);
  });
});
