/**
 * Pure helper functions extracted from useMinder.ts (QR-M1 increment 3).
 *
 * Everything in this module is a plain function: no React hook calls, no
 * reads of hook-local state (refs/context/memoized values). Callers in
 * useMinder.ts pass in whatever they need as explicit parameters. This
 * module intentionally has no "use client" directive — it is safe to import
 * from server components since it never touches React's hook runtime.
 */

import type { MinderResult, HttpMethod as ResultHttpMethod } from '../core/minder.js';
import type { RetryConfig, MinderConfig, ApiRoute } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';
import {
  replaceUrlParams,
  hasUnreplacedParams,
  getRouteSuggestions,
  extractParamNames,
} from '../utils/routeHelpers.js';
import { validateRouteParamValue } from '../core/apiClient/routeParamSafety.js';
import { MinderError } from '../errors/MinderError.js';
import type { UseMinderReturn } from './useMinder.js';

// ============================================================================
// HTTP METHOD NORMALIZATION
// ============================================================================

/**
 * CRITICAL (fix-2.2.0-blockers, adversarial re-probe): HTTP method values in a
 * route config are compared with strict `===`/`!==` against the canonical
 * uppercase `HttpMethod` constants throughout this module's resolution path
 * (`resolveFetchRouteName`, `resolveCrudOperationRoute`, `computeRouteValidation`).
 * Nothing normalized `route.method` before those comparisons, so a route
 * written `method: 'get'`/`'Get'`/`'POST '` (humans write config in mixed
 * case; the type system does not enforce the enum at runtime — see N4's
 * hand-built-config precedent) was silently misclassified as "not GET" —
 * skipping the create/update/delete redirect-to-sibling logic entirely and
 * dispatching the base route's OWN (wrong) verb instead. Every comparison in
 * this file's resolution path goes through this normalizer; the config
 * BOUNDARY (`generateCrudRoutes` in src/config/index.ts) ALSO normalizes for
 * configs built via `configureMinder()`, but a hand-built config (N4) bypasses
 * that boundary entirely, so normalizing again here (defense in depth) is
 * what actually closes the bug for every config origin. Also trims incidental
 * whitespace (e.g. a copy-pasted 'POST ').
 */
function normalizeMethod(method: unknown): string {
  return typeof method === 'string' ? method.trim().toUpperCase() : '';
}

// ============================================================================
// RETRY CONFIG
// ============================================================================

/**
 * Builds the `retry` / `retryDelay` pair TanStack Query expects, from a
 * user-supplied RetryConfig.
 */
export function createRetryConfig(retryConfig?: RetryConfig) {
  const defaultRetryableStatusCodes = [408, 429, 500, 502, 503, 504];
  const maxRetries = retryConfig?.maxRetries ?? 3;
  const retryableStatusCodes = retryConfig?.retryableStatusCodes ?? defaultRetryableStatusCodes;
  const baseDelay = retryConfig?.baseDelay ?? 1000;
  const maxDelay = retryConfig?.maxDelay ?? 30000;
  const backoffStrategy = retryConfig?.backoff ?? 'exponential';

  return {
    retry: (failureCount: number, error: any): boolean => {
      // Check max retries
      if (failureCount >= maxRetries) return false;

      // Custom shouldRetry function takes precedence
      if (retryConfig?.shouldRetry) {
        return retryConfig.shouldRetry(error, failureCount);
      }

      // Check if status code is retryable
      if (error?.status && !retryableStatusCodes.includes(error.status)) {
        return false;
      }

      return true;
    },
    retryDelay: (attemptIndex: number): number => {
      // Custom backoff function
      if (typeof backoffStrategy === 'function') {
        return Math.min(backoffStrategy(attemptIndex), maxDelay);
      }

      // Exponential backoff: baseDelay * 2^attempt
      if (backoffStrategy === 'exponential') {
        return Math.min(baseDelay * Math.pow(2, attemptIndex), maxDelay);
      }

      // Linear backoff: baseDelay * (attempt + 1)
      if (backoffStrategy === 'linear') {
        return Math.min(baseDelay * (attemptIndex + 1), maxDelay);
      }

      return baseDelay;
    },
  };
}

// ============================================================================
// QUERY KEY / REQUEST PARAM DERIVATION
// ============================================================================

/** Stabilized query key: a custom key wins, otherwise [route, params]. */
export function deriveQueryKey(
  customQueryKey: unknown[] | undefined,
  route: string,
  params: Record<string, any> | undefined
): unknown[] {
  return customQueryKey || [route, params];
}

/** Merges an infinite-query page param into the base request params. */
export function mergeRequestParams(
  baseParams: Record<string, any> | undefined,
  pageParam: any
): Record<string, any> | undefined {
  return pageParam !== undefined ? { ...baseParams, ...pageParam } : baseParams;
}

/** Namespaces the local-storage key per page for paginated local reads. */
export function deriveLocalKey(queryKey: unknown[], pageParam: any): unknown[] {
  return pageParam !== undefined ? [...queryKey, pageParam] : queryKey;
}

// ============================================================================
// ROUTE VALIDATION
// ============================================================================

export interface RouteValidationResult {
  valid: boolean;
  suggestions?: string[];
  error?: string;
}

