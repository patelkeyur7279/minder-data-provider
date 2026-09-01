import type { MinderConfig } from '../types.js';

/**
 * fix-b-redirect-credential-leak (BLOCKER 2): the SINGLE shared choke point
 * for the header NAMES axios's `sensitiveHeaders` option strips on any
 * cross-origin redirect hop.
 *
 * A path-divergence audit (probe id RD1) found that on a real cross-host
 * redirect the STANDALONE `minder()` path delivered a route's own declared
 * secret header (e.g. `x-api-key`) to the redirect target, while the
 * PROVIDER (`ApiClient`) path did not — `ApiClient` already populated
 * axios's `sensitiveHeaders` from the route's own header names (plus the
 * effective auth header name and the CSRF header name) and `minder.ts`
 * never did. This module extracts that logic out of `ApiClient` so BOTH
 * dispatch paths call the exact same function — the asymmetry class (one
 * path fixed, the other silently left open) can no longer recur because
 * there is only one place to fix.
 *
 * follow-redirects (axios's Node http adapter) only strips
 * `Authorization`/`Cookie`/`Proxy-Authorization` by its OWN built-in
 * default, hardcoded by literal name. That misses two things this function
 * covers:
 *
 *   1. A hand-configured `config.auth.authHeader` (e.g. `'X-Auth-Token'`) is
 *      a name follow-redirects has never heard of — that header would ride
 *      along to a redirect target unmodified unless this list names it too.
 *   2. A route's own declared header names (e.g. a static `X-Api-Key`) are
 *      never covered by follow-redirects' hardcoded default at all.
 *
 * Always includes the effective auth header name (defaulting to
 * 'Authorization', the same way the request-signing code does) and the CSRF
 * header name when CSRF protection is configured, plus any route-declared
 * header names the caller supplies.
 */
export function sensitiveHeaderNames(
  config: MinderConfig | null | undefined,
  routeHeaders?: Record<string, string>
): string[] {
  const names = new Set<string>(routeHeaders ? Object.keys(routeHeaders) : []);
  names.add(config?.auth?.authHeader || 'Authorization');
  if (config?.security?.csrfProtection) {
    const csrfConfig = typeof config.security.csrfProtection === 'object'
      ? config.security.csrfProtection
      : { headerName: 'X-CSRF-Token' };
    names.add(csrfConfig.headerName || 'X-CSRF-Token');
  }
  return Array.from(names);
}
