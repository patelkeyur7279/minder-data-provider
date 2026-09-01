/**
 * fix-2.2.0-blockers (ResolvedRequest redesign) — `src/core/configValidator.ts`'s
 * `validateConfig` was the SECOND of the two ALREADY-KNOWN unfixed readers of
 * a declared route's raw `.method` (the architect's own finding, alongside
 * src/ssr/index.ts:29): its "GET with ID parameter" warning compared
 * `route.method === 'GET'` with strict case-sensitive equality, so a
 * hand-authored route declaring `method: 'get'` (lowercase) — which dispatches
 * exactly like an uppercase 'GET' everywhere else in this library — silently
 * never got the warning it should have.
 *
 * No prior test covered this module at all (a same-named but DIFFERENT file,
 * src/config/validateConfig.ts, has its own separate coverage in
 * tests/config-validation.test.ts).
 */
import { describe, it, expect } from '@jest/globals';
import { validateConfig } from '../src/core/configValidator';
import type { MinderConfig, ApiRoute } from '../src/core/types';

function baseConfig(method: ApiRoute['method'] | string): MinderConfig {
  return {
    apiBaseUrl: 'https://api.example.com',
    routes: {
      userById: { method: method as ApiRoute['method'], url: '/users/:id' },
    },
  };
}

describe('core/configValidator.validateConfig — route.method normalization', () => {
  it('warns about GET-with-ID for a canonical uppercase method (baseline)', () => {
    const result = validateConfig(baseConfig('GET'), { validateRoutes: true });
    expect(result.warnings.some((w) => w.includes('uses GET with ID parameter'))).toBe(true);
  });

  it('warns about GET-with-ID for a lowercase-declared method too (the fix)', () => {
    const result = validateConfig(baseConfig('get'), { validateRoutes: true });
    expect(result.warnings.some((w) => w.includes('uses GET with ID parameter'))).toBe(true);
  });

  it('warns about GET-with-ID for a mixed-case/whitespace-declared method too', () => {
    const result = validateConfig(baseConfig(' GeT '), { validateRoutes: true });
    expect(result.warnings.some((w) => w.includes('uses GET with ID parameter'))).toBe(true);
  });

  it('does NOT warn for a genuinely non-GET method (no false positive introduced)', () => {
    const result = validateConfig(baseConfig('POST'), { validateRoutes: true });
    expect(result.warnings.some((w) => w.includes('uses GET with ID parameter'))).toBe(false);
  });
});