/**
 * Pure route-validity computation, mirroring ApiClient's provider-mode
 * behavior. Ad-hoc / third-party calls bypass the route registry entirely:
 *   - an absolute http(s) URL (used verbatim),
 *   - the explicit `rawUrl` opt-in, and
 *   - a leading-slash relative PATH (e.g. '/users'), which resolves against
 *     the configured apiUrl/baseURL as a raw path.
 * Registered route NAMES never start with '/', so this never shadows a real
 * registry entry.
 */
export function computeRouteValidation(
  route: string,
  rawUrl: boolean | undefined,
  params: Record<string, any> | undefined,
  autoFetch: boolean | undefined,
  config: Pick<MinderConfig, 'routes'> | null | undefined
): RouteValidationResult {
  if (/^https?:\/\//i.test(route) || rawUrl || route.startsWith('/')) {
    return { valid: true };
  }

  if (config?.routes) {
    const routeNames = Object.keys(config.routes);
    if (!routeNames.includes(route)) {
      console.log(`[useMinder Debug] Route "${route}" not found in:`, routeNames);
      const suggestions = getRouteSuggestions(route, routeNames, 3);
      return {
        valid: false,
        suggestions,
        error: suggestions.length > 0
          ? `Route "${route}" not found. Did you mean: ${suggestions.join(', ')}?`
          : `Route "${route}" not found in configuration. Available routes: ${routeNames.slice(0, 5).join(', ')}${routeNames.length > 5 ? '...' : ''}`
      };
    }

    // Check for unreplaced parameters
    const routeConfig = config.routes[route];
    if (routeConfig && typeof routeConfig !== 'string' && hasUnreplacedParams(routeConfig.url)) {
      // N1 (fix-2.2.0-blockers, adversarial re-probe — GOLDEN PATH, properly
      // closed): a GET route whose ONLY unresolved placeholder is a TERMINAL
      // ':id' PATH segment (the single-route whole-REST-family pattern this
      // module documents at length, e.g. `itemById: { url: '/items/:id' }`)
      // is NOT actually invalid — `resolveFetchRouteName` (what the
      // auto-fetch/refetch path actually dispatches through) and
      // `resolveCrudOperationRoute` (what `operations.create` dispatches
      // through) both silently resolve it to the COLLECTION form (':id'
      // stripped) whenever no `params.id` is supplied. This function used to
      // know nothing about that and flagged the route invalid unless the
      // caller passed `{ autoFetch: false }` — and because `operations`
      // itself is only exposed when the WHOLE hook is valid (see
      // buildInvalidRouteResult / useMinder.ts's final valid/invalid
      // selection), that made `operations` undefined by DEFAULT, breaking the
      // documented Golden Path (`useMinder('users')` with no extra options)
      // for exactly the route shape N1 exists to support. Mirror the same
      // collapse here: if stripping the terminal ':id' would leave the URL
      // fully resolved (no OTHER unreplaced placeholder survives — e.g.
      // `/orgs/:orgId/items/:id` still genuinely needs `:orgId`), this route
      // is valid regardless of `autoFetch` / whether `params` was supplied.
      const suppliedHasId = !!params && Object.prototype.hasOwnProperty.call(params, 'id');
      const collapsesToValidCollection =
        !suppliedHasId &&
        normalizeMethod(routeConfig.method) === HttpMethod.GET &&
        collapsesToFullyResolvedCollection(routeConfig.url);

      if (collapsesToValidCollection) {
        return { valid: true };
      }

      if (!params) {
        // If autoFetch is false, params might be supplied later (refetch/mutate)
        if (autoFetch !== false) {
          return {
            valid: false,
            error: `Route "${route}" requires parameters: ${routeConfig.url}. Please provide params option.`
          };
        }
      } else {
        // Try to replace params
        const replacedUrl = replaceUrlParams(routeConfig.url, params);
        if (hasUnreplacedParams(replacedUrl)) {
          if (autoFetch !== false) {
            return {
              valid: false,
              error: `Route "${route}" has unreplaced parameters. URL: ${replacedUrl}`
            };
          }
        }
      }
    }
  }
  return { valid: true };
}

/**
 * Re-validates a route against dynamic mutation-time params and throws if
 * they still leave unreplaced placeholders. Mirrors the checks performed by
 * computeRouteValidation, but for the mutation path (which reacts to
 * per-call params rather than the initial hook options).
 */
export function validateMutationRoute(
  route: string,
  config: Pick<MinderConfig, 'routes'> | null | undefined,
  mergedParams: Record<string, any> | undefined,
  routeValidation: RouteValidationResult
): void {
  if (config?.routes?.[route]) {
    const routeConfig = config.routes[route];
    if (hasUnreplacedParams(routeConfig.url)) {
      const replacedUrl = replaceUrlParams(routeConfig.url, mergedParams);
      if (hasUnreplacedParams(replacedUrl)) {
        throw new Error(`Route "${route}" has unreplaced parameters. URL: ${replacedUrl}`);
      }
    }
  } else if (!routeValidation.valid) {
    throw new Error(routeValidation.error);
  }
}

// ============================================================================
// RESULT SHAPE HELPERS
// ============================================================================

