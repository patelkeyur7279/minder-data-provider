/**
 * @jest-environment jsdom
 *
 * Phase 0 reliability: GlobalAuthManager.parseJWT must never throw on malformed
 * tokens. Previously a corrupted value in storage (e.g. "abc" or "a.b") reached
 * atob/JSON.parse and crashed token restoration on page load.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { GlobalAuthManager } from '../src/auth/GlobalAuthManager';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

describe('GlobalAuthManager — malformed JWT handling (Phase 0)', () => {
  const malformed = [
    '',
    'abc',
    'only.two',
    'a.b.c.d.e',
    '...',
    'a..c',
    'not-base64.@@@.sig',
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it.each(malformed)(
    'restores without throwing and yields a null user for token %p',
    (token) => {
      localStorage.setItem('minder_auth_token', token);

      let mgr: GlobalAuthManager | undefined;
      expect(() => {
        mgr = new GlobalAuthManager({ storage: 'localStorage' });
      }).not.toThrow();

      // Unparseable token => no decoded user (token itself may still be present)
      expect(mgr!.getCurrentUser()).toBeNull();
    }
  );

  it('setToken() with a malformed token does not throw and yields null user', async () => {
    const mgr = new GlobalAuthManager({ storage: 'memory' });
    await expect(mgr.setToken('garbage')).resolves.toBeUndefined();
    expect(mgr.getCurrentUser()).toBeNull();
  });

  it('still parses a well-formed token payload', async () => {
    const payload = { sub: '123', name: 'Jane', exp: 9999999999 };
    const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;

    const mgr = new GlobalAuthManager({ storage: 'memory' });
    await mgr.setToken(token);

    expect(mgr.getCurrentUser()).toMatchObject({ sub: '123', name: 'Jane' });
    expect(mgr.isTokenExpired()).toBe(false);
  });
});
