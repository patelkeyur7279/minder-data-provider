/**
 * @jest-environment jsdom
 *
 * Phase 2: the single shared JWT utility that all auth managers now delegate to.
 */
import { describe, it, expect } from '@jest/globals';
import { parseJWT, getTokenExpiry, isTokenExpired, isJwtShaped } from '../src/utils/jwt';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
const token = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;

describe('jwt util (Phase 2 consolidation)', () => {
  it('parses a valid token payload', () => {
    expect(parseJWT(token({ sub: '1', name: 'Ada', exp: 9999999999 }))).toMatchObject({
      sub: '1',
      name: 'Ada',
    });
  });

  it('returns null for malformed/empty tokens (never throws)', () => {
    const bad = ['', 'abc', 'a.b', 'a.b.c.d', '...', 'a..c', 'x.@@@.y', null, undefined];
    for (const t of bad) {
      expect(parseJWT(t as any)).toBeNull();
    }
  });

  it('handles UTF-8 payloads', () => {
    expect(parseJWT(token({ name: 'Renée 你好' }))).toMatchObject({ name: 'Renée 你好' });
  });

  it('computes expiry and expiration correctly', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(getTokenExpiry(token({ exp: future }))).toBe(future * 1000);
    expect(isTokenExpired(token({ exp: past }))).toBe(true);
    expect(isTokenExpired(token({ exp: future }))).toBe(false);
    expect(isTokenExpired(token({}))).toBe(false); // no exp => not expired
    expect(getTokenExpiry('garbage')).toBeNull();
  });
});

describe('isJwtShaped', () => {
  it('recognizes 3-segment JWT-shaped tokens (even if payload is garbage)', () => {
    expect(isJwtShaped(token({ sub: '1' }))).toBe(true);
    expect(isJwtShaped('aaa.@@@garbage@@@.ccc')).toBe(true);
  });

  it('rejects opaque and malformed shapes', () => {
    for (const t of ['', 'opaque-session-id-12345', 'a.b', 'a.b.c.d', '..', 'a..c', null, undefined]) {
      expect(isJwtShaped(t as any)).toBe(false);
    }
  });
});