/** Builds a MinderResult object with the standard metadata shape. */
export function buildMinderResult<TData>(params: {
  data: TData | null;
  error: any;
  status: number;
  success: boolean;
  method: ResultHttpMethod;
  route: string;
  cached?: boolean;
}): MinderResult<TData> {
  return {
    data: params.data,
    error: params.error,
    status: params.status,
    success: params.success,
    metadata: {
      method: params.method,
      url: params.route,
      duration: 0,
      cached: params.cached ?? false,
    },
  };
}

// ============================================================================
// MUTATION VARIABLE / OPTION MERGING
// ============================================================================

/**
 * Unwraps the internal `{ __minder_wrapper: true, data, options }` envelope
 * used by mutateData to pass per-call params/headers/axiosConfig through
 * TanStack's single-argument mutate function, falling back to treating
 * `variables` as the raw payload when it isn't wrapped.
 */
export function unwrapMutationVariables(variables: any): {
  data: any;
  runtimeOptions: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any>; method?: ResultHttpMethod };
} {
  const isInternalWrapper = variables && typeof variables === 'object' && '__minder_wrapper' in variables;
  return {
    data: isInternalWrapper ? variables.data : variables,
    runtimeOptions: isInternalWrapper ? (variables.options || {}) : {},
  };
}

/**
 * Merges hook-level options with per-call runtime options for a mutation.
 * B1c: `method` is forwarded through here so `mutate(data, { method: 'POST' })`
 * actually reaches the request — previously only `params`/`headers`/
 * `axiosConfig` survived this merge and an explicit per-call method was
 * silently discarded. A runtime-supplied method wins over the hook-level one.
 */
export function mergeMutationRuntimeOptions(
  options: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any>; method?: ResultHttpMethod },
  runtimeOptions: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any>; method?: ResultHttpMethod }
): {
  mergedParams: Record<string, any>;
  mergedHeaders: Record<string, string>;
  mergedAxiosConfig: Record<string, any>;
  mergedMethod: ResultHttpMethod | undefined;
} {
  return {
    mergedParams: { ...options.params, ...runtimeOptions.params },
    mergedHeaders: { ...options.headers, ...runtimeOptions.headers },
    mergedAxiosConfig: { ...options.axiosConfig, ...runtimeOptions.axiosConfig },
    mergedMethod: runtimeOptions.method ?? options.method,
  };
}

// ============================================================================
// CRUD SIBLING-ROUTE RESOLUTION (B1d)
// ============================================================================

/**
 * Resolves which route name (and, when no sibling route exists, which
 * explicit method) `operations.create`/`update`/`delete` should actually
 * dispatch through.
 *
 * Background: `src/config/index.ts`'s `generateCrudRoutes` expands a simple
 * string route (`{ users: '/users' }`) into a base GET route PLUS sibling
 * routes `create${Capitalized}` / `update${Capitalized}` / `delete${Capitalized}`
 * carrying the correct verb. Previously `operations.create/update/delete`
 * always addressed the base route by name, which resolves to the GET entry —
 * so a declared POST/PUT/DELETE sibling was never reached.
 *
 * Guard (deliberately conservative — this is the riskiest fix in the set):
 * only redirect/override when the CURRENT base route's method is GET. An
 * explicitly-declared non-GET route (e.g. a hand-authored `{ method: 'POST',
 * url: '/create-endpoint' }`) is never silently redirected or have its method
 * overridden — that would defeat unambiguous user intent.
 *
 * - Base route method !== GET (or unknown route): returned unchanged, no
 *   method override. This is either already-correct explicit user intent, or
 *   route resolution will surface its own "not found" error downstream.
 * - Base route is GET and the generated sibling exists: redirect to the
 *   sibling route name (its own method/url apply automatically).
 * - Base route is GET and no sibling exists (e.g. a hand-authored single GET
 *   route reused for CRUD without siblings): keep the same route/URL but
 *   return the correct explicit method to override with.
 *
 * C5 (the most dangerous defect in the fix-2.2.0-blockers set): `update`/
 * `delete` always address a SPECIFIC resource via the `id` the caller passed
 * (`operations.update(id, item)` / `operations.delete(id)`), which
 * `updateMutation`/`deleteMutation` merge into the request-time params as
 * `{ ...params, id }`. Whichever route this function resolves to MUST carry
 * an `:id` placeholder to actually receive that value — otherwise `id` is
 * silently dropped during URL substitution and the request degrades into a
 * COLLECTION-shaped one (e.g. `DELETE /users` instead of `DELETE /users/5`,
 * which is mass-delete-shaped). `assertAddressable` throws a directed
 * `MinderError` instead of ever letting that request go out, for every
 * branch that can return an update/delete route (explicit non-GET route,
 * resolved sibling, and the base-route method-override fallback).
 */
/**
 * F3 (adversarial re-probe of fix-2.2.0-blockers): `extractParamNames` scans
 * the ENTIRE url string, including anything after a `?`/`#`. A route like
 * `/q-only?uid=:id` therefore "has" an `:id` token by that check, but the id
 * only ever lands in the QUERY STRING (`uid=5`) — the URL PATH is still the
 * bare, collection-shaped `/q-only`. That is exactly the shape this guard
 * exists to refuse: `DELETE /q-only?uid=5` addresses (or, on many APIs,
 * mass-operates against) the whole collection, not resource `5`. So the
 * placeholder must be found in the PATH portion only — strip the query/
 * fragment before scanning for `:id`.
 */
