import type { ApiRoute } from '../types.js';
import { MinderConfigError, MinderSecurityError } from '../../errors/index.js';
import { validateRouteParamValue } from './routeParamSafety.js';

/**
 * fix-2.2.0-blockers (REDESIGN): the narrowed slice of a registered `ApiRoute`
 * that reaches `ApiClient.request`'s dispatch/transform logic AFTER
 * resolution. Deliberately excludes `method` and `url` — see
 * {@link ResolvedRequest}'s doc comment for why that omission is the entire
 * point of this module.
 */
export type ResolvedRouteConfig = Pick<ApiRoute, 'headers' | 'timeout' | 'schema' | 'model'>;

/**
 * The single, authoritative output of route resolution.
 *
 * FOUR consecutive rounds of this defect kept reappearing as ONE invariant
 * violation: resolution returned a divergent TUPLE — a route NAME plus an
 * optional method-override and url-override — and callers reconstructed the
 * actual dispatched method/url from that tuple in one place, while OTHER
 * code (cache keys, dedup gating, SSR prefetch, config validation) kept
 * reading the DECLARED `route.method`/`route.url` straight off the registry
 * entry. The two silently diverged whenever an override was in play.
 *
 * `ResolvedRequest` replaces the tuple with ONE value:
 *   - `method` is PRE-NORMALIZED (trimmed, uppercased) at the point of
 *     resolution — never re-derived, never compared case-sensitively again.
 *   - `url` is PRE-SUBSTITUTED — every `:param` placeholder a caller could
 *     supply already resolved.
 *   - `route` is narrowed to {@link ResolvedRouteConfig} — `method`/`url` are
 *     OUT OF SCOPE on this object, so `route.method`/`route.url` is a TYPE
 *     ERROR AT COMPILE TIME on anything holding a `ResolvedRequest`, not a
 *     silent runtime divergence the next probe has to rediscover.
 */
export interface ResolvedRequest {
  /** Normalized (trimmed, uppercased) HTTP method — exactly what dispatches. */
  method: string;
  /** Fully path-substituted URL — exactly what dispatches. */
  url: string;
  /** Everything else a route may declare EXCEPT `method`/`url`. */
  route: ResolvedRouteConfig;
}

/** {@link resolveRequest}'s return value, plus which `params` keys were consumed for PATH substitution (so a caller can exclude them from a redundant query-string). */
export interface ResolvedRequestWithKeys extends ResolvedRequest {
  consumedKeys: Set<string>;
}

/**
 * fix-2.2.0-blockers (ResolvedRequest redesign): the ONE method-normalization
 * function every reader of a declared route's `.method` should go through
 * before comparing/dispatching it. A hand-authored config (never passed
 * through `configureMinder()`'s own boundary normalization in
 * `src/config/index.ts`) can carry `method: 'get'`/`'Get'`/`'POST '` — humans
 * write mixed case and stray whitespace, and nothing enforces the
 * `HttpMethod` enum at runtime. Trims incidental whitespace and uppercases;
 * an empty/non-string input returns `fallback` (default `''`, i.e. "not a
 * recognized method" — pass `'GET'` at a REAL dispatch site to mirror axios's
 * own default-to-GET behavior so a resolved method is never silently `''`
 * where a concrete method is about to reach the wire).
 */
