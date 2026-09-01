/**
 * fix-2.2.0-blockers (ResolvedRequest redesign) — unit-level coverage of the
 * single resolution function ApiClient.request() now funnels EVERY
 * method/url decision through (src/core/apiClient/resolveRequest.ts).
 * End-to-end proof that dispatch/dedup/cache-key actually USE this output
 * lives in the wire suite (tests/wire/method-contract.mjs, 'rr-*' cases);
 * this file isolates the pure resolution unit itself.
 */
import { describe, it, expect } from '@jest/globals';
import { resolveRequest, normalizeHttpMethod, substituteUrlParams, isSafeUrlOverride } from '../src/core/apiClient/resolveRequest';
import { MinderSecurityError, MinderConfigError } from '../src/errors/index';
import type { ApiRoute } from '../src/core/types';

describe('normalizeHttpMethod', () => {
  it('trims and uppercases a valid method string', () => {
    expect(normalizeHttpMethod('post ')).toBe('POST');
    expect(normalizeHttpMethod(' Get')).toBe('GET');
    expect(normalizeHttpMethod('DELETE')).toBe('DELETE');
  });

  it('returns the fallback for a non-string/empty method', () => {
    expect(normalizeHttpMethod(undefined)).toBe('');
    expect(normalizeHttpMethod(null)).toBe('');
    expect(normalizeHttpMethod('   ')).toBe('');
    expect(normalizeHttpMethod(undefined, 'GET')).toBe('GET');
  });
});

describe('substituteUrlParams', () => {
  it('substitutes every occurrence of a repeated placeholder, not just the first', () => {
    const { url, consumedKeys } = substituteUrlParams('/mirror/:id/vs/:id', { id: '42' });
    expect(url).toBe('/mirror/42/vs/42');
    expect(consumedKeys.has('id')).toBe(true);
  });

  it('leaves an unconsumed key out of consumedKeys and an unmatched placeholder untouched', () => {
    const { url, consumedKeys } = substituteUrlParams('/things/:id', { other: 'x' });
    expect(url).toBe('/things/:id');
    expect(consumedKeys.size).toBe(0);
  });

  it('passes the url through unchanged when params is undefined', () => {
    const { url, consumedKeys } = substituteUrlParams('/things/:id', undefined);
    expect(url).toBe('/things/:id');
    expect(consumedKeys.size).toBe(0);
  });
});