function extractPathParamNames(url: string): string[] {
  const pathOnly = url.split('?')[0]!.split('#')[0]!;
  return extractParamNames(pathOnly);
}

function assertAddressable(action: 'create' | 'update' | 'delete', routeName: string, url: string): void {
  if ((action === 'update' || action === 'delete') && !extractPathParamNames(url).includes('id')) {
    const verb = action === 'delete' ? 'DELETE' : 'PUT';
    throw new MinderError(
      `operations.${action}(id, ...) cannot address a single resource through route "${routeName}" ` +
      `("${url}") — it has no ":id" placeholder in its URL PATH (a "?"/"#"-only placeholder does not ` +
      `count — the id would only ever reach the query string or fragment, leaving the path ` +
      `collection-shaped), so the id would be silently dropped or misplaced and this would send a ` +
      `collection-shaped ${verb} ${url} request instead. Add an ":id" segment to this route's PATH ` +
      `(e.g. "${url.replace(/\/?$/, '/:id')}") or register a dedicated sibling route.`,
      'CRUD_ID_PLACEHOLDER_MISSING',
      400
    );
  }
}

// ============================================================================
// N1 (fix-2.2.0-blockers, adversarial re-validation) — GOLDEN PATH COLLECTION
// RESOLUTION. The C5 guard above (assertAddressable) correctly REFUSES
// update()/delete() when a route has no ":id" placeholder to receive the id —
// but that guard's very existence exposed a second bug: a route that DOES
// carry an ":id" PATH placeholder (the natural, single-route way to register
// a whole REST resource family, e.g. `itemById: { url: '/items/:id' }`) is
// exactly what update()/delete() need, yet create()/the GET query previously
// dispatched THAT SAME route with no id ever supplied, sending the literal,
// unresolved ":id" token on the wire (`POST /items/:id`, `GET /items/:id`)
// instead of the correct COLLECTION-shaped request (`POST /items`,
// `GET /items`). The result: no single registered route could ever serve the
// full create/fetch/update(id)/delete(id) contract the README documents as
// the Golden Path — update/delete demanded an ":id" placeholder while
// create/fetch choked on that very placeholder. `stripIdPathSegment` below
// removes a literal ":id" PATH segment (never touching the query/fragment),
// producing the collection form; `resolveFetchRouteName` applies it to the
// GET/query path, and `resolveCrudOperationRoute` (further below) applies the
// equivalent to `create()`. update()/delete() are completely untouched by
// this — they still go through `assertAddressable` exactly as before, so
// every existing C5/F1-F4 hostile-id wire case keeps passing unmodified.
// ============================================================================

/**
 * MEDIUM (fix-2.2.0-blockers, adversarial re-probe): true only when the URL's
 * PATH literally ENDS in a ':id' segment (e.g. '/items/:id', '/items/:id/'
 * with a trailing slash) — the single-route whole-REST-family shape N1 exists
 * to support (`itemById: { url: '/items/:id' }`). A NON-TERMINAL ':id' (e.g.
 * '/items/:id/comments', a nested sub-resource) does NOT qualify: that route
 * has no sensible "collection" interpretation without the item id, so
 * stripping the middle segment would fabricate '/items/comments' — a URL
 * with no real collection meaning and, on a real API, almost certainly a
 * 404 — SILENTLY, since this whole mechanism exists specifically to avoid
 * throwing. `resolveFetchRouteName` / `resolveCrudOperationRoute` gate their
 * collection-form resolution on this check (not merely "does :id appear
 * anywhere in the path"), so a nested route like '/items/:id/comments' still
 * correctly surfaces the "route requires parameters" validation error instead
 * of silently dispatching a fabricated, likely-404 URL. update()/delete()
 * are unaffected either way — `assertAddressable` above intentionally keeps
 * accepting ':id' anywhere in the path (including nested/non-terminal), since
 * substitution fills in whatever position ':id' occupies; see the
 * pos-nested-route-valid-id-succeeds wire case.
 */