export function normalizeHttpMethod(method: unknown, fallback: string = ''): string {
  if (typeof method === 'string') {
    const trimmed = method.trim().toUpperCase();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/**
 * fix-2.2.0-blockers (SECURITY item 5, adversarial re-probe): RFC 7230 §3.2.6
 * token characters — the only characters a syntactically valid HTTP method
 * name may contain. `normalizeHttpMethod` only trims OUTSIDE whitespace, so
 * an interior-invalid method (e.g. a hand-built route's `'PO ST'`, or any
 * caller-supplied `options.method` with a stray interior space/slash) sailed
 * straight through as a truthy, "normalized" string and reached axios/Node's
 * raw HTTP layer, which throws a low-level `TypeError` (observed: "Cannot
 * read properties of undefined (reading '_retryCount')") from INSIDE the
 * transport, before `error.config` is ever attached — zero requests dispatch
 * and the caller gets an unhelpful crash instead of a directed error.
 * `resolveRequest` validates the FINAL resolved method against this pattern
 * and throws a `MinderConfigError` synchronously, before any transport call
 * is ever attempted.
 */
const HTTP_METHOD_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Z]+$/;

/**
 * fix-2.2.0-blockers (SECURITY item 2, adversarial re-probe — credential
 * exfiltration): `urlOverride` exists ONLY to let internal collection-form
 * resolution (`useMinder.helpers.ts`'s `resolveFetchRouteName`/
 * `resolveCrudOperationRoute`) swap a registered route's URL for a
 * SAME-ROUTE, PATH-ONLY variant — always `stripIdPathSegment(route.url)`,
 * itself always derived from a route URL that `routeValidation.ts` already
 * requires to start with `/`. Nothing about that legitimate use ever needs
 * an absolute URL, a protocol-relative URL, or a scheme change. Left
 * unconstrained, `ApiClient.request`'s `options.urlOverride` accepted ANY
 * string from ANY caller and let it REPLACE THE HOST while dispatch still
 * attached the ORIGINAL registered route's headers (including any static
 * auth/API-key header the route declares) — an attacker-controlled override
 * (e.g. `http://evil.example/exfil`, or a protocol-relative `//evil.example`)
 * would carry those secrets off-origin. Rejects anything that could change
 * the resolved origin: an explicit scheme (`http:`, `https:`, `javascript:`,
 * `data:`, ...) or two leading path/backslash separators in any combination
 * (`//host`, `\\host`, `/\host`, `\/host` — some URL parsers normalize a
 * backslash pair into a protocol-relative URL too). A safe override is
 * always a plain path (optionally empty, e.g. stripping '/:id' down to '').
 */
const UNSAFE_URL_OVERRIDE_PATTERN = /^\s*(?:[a-zA-Z][a-zA-Z0-9+.-]*:|[\\/]{2})/;

export function isSafeUrlOverride(url: string): boolean {
  return !UNSAFE_URL_OVERRIDE_PATTERN.test(url);
}

/**
 * fix-2.2.0-blockers (item 3, adversarial re-probe): the SAME check
 * `src/utils/routeHelpers.ts`'s `hasUnreplacedParams` performs, kept local
 * (this module intentionally has no `utils/` dependency) so `resolveRequest`
 * can refuse to dispatch a URL that still carries a literal, unresolved
 * `:param` placeholder — the guard that was previously entirely ABSENT at
 * the dispatch site, letting a literal placeholder reach the wire (observed:
 * `DELETE /thing/:id?id=7`, when the id was supplied via `options.params`
 * instead of the request's dedicated path-params argument).
 */
const UNRESOLVED_ROUTE_PARAM_PATTERN = /:[a-zA-Z_][a-zA-Z0-9_]*/;

function hasUnresolvedRouteParam(url: string): boolean {
  return UNRESOLVED_ROUTE_PARAM_PATTERN.test(url);
}

/**
 * fix-2.2.0-blockers (ResolvedRequest redesign): the ONE URL-path
 * substitution function every dispatch path (`ApiClient.request`'s
 * `resolveRequest`, `ApiClient.requestRaw`, the standalone `minder()`) uses.
 * Substitutes every OCCURRENCE of `:key` (not just the first — a route can
 * legitimately repeat the same placeholder, e.g. '/mirror/:id/vs/:id'; a
 * plain-string, non-global `.replace()` leaves every occurrence after the
 * first as a literal, unresolved token on the wire). Returns both the
 * substituted url and the set of param keys actually consumed, so the
 * caller can exclude them from a redundant query-string.
 *
 * fix-a-hostile-route-params (RELEASE BLOCKER): every value about to fill a
 * `:key` PATH placeholder is validated via `validateRouteParamValue`
 * (routeParamSafety.ts) BEFORE substitution — a value like `'..'`, `'5#'`,
 * `'5?a=1'`, or `''` used to be spliced straight into the URL with a plain
 * `String(value)` and no encoding, letting it escape the intended URL
 * segment (walk past the route root via `..`, truncate the path at a raw
 * `#`, or inject a caller-controlled query string via a raw `?`) on EVERY
 * dispatch path that calls this function — including the standalone
 * `minder()` path with `options.params`, which had no other guard at all.
 * Because this is the single shared substitution point, fixing it here
 * closes all three paths structurally instead of adding a third/fourth copy
 * of the check. A key that is NOT consumed (no matching `:key` placeholder
 * in `url`) is never validated here — it stays an ordinary query-string
 * value, safely encoded by the HTTP client's own query serializer, not a
 * raw path substitution.
 */
export function substituteUrlParams(
  url: string,
  params: Record<string, unknown> | undefined
): { url: string; consumedKeys: Set<string> } {
  const consumedKeys = new Set<string>();
  if (!params) {
    return { url, consumedKeys };
  }
  let result = url;
  Object.entries(params).forEach(([key, value]) => {
    const placeholder = `:${key}`;
    if (result.includes(placeholder)) {
      const validation = validateRouteParamValue(value);
      if (!validation.ok) {
        throw new MinderSecurityError(
          `Refused to substitute route parameter "${key}" (${validation.reason}) into "${url}" — a malformed ` +
            `value can escape the intended URL segment (walk the path via "..", truncate it at a raw "#", or ` +
            `inject a caller-controlled query string via a raw "?") instead of addressing the resource the ` +
            `caller intended, so no request was sent.`,
          'UNSAFE_ROUTE_PARAM_VALUE',
          { key, value, url }
        );
      }
      result = result.split(placeholder).join(validation.normalized);
      consumedKeys.add(key);
    }
  });
  return { url: result, consumedKeys };
}

/**
 * Resolves ONE registered route + call-time overrides into a single
 * {@link ResolvedRequest}. This is the ONE place `ApiClient.request` computes
 * `method`/`url` for dispatch — every downstream decision (the in-flight
 * cache key, GET-dedup gating, the axios/fetch request config) reads THIS
 * output, never `route.method`/`route.url` again.
 */
export function resolveRequest(
  route: ApiRoute,
  params: Record<string, unknown> | undefined,
  overrides: { method?: unknown; url?: string } = {}
): ResolvedRequestWithKeys {
  // SECURITY (item 2): reject an unsafe override BEFORE it is used for
  // anything — including substitution/logging — so an attacker-supplied
  // absolute/protocol-relative override can never influence dispatch.
  if (overrides.url !== undefined && !isSafeUrlOverride(overrides.url)) {
    throw new MinderSecurityError(
      `Refused to dispatch through a url override that could change the request's origin: ` +
        `${JSON.stringify(overrides.url)}. An override must be a plain, same-origin PATH — never an ` +
        `absolute URL, a protocol-relative URL, or a backslash variant of either — otherwise this route's ` +
        `own headers (including any auth/API-key header) would be sent to a different, potentially ` +
        `attacker-controlled host.`,
      'UNSAFE_URL_OVERRIDE',
      { urlOverride: overrides.url }
    );
  }

  const startUrl = overrides.url ?? route.url;
  const { url, consumedKeys } = substituteUrlParams(startUrl, params);

  // item 3: a literal, unresolved ":param" placeholder must never reach the
  // wire — refuse to dispatch it with a directed error instead.
  if (hasUnresolvedRouteParam(url)) {
    throw new MinderConfigError(
      `Route URL "${url}" still has an unresolved ":param" placeholder after substitution. Supply the ` +
        `missing value via params before this request dispatches.`,
      undefined,
      'UNRESOLVED_ROUTE_PARAM',
      { url, params }
    );
  }

  // item 4: normalize the OVERRIDE and the DECLARED method INDEPENDENTLY.
  // `overrides.method ?? route.method` kept non-nullish junk (`''`, `123`,
  // ...) verbatim — the nullish-coalescing picked the junk override and
  // never even looked at `route.method` — so `normalizeHttpMethod`'s own
  // fallback ('GET') then silently discarded a perfectly valid DECLARED
  // method. Normalizing each side first means an invalid/absent override
  // (`normalizeHttpMethod(overrides.method)` -> `''`) correctly falls
  // through via `||` to the declared method instead of a generic fallback.
  const method = normalizeHttpMethod(overrides.method) || normalizeHttpMethod(route.method, 'GET');

  // item 5: the resolved method must be a syntactically valid HTTP token —
  // never reach axios/Node's raw transport with something that isn't.
  if (!HTTP_METHOD_TOKEN_PATTERN.test(method)) {
    throw new MinderConfigError(
      `"${method}" is not a valid HTTP method and cannot be dispatched.`,
      undefined,
      'INVALID_HTTP_METHOD',
      { method }
    );
  }

  const { headers, timeout, schema, model } = route;
  return { method, url, route: { headers, timeout, schema, model }, consumedKeys };
}