describe('resolveRequest', () => {
  const route: ApiRoute = {
    method: 'get' as ApiRoute['method'],
    url: '/things/:id',
    headers: { 'X-Test': '1' },
    timeout: 5000,
  };

  it('resolves method/url as ONE value, normalized and substituted', () => {
    const resolved = resolveRequest(route, { id: '7' });
    expect(resolved.method).toBe('GET');
    expect(resolved.url).toBe('/things/7');
    expect(resolved.consumedKeys.has('id')).toBe(true);
  });

  it('narrows `route` to headers/timeout/schema/model — method/url are NOT present on it', () => {
    const resolved = resolveRequest(route, { id: '7' });
    expect(resolved.route).toEqual({ headers: { 'X-Test': '1' }, timeout: 5000, schema: undefined, model: undefined });
    expect('method' in resolved.route).toBe(false);
    expect('url' in resolved.route).toBe(false);
  });

  it('an explicit method override wins and is itself normalized/trimmed (the untrimmed-method defect)', () => {
    const resolved = resolveRequest(route, { id: '7' }, { method: 'POST ' });
    expect(resolved.method).toBe('POST');
  });

  it('an explicit url override (urlOverride) substitutes for route.url as the starting point', () => {
    const resolved = resolveRequest(route, undefined, { url: '/things' });
    expect(resolved.url).toBe('/things');
  });

  it('falls back to GET (matching axios/fetch default dispatch behavior) when no method resolves at all', () => {
    const noMethodRoute = { url: '/things' } as unknown as ApiRoute;
    const resolved = resolveRequest(noMethodRoute, undefined);
    expect(resolved.method).toBe('GET');
  });

  // ==========================================================================
  // SECURITY item 2 (adversarial re-probe): urlOverride must never be able to
  // change the resolved origin.
  // ==========================================================================
  describe('SECURITY item 2 — urlOverride origin boundary', () => {
    it('rejects an absolute http(s) URL override with a MinderSecurityError', () => {
      expect(() => resolveRequest(route, { id: '7' }, { url: 'http://evil.example/exfil' })).toThrow(
        MinderSecurityError
      );
      expect(() => resolveRequest(route, { id: '7' }, { url: 'https://evil.example/exfil' })).toThrow(
        MinderSecurityError
      );
    });

    it('rejects an arbitrary scheme (javascript:, data:) override', () => {
      expect(() => resolveRequest(route, undefined, { url: 'javascript:alert(1)' })).toThrow(MinderSecurityError);
      expect(() => resolveRequest(route, undefined, { url: 'data:text/html,<script>1</script>' })).toThrow(
        MinderSecurityError
      );
    });

    it('rejects a protocol-relative override and backslash variants', () => {
      expect(() => resolveRequest(route, undefined, { url: '//evil.example/exfil' })).toThrow(MinderSecurityError);
      expect(() => resolveRequest(route, undefined, { url: '\\\\evil.example' })).toThrow(MinderSecurityError);
      expect(() => resolveRequest(route, undefined, { url: '/\\evil.example' })).toThrow(MinderSecurityError);
      expect(() => resolveRequest(route, undefined, { url: '\\/evil.example' })).toThrow(MinderSecurityError);
    });

    it('accepts a plain, same-origin path override — the legitimate collection-form use', () => {
      const resolved = resolveRequest(route, undefined, { url: '/things' });
      expect(resolved.url).toBe('/things');
    });

    it('isSafeUrlOverride matches the same boundary directly', () => {
      expect(isSafeUrlOverride('/things')).toBe(true);
      expect(isSafeUrlOverride('')).toBe(true);
      expect(isSafeUrlOverride('http://evil.example')).toBe(false);
      expect(isSafeUrlOverride('//evil.example')).toBe(false);
    });
  });

  // ==========================================================================
  // item 3 — a literal, unresolved ":param" placeholder must never be
  // returned for dispatch.
  // ==========================================================================
  describe('item 3 — unresolved-placeholder guard', () => {
    it('throws a MinderConfigError when a placeholder survives substitution', () => {
      expect(() => resolveRequest(route, undefined)).toThrow(MinderConfigError);
      expect(() => resolveRequest(route, { other: 'x' })).toThrow(MinderConfigError);
    });

    it('does not throw once every placeholder is supplied', () => {
      expect(() => resolveRequest(route, { id: '7' })).not.toThrow();
    });
  });

  // ==========================================================================
  // item 4 — junk (non-nullish but invalid) overrides must fall through to
  // the DECLARED method, not a generic fallback.
  // ==========================================================================
  describe('item 4 — junk method override falls back to the declared method', () => {
    it('falls back to the declared method when the override is an empty string', () => {
      const resolved = resolveRequest(route, { id: '7' }, { method: '' });
      expect(resolved.method).toBe('GET'); // route.method is 'get'
    });

    it('falls back to the declared method when the override is non-string junk', () => {
      const resolved = resolveRequest(route, { id: '7' }, { method: 123 });
      expect(resolved.method).toBe('GET');
    });

    it('a genuinely valid override still wins over the declared method', () => {
      const resolved = resolveRequest(route, { id: '7' }, { method: 'POST' });
      expect(resolved.method).toBe('POST');
    });
  });

  // ==========================================================================
  // item 5 — an interior-invalid HTTP method must produce a directed error,
  // never reach the transport.
  // ==========================================================================
  describe('item 5 — interior-invalid HTTP method token', () => {
    it('throws a MinderConfigError for an interior space', () => {
      const badRoute: ApiRoute = { ...route, method: 'PO ST' as ApiRoute['method'] };
      expect(() => resolveRequest(badRoute, { id: '7' })).toThrow(MinderConfigError);
    });

    it('throws a MinderConfigError for an interior slash', () => {
      expect(() => resolveRequest(route, { id: '7' }, { method: 'GET/DROP' })).toThrow(MinderConfigError);
    });
  });
});
