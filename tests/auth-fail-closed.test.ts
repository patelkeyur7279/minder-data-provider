/**
 * @jest-environment jsdom
 *
 * Security hardening: isAuthenticated() fails CLOSED on JWT-shaped tokens it
 * cannot decode, instead of treating them as valid. Opaque (non-JWT) bearer
 * tokens keep presence-based semantics — they cannot be inspected client-side.
 */
import { describe, it, expect } from '@jest/globals';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType } from '../src/constants/enums';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;

const managerWith = (token: string) => {
  const m = new AuthManager({ tokenKey: 'accessToken', storage: StorageType.MEMORY });
  m.setToken(token);
  return m;
};

describe('isAuthenticated() fail-closed hardening', () => {
  it('rejects a JWT-shaped token with an undecodable payload', () => {
    expect(managerWith('aaa.@@@not-base64@@@.ccc').isAuthenticated()).toBe(false);
  });

  it('rejects a JWT-shaped token whose payload is not JSON', () => {
    const notJson = Buffer.from('this is not json').toString('base64url');
    expect(managerWith(`aaa.${notJson}.ccc`).isAuthenticated()).toBe(false);
  });

  it('rejects a JWT with a non-numeric exp claim', () => {
    expect(managerWith(jwt({ exp: 'tomorrow' })).isAuthenticated()).toBe(false);
  });

  it('still accepts an opaque non-JWT token (presence-based)', () => {
    expect(managerWith('opaque-session-id-12345').isAuthenticated()).toBe(true);
  });

  it('still accepts a valid JWT with future exp and one with no exp', () => {
    expect(managerWith(jwt({ exp: Date.now() / 1000 + 3600 })).isAuthenticated()).toBe(true);
    expect(managerWith(jwt({ sub: 'no-exp' })).isAuthenticated()).toBe(true);
  });

  it('still rejects an expired JWT and exp=0', () => {
    expect(managerWith(jwt({ exp: Date.now() / 1000 - 3600 })).isAuthenticated()).toBe(false);
    expect(managerWith(jwt({ exp: 0 })).isAuthenticated()).toBe(false);
  });
});