function hasTerminalIdSegment(url: string): boolean {
  const splitIndex = url.search(/[?#]/);
  const path = splitIndex === -1 ? url : url.slice(0, splitIndex);
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.length > 0 && segments[segments.length - 1] === ':id';
}

/**
 * Strips a literal, TERMINAL ':id' PATH segment from a route URL, producing
 * its COLLECTION form (e.g. '/items/:id' -> '/items'). Only the PATH is
 * rewritten — any query string or fragment is preserved verbatim. Callers
 * gate on `hasTerminalIdSegment` first (see its docs for why the non-terminal
 * case — e.g. '/items/:id/comments' — is deliberately never eligible), so
 * this only ever needs to remove the LAST path segment in practice; it still
 * filters defensively rather than assuming exactly one match.
 */
function stripIdPathSegment(url: string): string {
  const splitIndex = url.search(/[?#]/);
  const path = splitIndex === -1 ? url : url.slice(0, splitIndex);
  const suffix = splitIndex === -1 ? '' : url.slice(splitIndex);

  // fix-2.2.0-blockers (P11, adversarial re-probe): the previous
  // `segments.filter((segment) => segment !== ':id')` removed EVERY segment
  // literally equal to ':id' — not just the terminal one. A route with a
  // REPEATED ':id' placeholder (e.g. 'GET /p11/:id/mirror/:id') has a
  // NON-terminal ':id' too, and the caller only gates this function on the
  // TERMINAL one being present (see hasTerminalIdSegment) — filtering out
  // the non-terminal occurrence as well silently FABRICATED '/p11/mirror', a
  // URL that never resolves any real resource and was never asked for. Only
  // the LAST segment is ever removed here, positionally, scanning from the
  // end past any trailing-slash-induced empty segments (e.g.
  // '/items/:id/'.split('/') === ['', 'items', ':id', '']).
  const segments = path.split('/');
  let removeIndex = segments.length - 1;
  while (removeIndex >= 0 && segments[removeIndex] === '') {
    removeIndex--;
  }
  if (removeIndex >= 0 && segments[removeIndex] === ':id') {
    segments.splice(removeIndex, 1);
  }
  let strippedPath = segments.join('/');
  // Removing the LAST segment can leave a trailing slash (e.g. '/items/:id'
  // -> '/items/'); removing a MIDDLE segment cannot (the join above never
  // introduces a doubled slash, since the element is dropped, not blanked).
  // Never collapse a bare '/' down to ''.
  if (strippedPath.length > 1 && strippedPath.endsWith('/')) {
    strippedPath = strippedPath.slice(0, -1);
  }
  return strippedPath + suffix;
}

/**
 * True only when stripping the route's TERMINAL ':id' segment leaves a URL
 * with NO other unresolved placeholder — i.e. the route can be collapsed to
 * a genuinely fully-resolved collection URL. A route with a NON-terminal or
 * repeated placeholder (e.g. '/p11/:id/mirror/:id', '/orgs/:orgId/items/:id')
 * must never be silently offered as a collection-form override — callers
 * gating on this must either resolve correctly or refuse, never dispatch a
 * fabricated or partially-substituted URL.
 */
function collapsesToFullyResolvedCollection(url: string): boolean {
  return hasTerminalIdSegment(url) && !hasUnreplacedParams(stripIdPathSegment(url));
}

/**
 * N1 continued — the GET/query-side half of the Golden Path fix.
 * `operations.fetch()` and the hook's own auto-fetch/`refetch()` do not go
 * through `resolveCrudOperationRoute`; they dispatch directly by route name
 * (see `createQueryFn` in useMinder.ts). This mirrors that function's
 * collection-resolution logic for the GET path: only strips when the route
 * is (a) actually registered, (b) declares an explicit GET method (case-
 * normalized — see `normalizeMethod` — and mirrors `resolveCrudOperationRoute`'s
 * own conservative GET-only guard; an already-explicit non-GET route is never
 * touched), (c) has an unresolved TERMINAL ':id' PATH placeholder (see
 * `hasTerminalIdSegment` — a non-terminal/nested ':id', e.g.
 * '/items/:id/comments', is never eligible), and (d) the caller hasn't
 * supplied an `id` via params — a supplied `params.id` resolves the
 * placeholder normally through the existing substitution path, preserving
 * the single-resource-GET contract the c5-id-route-no-redundant-query-param
 * wire case already locks in. N4: a route whose config entry is still the
 * unexpanded shorthand STRING form (see the identical guard in
 * resolveCrudOperationRoute) IS itself the collection URL — return it
 * directly so ApiClient dispatches it as a raw path, bypassing the
 * (unexpanded) registry entry entirely, instead of reading `.url`/`.method`
 * off a string primitive. This function never throws — it only ever narrows
 * what gets dispatched.
 *
 * HIGH (fix-2.2.0-blockers, adversarial re-probe — raw-path config loss):
 * previously returned the STRIPPED URL as a bare string in place of the
 * route NAME, which made the caller (`createQueryFn` in useMinder.ts) pass it
 * to `ApiClient.request()` as an unregistered raw path — bypassing the
 * ORIGINAL registered route's `headers`/`schema`/`timeout`/dedup entirely
 * (failing open on auth headers and response validation). Now returns the
 * SAME route NAME plus a separate `urlOverride`, so the caller keeps
 * dispatching THROUGH the registered route (all of its config intact) with
 * only the URL swapped to the collection form. The N4/unregistered-route
 * cases have no route config to preserve in the first place, so they are
 * unaffected — they keep returning a bare routeName with no override.
 */
export function resolveFetchRouteName(
  routeName: string,
  configRoutes: Record<string, ApiRoute> | undefined,
  params: Record<string, any> | undefined
): { routeName: string; urlOverride?: string } {
  const route = configRoutes?.[routeName];
  if (route === undefined) {
    return { routeName };
  }
  if (typeof route === 'string') {
    return { routeName: route };
  }
  if (normalizeMethod(route.method) !== HttpMethod.GET) {
    return { routeName };
  }
  const hasIdParam = !!params && Object.prototype.hasOwnProperty.call(params, 'id');
  // P11 (fix-2.2.0-blockers, adversarial re-probe): gate on the STRONGER
  // "collapses to a fully-resolved collection" check, not merely "has a
  // terminal ':id'" — a route with a REPEATED placeholder (e.g.
  // '/p11/:id/mirror/:id') has a terminal ':id' too, but stripping only
  // that one still leaves the non-terminal occurrence unresolved. Defense
  // in depth: `computeRouteValidation` already refuses this route upstream
  // (so the auto-fetch/refetch queryFn throws before this ever runs), but
  // this function is directly callable/testable on its own — it must never
  // offer a urlOverride that still carries an unresolved placeholder.
  if (hasIdParam || !collapsesToFullyResolvedCollection(route.url)) {
    return { routeName };
  }
  return { routeName, urlOverride: stripIdPathSegment(route.url) };
}

// ============================================================================
// CRUD ID VALUE VALIDATION (C5 continued — the id VALUE, not just the route
// shape). `assertAddressable` above only proves the resolved route has an
// ":id" placeholder to receive a value at all; it says nothing about the
// value itself. A syntactically fine route can still be handed a hostile id
// that reaches `replaceUrlParams`/ApiClient's own `String(value)` path
// substitution unchecked:
//   - '' (empty)            -> ":id" replaced with "" -> a COLLECTION-shaped
//     URL (e.g. "DELETE /things/" instead of "DELETE /things/5"), which many
//     APIs treat as a mass-operation against the whole collection.
//   - null / undefined      -> String()-coerce to the LITERAL strings
//     "null" / "undefined", silently addressing a resource that (almost
//     certainly) doesn't exist while swallowing the caller's real bug.
//   - NaN                   -> String(NaN) === "NaN", same class of bug.
//   - whitespace-only       -> passes a truthy/defined check but is
//     semantically empty once trimmed.
//   - a value containing '..', '/', '\\' (or a percent-encoded variant of
//     either, e.g. "%2e%2e", "%2f", "%5c") -> escapes the URL SEGMENT the
//     ":id" placeholder was meant to fill. Against a route shaped
//     "/things/:id", an id of ".." does not stay inside that segment — it
//     can walk the resulting URL up past the collection, in the worst case
//     to the server ROOT (the "DELETE /" catastrophe).
//   - a value containing '?' or '#' -> `replaceUrlParams` is a plain string
//     substitution with NO encoding whatsoever (verified: routeHelpers.ts's
//     `replaceUrlParams` is `url.replace(':id', String(value))`), so these
//     reach the final URL raw. Every HTTP client this library dispatches
//     through (axios, fetch, node:http) then parses THAT string as a URL:
//     '?' opens a caller-controlled QUERY STRING (observed: an id of
//     '5?force=1' turns `DELETE /things/:id` into `DELETE /things/5?force=1`
//     — many real APIs change delete semantics on query flags like
//     `force`/`cascade`/`permanent`), and '#' opens a fragment that silently
//     truncates everything after it from the actual request (observed: an id
//     of '5#' against `/t/:id/comments` sends `DELETE /t/5` — the PARENT
//     resource — instead of `/t/5/comments`). Exactly the same "escapes the
//     URL segment" class '..'/'/' already cover.
//   - a raw control character, space, or DEL (0x00-0x20, 0x7f) -> never valid
//     unencoded in an HTTP request line/path. CR/LF specifically enable
//     request-line/header injection (a percent-encoded '%0d%0a' decodes to
//     one after `fullyDecodeBounded`, so it is caught the same way). These
//     are refused proactively with a directed error rather than left to
//     surface as a low-level transport exception.
// Every one of these throws BEFORE any request is built, so zero requests
// reach the wire — mirrored by the wire cases tagged C5 in
// tests/wire/method-contract.mjs.
// ============================================================================

/**
 * fix-a-hostile-route-params (RELEASE BLOCKER): this used to be a SEPARATE,
 * independently-maintained copy of the hostile-value pattern/decode/describe
 * logic (`ID_PATH_HOSTILE_PATTERN`/`fullyDecodeBounded`/`describeInvalidId`).
 * That duplication was itself part of the defect class this release keeps
 * finding — a guard living on exactly one code path while a sibling path to
 * the same sink (the standalone `minder()` + `options.params` route-template
 * substitution) had no guard at all, because there was nothing structurally
 * forcing both paths through the SAME check. Both now call
 * `validateRouteParamValue` (`src/core/apiClient/routeParamSafety.ts`) — the
 * identical detector `resolveRequest.ts`'s `substituteUrlParams` calls before
 * splicing a value into a `:param` URL-path segment on EVERY dispatch path
 * (`ApiClient.request`, `ApiClient.requestRaw`, standalone `minder()`). There
 * is exactly one hostile-value detector in the codebase now, not two that can
 * silently drift apart the next time either is edited.
 */

/**
 * Validates the id VALUE passed to `operations.update`/`operations.delete`.
 * Throws a directed `MinderError` (never lets a hostile id reach a request)
 * for: null/undefined, any type other than string/number/bigint, a
 * non-finite number (NaN/Infinity/-Infinity), empty string, whitespace-only,
 * a value that cannot be percent-decoded, and any value containing a path
 * separator, query/fragment delimiter, control character, or traversal
 * sequence (raw or percent-encoded). Delegates the actual detection to
 * `validateRouteParamValue` — see the block comment above.
 */
export function assertValidResourceId(action: 'update' | 'delete', id: unknown): void {
  const validation = validateRouteParamValue(id);
  if (!validation.ok) {
    throw new MinderError(
      `operations.${action}(id, ...) refused an invalid id (${validation.reason}). A malformed id can silently ` +
      `address the wrong resource — or the entire collection, or the server root — instead of failing ` +
      `loudly, so no request was sent.`,
      'CRUD_INVALID_ID',
      400,
      { action, id }
    );
  }
}

const CRUD_METHOD_BY_ACTION: Record<'create' | 'update' | 'delete', HttpMethod> = {
  create: HttpMethod.POST,
  update: HttpMethod.PUT,
  delete: HttpMethod.DELETE,
};

export function resolveCrudOperationRoute(
  baseRouteName: string,
  action: 'create' | 'update' | 'delete',
  configRoutes: Record<string, ApiRoute> | undefined,
  params?: Record<string, any>
): { routeName: string; method?: HttpMethod; urlOverride?: string } {
  // N4: declared type is `ApiRoute`, but at runtime a hand-built config
  // (never passed through configureMinder()'s generateCrudRoutes) can still
  // hand this a bare shorthand STRING — widen the type here so the
  // `typeof === 'string'` guard below actually narrows instead of TS
  // collapsing that branch to `never` against the (unenforced) declared type.
  const baseRoute = configRoutes?.[baseRouteName] as ApiRoute | string | undefined;

  // N4 (fix-2.2.0-blockers, adversarial re-validation): llms.txt/README
  // document BOTH (a) a shorthand STRING route (`{ things: '/things' }`)
  // that auto-expands into full GET/`create${Name}`/`update${Name}`/
  // `delete${Name}` CRUD routes (`generateCrudRoutes`, src/config/index.ts),
  // and (b) `<MinderDataProvider config={...}>` accepting a config "from
  // configureMinder(), or hand-built" (llms.txt). Combined, that means a
  // hand-built config object can legitimately still carry an un-expanded
  // shorthand string — `generateCrudRoutes` only ever runs INSIDE
  // `configureMinder()`. Previously nothing handled this: `baseRoute.method`/
  // `.url` silently read `undefined` off the string primitive, and for
  // update/delete that `undefined` URL reached `assertAddressable` ->
  // `extractPathParamNames`'s `url.split('?')` — a bare, unhelpful TypeError
  // thrown from inside the library. Rather than requiring configureMinder(),
  // mirror `generateCrudRoutes`' own algorithm inline (base URL = the string
  // itself; create -> POST the base URL; update/delete -> PUT/DELETE
  // `${base}/:id`) and dispatch via the SAME ad-hoc/raw-path escape hatch the
  // `!baseRoute` branch below already uses (ApiClient treats any leading-'/'
  // routeName as a raw path, bypassing the — in this case unexpanded, broken
  // — registry entry entirely) — so the documented shorthand actually works
  // on a hand-built config, not just one built through configureMinder().
  if (typeof baseRoute === 'string') {
    if (action === 'create') {
      return { routeName: baseRoute, method: CRUD_METHOD_BY_ACTION.create };
    }
    const idUrl = `${baseRoute.replace(/\/$/, '')}/:id`;
    return { routeName: idUrl, method: CRUD_METHOD_BY_ACTION[action] };
  }

  if (!baseRoute) {
    // C5 (ad-hoc bypass): `baseRouteName` is not a registered route — it is
    // an ad-hoc/raw path (leading "/"), an absolute http(s) URL, or a
    // `rawUrl:true` escape hatch, so `baseRouteName` itself IS the URL that
    // will be dispatched (ApiClient's requestRaw, which has no registry
    // entry to consult). requestRaw infers the METHOD purely from whether a
    // body is present — bodyless -> GET, body-carrying -> POST — which
    // previously let `operations.delete(id)` silently become a bodyless GET
    // (dropping the id AND sending the wrong verb) and
    // `operations.update(id, item)` silently become a POST that CREATES a
    // record instead of updating one. Force the correct explicit verb so
    // requestRaw's inference never runs for a CRUD operation, and — via
    // assertAddressable — refuse outright when this raw URL has nowhere to
    // put the id (no ":id" segment in `baseRouteName` itself).
    assertAddressable(action, baseRouteName, baseRouteName);
    return { routeName: baseRouteName, method: CRUD_METHOD_BY_ACTION[action] };
  }

  if (normalizeMethod(baseRoute.method) !== HttpMethod.GET) {
    assertAddressable(action, baseRouteName, baseRoute.url);
    return { routeName: baseRouteName };
  }

  const singular = baseRouteName.replace(/s$/, '');
  const capitalized = singular.charAt(0).toUpperCase() + singular.slice(1);
  const siblingName = `${action}${capitalized}`;

  if (configRoutes && Object.prototype.hasOwnProperty.call(configRoutes, siblingName)) {
    const sibling = configRoutes[siblingName]!;
    assertAddressable(action, siblingName, sibling.url);
    return { routeName: siblingName };
  }

  // N1 (fix-2.2.0-blockers, adversarial re-validation — Golden Path): no
  // create-sibling is registered, and this GET base route's own URL carries
  // an unresolved TERMINAL ':id' PATH placeholder (see `hasTerminalIdSegment`
  // — a non-terminal/nested ':id', e.g. '/items/:id/comments', is never
  // eligible here) — the natural shape of a single hand-registered route
  // reused for the whole CRUD family (e.g. `itemById: { url: '/items/:id' }`).
  // create() addresses the COLLECTION, never one resource, so dispatching the
  // literal ":id" token on the wire (`POST /items/:id`) is always wrong;
  // resolve to the collection form instead (`POST /items`), via
  // `stripIdPathSegment`. Skipped when the caller explicitly supplied
  // `params.id` — that resolves the placeholder normally through the
  // existing substitution path. update()/delete() are NEVER eligible for
  // this branch (the `action === 'create'` guard) — they fall straight
  // through to the UNCHANGED assertAddressable call below, exactly as before
  // this fix.
  //
  // HIGH (fix-2.2.0-blockers, adversarial re-probe — raw-path config loss):
  // previously returned the stripped URL as `routeName` itself, which made
  // the caller (createMutation in useMinder.ts) dispatch it as an
  // unregistered raw path — bypassing `baseRoute`'s own `headers`/`schema`/
  // `timeout`/dedup entirely. Now returns the ORIGINAL `baseRouteName` plus a
  // separate `urlOverride`, so the caller keeps dispatching THROUGH the
  // registered route (all of its config intact) with only the URL swapped.
  if (action === 'create') {
    const hasIdParam = !!params && Object.prototype.hasOwnProperty.call(params, 'id');
    if (!hasIdParam && hasTerminalIdSegment(baseRoute.url)) {
      // P11 (fix-2.2.0-blockers, adversarial re-probe): `operations.create()`
      // is exposed regardless of `computeRouteValidation` (unlike the GET/
      // auto-fetch path — see resolveFetchRouteName's own P11 comment), so
      // THIS is the only guard standing between a route with a REPEATED
      // placeholder (e.g. 'GET /p11/:id/mirror/:id') and a broken/fabricated
      // dispatch. Stripping only the terminal ':id' can still leave another
      // occurrence unresolved — refuse outright (zero requests reach the
      // wire) rather than silently fabricating a wrong collection URL (the
      // old, buggy stripIdPathSegment) OR dispatching the raw,
      // still-placeholder-carrying URL unchanged.
      if (!collapsesToFullyResolvedCollection(baseRoute.url)) {
        throw new MinderError(
          `operations.create() cannot resolve route "${baseRouteName}" ("${baseRoute.url}") to a collection ` +
          `URL — stripping its trailing ":id" still leaves "${stripIdPathSegment(baseRoute.url)}" with an ` +
          `unresolved placeholder (a repeated or additional ":id"/param). Register a dedicated create sibling ` +
          `route, or supply the missing value via params, so this can resolve — never a fabricated or ` +
          `literally-unresolved URL.`,
          'CRUD_COLLECTION_UNRESOLVED',
          400
        );
      }
      return {
        routeName: baseRouteName,
        method: CRUD_METHOD_BY_ACTION.create,
        urlOverride: stripIdPathSegment(baseRoute.url),
      };
    }
  }

  assertAddressable(action, baseRouteName, baseRoute.url);
  return { routeName: baseRouteName, method: CRUD_METHOD_BY_ACTION[action] };
}

// ============================================================================
// INVALID-ROUTE RESULT
// ============================================================================

/**
 * Builds the fully-shaped UseMinderReturn contract returned when a route
 * fails validation — every method is a safe no-op/throw so consumers can
 * destructure the hook's return value without null checks.
 */
export function buildInvalidRouteResult<TData = any>(
  routeValidation: RouteValidationResult,
  route: string
): UseMinderReturn<TData> {
  const validationError = new MinderError(routeValidation.error || 'Invalid route', 'ROUTE_VALIDATION_ERROR', 400);
  return {
    data: null,
    items: null,
    loading: false,
    error: validationError,
    success: false,
    refetch: async () => ({
      data: null,
      error: validationError,
      status: 400,
      success: false,
      metadata: { method: HttpMethod.GET, url: route, duration: 0, cached: false }
    }),
    mutate: async () => ({
      data: null,
      error: validationError,
      status: 400,
      success: false,
      metadata: { method: HttpMethod.POST, url: route, duration: 0, cached: false }
    }),
    auth: {
      setToken: async () => { },
      getToken: () => null,
      clearAuth: async () => { },
      isAuthenticated: () => false,
      setRefreshToken: async () => { },
      getRefreshToken: () => null,
      getCurrentUser: () => null,
    },
    cache: {
      invalidate: async () => { },
      prefetch: async () => { },
      clear: () => { },
      getStats: () => [],
      isQueryFresh: () => false,
    },
    websocket: {
      connect: () => { },
      disconnect: () => { },
      send: () => { },
      subscribe: () => () => { },
      isConnected: () => false,
    },
    upload: {
      uploadFile: async () => { throw new Error(routeValidation.error); },
      uploadMultiple: async () => { throw new Error(routeValidation.error); },
      progress: { loaded: 0, total: 0, percentage: 0 },
      isUploading: false,
    },
    isFetching: false,
    isStale: false,
    isMutating: false,
    invalidate: async () => { },
    cancel: async () => { },
    isCancelled: false,
    query: {},
    mutation: {},
  };
}
