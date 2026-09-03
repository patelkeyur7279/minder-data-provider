/**
 * 🎯 MINDER - Universal Data Provider Function
 * 
 * The ONE function that handles EVERYTHING:
 * - GET, POST, PUT, DELETE, PATCH requests
 * - File uploads with progress tracking
 * - FormData handling
 * - Model class integration (encode/decode)
 * - Automatic error handling (never throws)
 * - TanStack Query integration (caching, deduplication)
 * - WebSocket support (realtime updates)
 * 
 * @example
 * // Simple GET
 * const { data } = await minder('users');
 * 
 * @example
 * // Create with POST
 * const { data } = await minder('users', { name: 'John' });
 * 
 * @example
 * // Update with PUT
 * const { data } = await minder('users/1', { name: 'Jane' });
 * 
 * @example
 * // Delete
 * const { data } = await minder('users/1', { method: 'DELETE' });
 * 
 * @example
 * // File upload with progress
 * const { data } = await minder('upload', file, {
 *   onProgress: (p) => console.log(`${p.percentage}%`)
 * });
 * 
 * @example
 * // With model class (auto encode/decode)
 * const { data } = await minder('users', userData, {
 *   model: UserModel // Your custom model class
 * });
 */

import type { AxiosRequestConfig, AxiosProgressEvent, AxiosInstance } from 'axios';
import type {
  HttpMethod,
  MinderOptions,
  MinderResult,
  MinderError,
  MinderConfig,
  UploadProgress
} from './minder/types.js';
import type { InferOutput, StandardSchemaV1 } from '../types/standard-schema.js';
import {
  detectMethod,
  isFileUpload,
  encodeWithModel,
  decodeWithModel,
  handleError,
  isEdgeRuntime
} from './minder/utils.js';
import { normalizeHttpMethod, substituteUrlParams } from './apiClient/resolveRequest.js';
import { sealOutgoingRequest } from './apiClient/outgoingHeaders.js';
import {
  assertNoOriginOrTransportOptions,
  pickForwardableRequestOptions,
} from './apiClient/requestOptions.js';
import { MinderSecurityError, MinderConfigError, MinderNetworkError } from '../errors/index.js';
// PX2 (fix): reuse the SAME ProxyManager class the provider path
// (MinderDataProvider.tsx / ApiClient.dispatchResolved) builds from
// `corsHelper`/`cors.enabled` — see the standalone proxy-rewrite step below.
import { ProxyManager } from './ProxyManager.js';
// R1/RL1 (fix): reuse the SAME CSRF/rate-limit primitives
// ApiClient.applySecurityHeaders already applies, instead of a second,
// independently-maintained implementation.
import { telemetry } from '../utils/TelemetryTracker.js';

// Re-export types for backward compatibility
export type { 
  HttpMethod, 
  MinderOptions, 
  MinderResult, 
  MinderError,
  UploadProgress 
} from './minder/types.js';

// ============================================================================
// GLOBAL CONFIGURATION
// ============================================================================

import { getGlobalMinderConfig } from './globalConfig.js';
import { minderStore } from './singletons.js';

// D3: axios is a runtime `dependency` (kept per owner decision — NOT a peer),
// but it must not sit in the static import graph, since a plain
// `import { useMinder }` consumer would otherwise pay for it even on the
// edge/fetch transport path (isEdgeRuntime()), which never touches axios at
// all. Cached module-level promise mirrors the existing lazy pattern used
// below for `./responseValidation.js`. Deliberately module-scoped (not
// per-call) so concurrent in-flight requests share one import().
//
// Type note: deliberately `Promise<unknown>`, not axios's own module type.
// `import('axios')` (an expression) resolves against axios's ESM types,
// while `typeof import('axios')` (a type query, used in a CJS-context file
// under this project's NodeNext resolution) resolves against its *different*
// CJS `export =` types — two incompatible shapes for the SAME runtime value,
// so no single type both compiles here. Real type safety is applied at the
// call site via the `AxiosInstance` cast instead. Verified directly (both
// targets that actually execute this file — real Node ESM `import()`, the
// tsup `.mjs` build's runtime, and ts-jest's commonjs downlevel used by every
// test) that the resolved module carries a `.default` holding the callable
// axios instance; the `??` fallback below covers a bare CJS `require()`
// shape too, in case some future build target ever produces one.
let axiosPromise: Promise<unknown> | undefined;
function loadAxios(): Promise<unknown> {
  axiosPromise ??= import('axios');
  return axiosPromise;
}

// minder()'s URL-resolution bag (baseURL/headers/timeout/token) — C3. Together
// with the routes-aware registry (getGlobalMinderConfig) this forms ONE unified
// config: the registry supplies url/method/headers/timeout for registered route
// NAMES, and this bag supplies the baseURL/headers/token used to actually
// dispatch the request. `configureMinder()` from `src/config` is the single
// source of truth that writes both stores.
//
// This bag is a DISTINCT store from the routes-aware globalConfig.ts one (C1):
// they have different defaults (C1 starts `null`; this one starts populated with
// baseURL/timeout/headers) and different write paths, so they are NOT merged
// into one cell — see the C1/C3 note in the Spec 1.3c report. Both now live on
// the process-wide singleton store (./singletons.ts) for chunk-duplication-proof
// identity, so `configureMinder()` and standalone minder() reads can never land
// on opposite sides of a forked copy.
const defaultMinderUrlConfig = (): MinderConfig => ({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function minderUrlConfig(): MinderConfig {
  const s = minderStore();
  return (s.minderUrlConfig ??= defaultMinderUrlConfig());
}

/**
 * Internal: write minder()'s URL-resolution config (baseURL/headers/timeout/
 * token). Used by the unified `configureMinder()` (src/config) so both global
 * stores stay in sync. Does NOT emit a deprecation warning.
 * @internal
 */
export function setMinderGlobalConfig(config: Partial<MinderConfig>): void {
  minderStore().minderUrlConfig = { ...minderUrlConfig(), ...config };
}

/**
 * Internal: read minder()'s current URL-resolution config (for tests/tools).
 * @internal
 */
export function getMinderGlobalConfig(): MinderConfig {
  return minderUrlConfig();
}

/**
 * Configure minder globally.
 *
 * @deprecated Use `configureMinder` from `minder-data-provider` (or
 * `minder-data-provider/config`) instead — it is the single source of truth and
 * also registers your routes. This baseURL/headers-only configurator is kept as
 * a deprecated alias (exposed as `minder.config()`) that writes the same
 * underlying store.
 *
 * @example
 * minder.config({
 *   baseURL: 'https://api.example.com',
 *   token: 'your-jwt-token'
 * });
 */
export function configureMinder(config: Partial<MinderConfig>): void {
  const s = minderStore();
  if (!s.minderDeprecationWarned) {
    s.minderDeprecationWarned = true;
    console.warn(
      '[Minder] `minder.config()` / `configureMinder` from core is deprecated. ' +
      'Use `configureMinder` from "minder-data-provider" instead (it also registers routes).'
    );
  }
  setMinderGlobalConfig(config);
}

import { StreamClient, type StreamOptions } from './StreamClient.js';
// fix-a-app-router-crash-offline-parity (BLOCKER 1): `peekPluginManager()`
// reads the shared plugin manager WITHOUT constructing one when it doesn't
// exist yet (the common case for a bare `await minder(...)` with no plugins
// registered) — every hook site below already guards on `pm.size > 0`, so
// "nothing registered yet" and "no manager constructed yet" are the same
// answer. This matters because the top-level `pluginManager` Proxy export
// (and even a plain `pluginManagerSingleton()` accessor calling `new
// PluginManager()`) both depend on a tsup cross-entry deferred chunk
// initializer that a real `next build` + Route Handler/Server Component
// reproduction showed Next.js App Router's webpack does not reliably
// trigger — throwing directly out of `minder()` (violates the documented
// never-throws contract) either on the Proxy access or on `new
// PluginManager()` itself. See the fuller root-cause note in
// ../plugins/PluginSystem.ts.
import { peekPluginManager, isShortCircuitResponse } from '../plugins/PluginSystem.js';
import type { InterceptableRequest } from '../plugins/PluginSystem.js';
// B2: standalone minder() previously performed ZERO sanitization even when
// `security.sanitization` was configured on the global registry — a silent
// no-op returning `{success:true}` while shipping raw input. Reuse the exact
// sanitizer class and the shared body-sanitizing helper ApiClient already
// uses, rather than a second implementation.
// C1/RL1 (fix): reuse the SAME CSRF/rate-limit primitives
// ApiClient.applySecurityHeaders already applies, instead of a second,
// independently-maintained implementation.
import { XSSSanitizer, CSRFTokenManager, RateLimiter } from '../utils/security.js';
import { sanitizeRequestData } from './apiClient/upload.js';

// ============================================================================
// RETRY SUPPORT (MDPD-23)
// ============================================================================

/**
 * Backoff sleep used between minder() retry attempts. Injectable so tests can
 * substitute a zero-delay implementation instead of waiting on real timers.
 * @internal
 */
const defaultRetrySleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Held on the singleton store (C3) so a test's injected sleep and the retry loop
// that consumes it can never end up on opposite sides of a duplicated chunk.
function retrySleep(ms: number): Promise<void> {
  const s = minderStore();
  return (s.minderRetrySleep ??= defaultRetrySleep)(ms);
}

/**
 * Testing hook: override (or reset, by passing null) the retry backoff sleep.
 * @internal
 */
export function __setRetrySleepForTesting(
  fn: ((ms: number) => Promise<void>) | null
): void {
  minderStore().minderRetrySleep = fn ?? defaultRetrySleep;
}

/**
 * Whether a failed request should be retried. Retry network errors (status 0),
 * 5xx server errors, and 429 rate-limits — but NOT 4xx client errors, which are
 * deterministic and would just fail again.
 */
function isRetryableFailure(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * fix-a-app-router-crash-offline-parity (H1/H1b): a SIDE-EFFECT-FREE peek at
 * the HTTP status a failed transport attempt would classify to — used ONLY
 * to decide retry eligibility inside the retry loop below. Deliberately does
 * NOT call `handleError`/`buildApiError`: those now auto-queue a mutation
 * into the OfflineManager as a side effect of classifying a no-response
 * failure (the actual H1 fix), and the retry loop can invoke this check
 * multiple times for the SAME logical `minder()` call — calling the real
 * classifier here would auto-queue once per ATTEMPT instead of once per
 * logical call, over-queueing a single failed mutation on every retry.
 * `handleError` itself still runs exactly once, in the terminal `catch`
 * below, after the retry loop has genuinely given up (retries exhausted,
 * non-retryable status, or a non-idempotent method) — so the auto-queue
 * side effect fires exactly once per logical call regardless of how many
 * transport attempts it took.
 *
 * Mirrors (without invoking) buildApiError's own status determination: an
 * axios-shaped `.response.status` when present, 408 for a genuine timeout
 * (matching `MinderTimeoutError`'s statusCode), otherwise 0 (every other
 * no-response failure — matching every other `Minder*Error` this module's
 * classifier can throw).
 */
function peekRetryStatus(error: unknown): number {
  if (error && typeof error === 'object') {
    if ('response' in error) {
      return (error as { response?: { status?: number } }).response?.status ?? 0;
    }
    if ((error as { code?: unknown }).code === 'ECONNABORTED') {
      return 408;
    }
  }
  return 0;
}

/**
 * Methods safe to retry by default. Per RFC 7231 these are idempotent — resending
 * them cannot produce duplicate side effects — matching axios-retry's convention.
 * POST/PATCH are deliberately excluded so a transient 502/503/429 never silently
 * resubmits a non-idempotent write; callers opt those in with
 * `retryNonIdempotent: true`.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/**
 * Whether the given method may be retried. Idempotent methods always may; POST
 * and PATCH only when the caller explicitly opts in via `retryNonIdempotent`.
 */
function isRetryableMethod(method: string, retryNonIdempotent: boolean): boolean {
  return retryNonIdempotent || IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/** Backoff delay for a given (1-based) attempt: 100ms * attempt, capped at 1s. */
function retryBackoffMs(attempt: number): number {
  return Math.min(100 * attempt, 1000);
}

// ============================================================================
// RESPONSE CACHE (MDPD-24)
// ============================================================================

/** Default response-cache TTL when neither options.cacheTTL nor config supplies one. */
const DEFAULT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  /** Deep-copied successful MinderResult (data/status/headers). */
  result: MinderResult;
  /** Epoch ms after which this entry is stale. */
  expiresAt: number;
  /** Epoch ms when this entry was stored (used for CacheHitEvent.age). */
  storedAt: number;
}

/**
 * Module-level TTL cache for standalone minder() GET results. Only populated
 * when a caller opts in with `{ cache: true }`. Keyed by
 * method+URL+params+auth-identity — the auth component (a short hash of
 * `options.token` / the Authorization header, never the raw value) partitions
 * entries per credential so one user's cached authenticated response can never
 * be served to a different user on a shared (SSR/Node) process. Capped at
 * MAX_RESPONSE_CACHE_ENTRIES; the oldest entry is evicted on overflow.
 * @internal
 */
function responseCache(): Map<string, CacheEntry> {
  const s = minderStore();
  return (s.minderResponseCache ??= new Map<string, CacheEntry>()) as Map<string, CacheEntry>;
}

/** Hard cap on cached entries; oldest (insertion order) evicted on overflow. */
const MAX_RESPONSE_CACHE_ENTRIES = 200;

/**
 * p-c1-csrf-token-header (fix): standalone minder()'s CSRF token manager —
 * ONE process-wide instance, lazily created on first use (matches
 * `responseCache()`/`retrySleep()` above). Persistence matters here: the
 * manager itself caches the generated/retrieved token in an instance field
 * (`CSRFTokenManager.getToken()`), mirroring how ApiClient's own
 * `csrfManager` is constructed once per instance and reused for its
 * lifetime — a fresh manager per call would still usually agree (it falls
 * through to shared cookie/sessionStorage), but would generate a NEW random
 * token every call in an environment with neither available (SSR/Node).
 * @internal
 */
function csrfManager(cookieName?: string): CSRFTokenManager {
  const s = minderStore();
  return (s.minderCsrfManager ??= new CSRFTokenManager(cookieName));
}

/**
 * p-rl1-rate-limiting (fix): standalone minder()'s rate limiter — ONE
 * process-wide instance (its in-memory request-timestamp store IS the
 * rate-limit state, so it MUST persist across calls; a fresh instance per
 * call would never actually limit anything). Mirrors ApiClient's own
 * per-instance `rateLimiter`.
 * @internal
 */
function rateLimiter(): RateLimiter {
  const s = minderStore();
  return (s.minderRateLimiter ??= new RateLimiter());
}

/**
 * p-d1-inflight-deduplication (fix): standalone minder()'s in-flight
 * request map — mirrors ApiClient's own gate
 * (`isGet && config.performance?.deduplication`, ApiClient.ts
 * dispatchResolved). Keyed by method+resolved-url+params; a concurrent
 * identical GET AWAITS the SAME promise instead of dispatching its own
 * transport call. Entries are removed once their promise settles (see the
 * dedup gate in minder() below).
 * @internal
 */
function inFlightDedupMap(): Map<string, Promise<MinderResult<unknown>>> {
  const s = minderStore();
  return (s.minderInFlightDedup ??= new Map<string, Promise<MinderResult<unknown>>>());
}

/**
 * djb2 hash, hex-encoded — a tiny non-cryptographic fingerprint used ONLY to
 * partition cache keys by credential without embedding the raw token/header
 * value in the key string (keys can surface in debug output). Edge-safe.
 */
function hashAuthIdentity(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Derive the cache key's auth-identity component from the per-request
 * credentials: `options.token` and/or an Authorization header. No credentials →
 * the stable constant 'anon'.
 */
function cacheAuthIdentity(
  token: string | undefined,
  headers: Record<string, unknown> | undefined
): string {
  const authHeader = headers
    ? Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1]
    : undefined;
  if (!token && authHeader === undefined) return 'anon';
  return hashAuthIdentity(`${token ?? ''}\u0000${String(authHeader ?? '')}`);
}

/**
 * Absolute-URL test with axios parity (axios's own isAbsoluteURL): a scheme
 * (`https://`, `custom-scheme:`) OR a protocol-relative `//host/...` prefix
 * bypasses baseURL. Keeping the cache key and the fetch transport on the same
 * regex axios uses means keys always match what is actually dispatched.
 */
const ABSOLUTE_URL_RE = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

/** Store a cache entry, evicting the oldest entry when the cap is exceeded. */
function setCacheEntry(key: string, entry: CacheEntry): void {
  const cache = responseCache();
  // Delete-first so a re-set refreshes the key's insertion position.
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > MAX_RESPONSE_CACHE_ENTRIES) {
    // Maps iterate in insertion order — the first key is the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Clear the standalone minder() response cache. Called on (re)configuration and
 * exposed for tests.
 * @internal
 */
export function clearMinderCache(): void {
  responseCache().clear();
}

/** Structured deep copy so cached results can't be mutated through aliasing. */
function deepCopyResult<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (typeof sc === 'function') {
    try {
      return sc(value);
    } catch {
      /* fall through to JSON clone */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Build the cache key from method, resolved URL, serialized params, and the
 * auth-identity fingerprint (see cacheAuthIdentity — never the raw credential).
 */
function buildCacheKey(
  method: string,
  resolvedUrl: string,
  params: unknown,
  authIdentity: string
): string {
  let serializedParams = '';
  if (params && typeof params === 'object') {
    const entries = Object.entries(params as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    serializedParams = JSON.stringify(entries);
  }
  return `${method} ${resolvedUrl} ${serializedParams} ${authIdentity}`;
}

/**
 * Resolve the effective cache TTL: explicit option wins, then the global config
 * cache's staleTime/ttl, then a 60s default.
 */
function resolveCacheTtl(optionTtl: number | undefined): number {
  if (typeof optionTtl === 'number') return optionTtl;
  const cfg = getGlobalMinderConfig() as
    | { cache?: { staleTime?: number; ttl?: number } }
    | undefined;
  return cfg?.cache?.staleTime ?? cfg?.cache?.ttl ?? DEFAULT_CACHE_TTL_MS;
}

// ============================================================================
// CORE MINDER FUNCTION
// ============================================================================

/**
 * 🎯 MINDER - The universal data provider function
 *
 * Handles all HTTP operations with smart detection
 * NEVER throws errors - always returns structured result
 */
// Task 3.1: when a per-call `options.schema` is present, infer `data`'s type
// from the validator instead of the caller-supplied `TData` generic — the
// route-def `ApiRoute.schema` (registry-only) stays runtime-only, matching
// the rest of the untyped string-route registry.
export async function minder<S extends StandardSchemaV1<any, any>>(
  route: string,
  data: any,
  options: MinderOptions & { schema: S }
): Promise<MinderResult<InferOutput<S>>>;
export async function minder<TData = any>(
  route: string,
  data?: any,
  options?: MinderOptions
): Promise<MinderResult<TData>>;
export async function minder<TData = any>(
  route: string,
  data?: any,
  options?: MinderOptions
): Promise<MinderResult<TData>> {
  const startTime = Date.now();
  
  try {
    // 0. Consult the unified route registry: when `route` is a registered NAME,
    //    resolve its url/method/headers/timeout from the registry entry (with
    //    trivial `:param` substitution). When `route` is a URL/path, behavior is
    //    unchanged — it is used verbatim.
    const registry = getGlobalMinderConfig();
    const registryRoute = registry?.routes?.[route];

    // p-u5-unknown-route-name-typo (fix): mirror ApiClient.request's
    // ROUTE_NOT_FOUND guard (ApiClient.ts) — a bare NAME (no leading '/' and
    // no scheme) that is absent from the SAME shared registry
    // (`getGlobalMinderConfig`) is almost certainly a typo, not an
    // intentional literal path/hostname. Before this check, `registryRoute`
    // was simply `undefined` and the typo'd NAME itself became the
    // dispatched path — a silent, real request to whatever that string
    // resolves to. A leading-'/' path (an explicit ad-hoc-path convention,
    // matching ApiClient's own `routeName.startsWith('/')` exemption) or an
    // absolute `scheme://` URL is NEVER treated as a typo — both remain
    // valid, unregistered escape hatches exactly as before. Thrown here so
    // it is caught by this function's own try/catch below and surfaces as
    // the documented `{ success: false, error }` result, never an uncaught
    // throw — the "never throws by default" contract is preserved.
    const looksLikeAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(route);
    if (!registryRoute && !route.startsWith('/') && !looksLikeAbsoluteUrl) {
      const availableRoutes = Object.keys(registry?.routes || {});
      const notFoundError = new MinderConfigError(
        `Route '${route}' not found in configuration`,
        `routes.${route}`,
        'ROUTE_NOT_FOUND',
        { requestedRoute: route, availableRoutes }
      );
      notFoundError.addSuggestion({
        message: `Available routes: ${availableRoutes.join(', ') || 'none configured'}`,
        action: 'Add this route to your configuration or check for typos',
        link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#routes'
      });
      throw notFoundError;
    }

    let url = route;
    // fix-a-hostile-route-params (RELEASE BLOCKER): the keys `substituteUrlParams`
    // actually consumed for PATH substitution — excluded from the query-string
    // below (see step 2) so a ':id' route never also appends a redundant/
    // hostile-remainder '?id=...'. Mirrors ApiClient.dispatchResolved's own
    // `consumedKeys` filtering (ApiClient.ts) for the SAME reason.
    //
    // p-u3u4-positional-params-unregistered-path (fix): substitution now runs
    // UNCONDITIONALLY (not only `if (registryRoute)`) — minder() has no
    // positional-params calling convention, so `options.params` is its ONLY
    // channel for path substitution; gating it on registration meant an
    // unregistered path (e.g. `/thing/:id`) could NEVER have `:id`
    // substituted from minder(), even though the identical
    // `options.params`-shaped call substitutes correctly for a REGISTERED
    // route. The starting URL is the route's own declared URL when
    // registered, otherwise `route` itself (unchanged fallback) — the
    // UNSAFE_ROUTE_PARAM_VALUE/consumed-key logic inside `substituteUrlParams`
    // is already registration-agnostic.
    // fix-2.2.0-blockers (ResolvedRequest migration): substitute through
    // the SAME single-source-of-truth helper `ApiClient`'s `resolveRequest`
    // uses — a plain-string `.replace()` only replaces the FIRST
    // occurrence, leaving every subsequent one as a literal, unresolved
    // ':key' token on the wire for a route that repeats the same
    // placeholder (e.g. '/mirror/:id/vs/:id').
    //
    // fix-a-hostile-route-params (RELEASE BLOCKER): `substituteUrlParams`
    // now validates every value it substitutes into a ':param' path
    // segment (routeParamSafety.ts's `validateRouteParamValue`) and THROWS
    // a `MinderSecurityError` (code `UNSAFE_ROUTE_PARAM_VALUE`) before
    // returning anything if a value could escape that segment — e.g.
    // `{ id: '..' }` walking the path past the route root, `{ id: '5#' }`
    // truncating it at a raw fragment delimiter, `{ id: '5?a=1' }`
    // injecting a caller-controlled query string, or `{ id: '' }` silently
    // falling through to the collection. That throw is caught by this
    // function's own try/catch below and returned as a structured
    // `{ success: false, error }` result — `minder()`'s documented
    // "never throws by default" contract — so zero requests reach the wire.
    const substituted = substituteUrlParams(registryRoute ? registryRoute.url : url, options?.params);
    url = substituted.url;
    const consumedParamKeys: Set<string> = substituted.consumedKeys;

    // 1. Detect HTTP method (explicit option > registry entry > auto-detect)
    let method = detectMethod(route, data, options);
    if (registryRoute && !options?.method) {
      // fix-2.2.0-blockers (ResolvedRequest migration): normalize the SAME
      // way ApiClient's resolveRequest does — a hand-authored registry entry
      // can declare `method: 'get'`/`'POST '` (mixed case / stray
      // whitespace; nothing enforces the HttpMethod enum at runtime), and an
      // un-trimmed method reaching the transport can throw a raw,
      // unhelpful error instead of dispatching. Falls back to the already
      // auto-detected `method` (not a hardcoded default) if the registry
      // entry's own method is somehow empty/non-string.
      method = normalizeHttpMethod(registryRoute.method, method) as unknown as HttpMethod;
    }
    // p-m3-untrimmed-method-whitespace (fix): normalize the FINAL resolved
    // method (trim + uppercase) UNCONDITIONALLY — previously this only ran
    // for the registry-declared branch above; an explicit `options.method`
    // (or the auto-detected result) reached the wire completely
    // unnormalized, so a caller-supplied `'  post  '` (untrimmed) was
    // refused by axios/Node's raw HTTP layer (ERR_INVALID_HTTP_TOKEN)
    // instead of dispatching as a clean 'POST' — exactly like the identical
    // call already does on the provider path (ApiClient.requestRaw /
    // resolveRequest, both of which normalize via this SAME function).
    method = normalizeHttpMethod(method, method) as unknown as HttpMethod;

    // 2. Build request config
    //
    // fix-2.2.0-blockers (item 1, PROBED — not the same shape): unlike the
    // ApiClient.requestRaw defect this round fixed, `config` here is built by
    // hand-picking SPECIFIC named fields off `options` (baseURL/url/method/
    // timeout/headers/params below) rather than an unconstrained
    // `...options`/`...otherOptions` spread — `proxy`/`adapter`/
    // `transformRequest`/`transformResponse`/`httpAgent`/`httpsAgent`/
    // `socketPath`/`beforeRedirect` are simply never read from `options` and
    // have no path to this config at all. `options.baseURL` IS a real,
    // pre-existing, top-level `MinderOptions` field (documented: "Base URL
    // override") — a deliberate, visible escape hatch for pointing a
    // standalone call at a different API, analogous to passing an absolute
    // URL as `route` itself, not a quiet side-channel override buried in a
    // generic options bag. fix-2.2.0-blockers (BLOCKER 1, resolved): that
    // escape hatch was ALSO an exfiltration channel — a registered route's own
    // declared headers and the ambient bearer token were attached
    // unconditionally, regardless of `baseURL`, so redirecting the
    // destination redirected the credentials with it. See the guard
    // immediately below, which refuses `options.baseURL` whenever it would
    // carry either along.
    const urlConfig = minderUrlConfig();

    // p-px2-cors-proxy-rewrite (fix): port ApiClient's ProxyManager
    // URL-rewrite + header injection into the standalone path — it already
    // has access to the SAME unified registry (`registry.corsHelper`/the
    // deprecated `registry.cors` alias). Mirrors MinderDataProvider.tsx's
    // OWN construction of a `ProxyManager` from the identical config shape.
    // Previously minder() contained no proxy code at all, so a
    // `corsHelper.proxy`-configured backend was simply unreachable from the
    // standalone path in a real browser (CORS would block the direct
    // request) — a capability gap, not a stylistic difference.
    const corsConfig = registry?.corsHelper || registry?.cors;
    const proxyManager = corsConfig?.enabled
      ? new ProxyManager({
          enabled: true,
          baseUrl: corsConfig.proxy || '/api/minder-proxy',
          headers: { 'X-Target-URL': registry?.apiBaseUrl || '' },
          timeout: 30000,
        })
      : undefined;

    // fix-2.2.0-blockers (BLOCKER 1, SECURITY, standalone minder() path):
    // `options.baseURL` changes WHERE this request is sent. Applying the SAME
    // reasoning the ApiClient choke point (apiClient/requestOptions.ts)
    // applies to its own per-call option bag: a caller-supplied option that
    // redirects the destination must never silently travel with credentials
    // the LIBRARY attached — not the caller, for THIS specific call — namely
    // a registered route's own declared headers (e.g. a static `X-Api-Key`)
    // or the ambient bearer token configured via `minder.config()`/
    // `configureMinder()`. Before this fix, `minder('registeredRoute',
    // undefined, { baseURL: 'http://attacker' })` sent BOTH to whatever host
    // the caller named, with no throw and `success:true`.
    //
    // A caller's OWN explicit `options.token`/`options.headers` for THIS call
    // is left alone — that is the caller deliberately directing their own
    // credential, the documented (if still worth a warning) escape hatch for
    // pointing a call at a different host, not an ambient leak; see
    // docs/MIGRATION_GUIDE.md.
    const routeDeclaresCredentials = Boolean(
      registryRoute?.headers && Object.keys(registryRoute.headers).length > 0
    );
    const hasAmbientToken = Boolean(!options?.token && urlConfig.token);
    if (options?.baseURL && (routeDeclaresCredentials || hasAmbientToken)) {
      const credentialSources: string[] = [];
      if (routeDeclaresCredentials) credentialSources.push("this route's own declared headers");
      if (hasAmbientToken) credentialSources.push("the ambient bearer token set via configureMinder()/minder.config()");
      throw new MinderSecurityError(
        `Refused to dispatch "${route}" to the per-call "baseURL" override ("${options.baseURL}") — ` +
        `${credentialSources.join(' and ')} would otherwise be attached to that destination, and a ` +
        `caller-supplied option that redirects a request must never silently carry credentials the ` +
        `library attached. Configure this destination as the route's own baseURL instead ` +
        `(configureMinder() / the route registry), or supply your own credentials explicitly for ` +
        `this call via options.token / options.headers if you intend to send them to a different host.`,
        'UNSAFE_REQUEST_OPTION_OVERRIDE',
        { route, baseURL: options.baseURL }
      );
    }

    const config: AxiosRequestConfig = {
      baseURL:
        options?.baseURL ||
        urlConfig.baseURL ||
        (registryRoute ? registry?.apiBaseUrl : undefined) ||
        '',
      url,
      method,
      timeout: options?.timeout || registryRoute?.timeout || urlConfig.timeout,
      headers: {
        ...urlConfig.headers,
        ...registryRoute?.headers,
        // p-px2-cors-proxy-rewrite (fix): proxy headers sit BETWEEN the
        // route's own declared headers and the caller's per-call headers —
        // mirrors ApiClient.dispatchResolved's identical ordering
        // (`route.headers`, then `proxyManager.getProxyHeaders()`, then
        // `customHeaders`) — so an explicit per-call header still wins.
        ...(proxyManager?.getProxyHeaders() || {}),
        ...options?.headers,
      },
      // fix-a-hostile-route-params (RELEASE BLOCKER): a key already
      // substituted into the URL PATH (`consumedParamKeys`, from step 0
      // above) must never ALSO ride along as a query-string param — mirrors
      // ApiClient.dispatchResolved's identical `consumedKeys` filtering
      // (ApiClient.ts). Previously `options.params` was forwarded here
      // verbatim regardless of what step 0 already substituted, so a
      // ':id' route's own id (or, before the substitution guard above, a
      // hostile query-string fragment split off of it) was appended a
      // SECOND time as a redundant/leaking '?id=...'.
      params:
        options?.params && consumedParamKeys.size > 0
          ? Object.fromEntries(
              Object.entries(options.params).filter(([key]) => !consumedParamKeys.has(key))
            )
          : options?.params,
    };

    // p-px2-cors-proxy-rewrite (fix): rewrite the outgoing URL through the
    // proxy and clear `baseURL` (the rewritten URL is already absolute) —
    // mirrors ApiClient.dispatchResolved's identical
    // `proxyManager.rewriteUrl(url, route); requestConfig.baseURL = '';`
    // step. Placed AFTER `config` is fully built (so it overrides the
    // hand-computed `baseURL`/`url` above) and BEFORE `options.axiosConfig`
    // is applied (whose forwardable allowlist has no `url`/`baseURL` member
    // anyway, so ordering here doesn't matter for that step — this is simply
    // the earliest point after `config.url` exists).
    if (proxyManager?.isEnabled()) {
      config.url = proxyManager.rewriteUrl(config.url || url);
      config.baseURL = '';
    }

    // fix-b-transport-storage-websocket (HIGH 6 + HIGH 7): `options.axiosConfig`
    // is documented (minder/types.ts) as the standalone path's escape hatch
    // for `signal`/`timeout`/`responseType`/`onUploadProgress`/
    // `onDownloadProgress`/`withCredentials`/`validateStatus`/
    // `paramsSerializer`/`decompress` — but this function never actually read
    // it. `abort()` (an `AbortController.abort()` wired to `axiosConfig.signal`)
    // had ZERO effect: the request ran to completion regardless, because
    // axios never received a `signal` at all. Same story for
    // `validateStatus` — axios always fell back to its own default
    // (2xx-only) success classification. Reuses the EXACT SAME choke point
    // the provider (`ApiClient`) path already applies to its own per-call
    // option bag (`apiClient/requestOptions.ts`) rather than a second,
    // independently-maintained allowlist: `assertNoOriginOrTransportOptions`
    // throws a directed `MinderSecurityError` if `axiosConfig` tries to smuggle
    // `url`/`baseURL`/`proxy`/`adapter`/... (the exact origin/transport-hijack
    // family that module's own doc comment explains), then
    // `pickForwardableRequestOptions` returns a BRAND NEW object containing
    // ONLY the vetted keys — nothing else can reach `config` through this
    // path, so a caller can never use `axiosConfig` to reintroduce the very
    // credential-exfiltration channels `options.baseURL` is separately
    // guarded against above. Applied AFTER the hand-built fields above (so an
    // explicit `axiosConfig.timeout` can override the auto-detected
    // route/global timeout — the documented "per-call timeout override") but
    // its TYPE has no `url`/`baseURL`/`method`/`headers`/`params` member at
    // all, so it can never clobber them regardless of merge order.
    if (options?.axiosConfig) {
      assertNoOriginOrTransportOptions(options.axiosConfig);
      Object.assign(config, pickForwardableRequestOptions(options.axiosConfig));
    }

    // 3. Add authentication token
    // p-a1-custom-auth-header-prefix (fix): read `auth.authHeader`/
    // `auth.authTokenPrefix` off the SAME unified registry
    // ApiClient.applySecurityHeaders already honours (ApiClient.ts), instead
    // of hardcoding the header name/prefix. A caller who sets
    // `auth.authHeader:'X-Auth-Token'` via `configureMinder()` now gets that
    // header on standalone calls too, not a plain `Authorization: Bearer`
    // the target API may not expect. An empty-string `authTokenPrefix` sends
    // the raw token with no prefix (falsy-prefix branch), matching
    // applySecurityHeaders' own ternary exactly.
    const token = options?.token || urlConfig.token;
    if (token) {
      const authHeader = registry?.auth?.authHeader || 'Authorization';
      const authPrefix =
        registry?.auth?.authTokenPrefix !== undefined ? registry.auth.authTokenPrefix : 'Bearer';
      config.headers![authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
    }

    // p-c1-csrf-token-header / p-rl1-rate-limiting (fix): honour
    // `security.csrfProtection`/`security.rateLimiting` on the standalone
    // path exactly as ApiClient.applySecurityHeaders does for the provider
    // path — both read the SAME unified `configureMinder()` config, and were
    // previously a silent no-op here (CSRF: every standalone mutation went
    // out unprotected against a CSRF-enforcing API; rate limiting: standalone
    // calls always dispatched regardless of the configured limit). Ordered
    // immediately after the auth token, mirroring applySecurityHeaders'
    // (token -> CSRF -> rate limit) sequence.
    if (registry?.security?.csrfProtection) {
      const csrfConfig =
        typeof registry.security.csrfProtection === 'object'
          ? registry.security.csrfProtection
          : { enabled: true, headerName: 'X-CSRF-Token' };
      const headerName = csrfConfig.headerName || 'X-CSRF-Token';
      config.headers![headerName] = csrfManager(csrfConfig.cookieName).getToken();
    }

    if (registry?.security?.rateLimiting) {
      const rateLimitKey = `${method}:${config.url ?? url}`;
      const { requests, window: rateLimitWindow } = registry.security.rateLimiting;
      if (!rateLimiter().check(rateLimitKey, requests, rateLimitWindow)) {
        telemetry.recordRateLimitHit();
        throw new MinderNetworkError(
          'Rate limit exceeded. Please try again later.',
          429,
          undefined,
          undefined,
          undefined,
          'RATE_LIMIT_EXCEEDED'
        );
      }
    }

    // fix-percall-header-redirect-leak (ADR-B): `sensitiveHeaders` is no
    // longer set HERE. This early in assembly it can only ever see the
    // route's OWN declared headers plus whatever `urlConfig`/`options.headers`
    // already merged above (line ~593) — it can never see a header the
    // plugin `onRequestIntercept` middleware injects further down (~line
    // 826), which is exactly the ordering gap that left plugin- and
    // ambient-token-shaped headers unprotected. Sealed instead immediately
    // before dispatch (see below, after the plugin interceptor block and
    // the Authorization injection above) via the SAME choke point ApiClient
    // uses — `./apiClient/outgoingHeaders.js` — so the two paths cannot
    // independently drift out of sync again.

    // 4. Handle file upload
    if (isFileUpload(data)) {
      // BLOCKER 2 (transport-and-packaging fix): a hand-set, boundary-less
      // 'multipart/form-data' Content-Type breaks multipart parsing on any
      // transport that actually sends it verbatim — fetch does (see the
      // native-fetch dispatch below); axios does not, because its own
      // FormData serialization recomputes and overrides this header with a
      // correctly-boundaried value regardless of what is set here (verified
      // empirically against axios's Node http adapter, including the global
      // WHATWG FormData this branch produces). Deleting it instead of
      // setting it is therefore safe for BOTH transports, and mirrors the
      // identical Content-Type removal `applyRequestBody`
      // (apiClient/upload.ts) already does for the provider/ApiClient path.
      delete config.headers!['Content-Type'];
      delete config.headers!['content-type'];

      // Convert to FormData if needed
      if (!(data instanceof FormData)) {
        const formData = new FormData();
        // Guard the browser-only FileList global (undefined in Node/edge) so a
        // File/Blob upload on the server doesn't throw "FileList is not defined".
        if (typeof FileList !== 'undefined' && data instanceof FileList) {
          Array.from(data).forEach((file, index) => {
            formData.append(`file${index}`, file);
          });
        } else {
          formData.append('file', data);
        }
        config.data = formData;
      } else {
        config.data = data;
      }
      
      // Upload progress tracking
      if (options?.onProgress) {
        config.onUploadProgress = (progressEvent: AxiosProgressEvent) => {
          const progress: UploadProgress = {
            loaded: progressEvent.loaded,
            total: progressEvent.total || 0,
            percentage: progressEvent.total 
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0,
          };
          options.onProgress!(progress);
        };
      }
    }
    // 5. Handle regular data
    // C2: DELETE must be able to carry a body — the ApiClient/provider path
    // (applyRequestBody in ./apiClient/upload.js) already sends a body for
    // ANY method (its only guard is `if (!data) return`), so excluding
    // DELETE here as well as GET made the two paths disagree: a
    // `minder('users/8', { reason }, { method: 'DELETE' })` call silently
    // dropped `{ reason }` and sent an empty body with content-type still
    // declared as application/json. Only GET is excluded now (a GET body is
    // not meaningful and was never sent by either path).
    else if (method !== 'GET') {
      // Encode with model if provided
      const encodedData = encodeWithModel(data, options?.model);

      // B2: honour `security.sanitization` on the standalone path exactly as
      // ApiClient.request does — construct the sanitizer, await ready() so a
      // browser call never races the lazy DOMPurify import into the
      // fail-closed SANITIZER_UNAVAILABLE throw (H2), then route the body
      // through the shared sanitizeRequestData helper (H3: opt-in per field,
      // not a blanket walk — a pass-through when no `fields` are configured).
      let sanitizer: XSSSanitizer | undefined;
      if (registry?.security?.sanitization) {
        sanitizer = new XSSSanitizer(registry.security.sanitization);
        await sanitizer.ready();
      }
      const sanitizedData = sanitizeRequestData(encodedData, sanitizer);

      // p-b4-xml-string-body (fix): mirror ApiClient's dedicated '<?xml'
      // string branch (apiClient/upload.ts's applyRequestBody) — without it,
      // an XML string body fell through to axios's default JSON transform,
      // which wraps it in quotes and escapes internal quotes/slashes,
      // altering the BODY CONTENT (not just the Content-Type) for any
      // XML-speaking backend on the standalone path.
      if (typeof sanitizedData === 'string' && sanitizedData.startsWith('<?xml')) {
        config.data = sanitizedData;
        config.headers!['Content-Type'] = 'application/xml';
      } else {
        config.data = sanitizedData;
      }
    }
    
    // 6. Execute request
    let responseData: any;
    let responseStatus = 0;
    let responseHeaders: Record<string, string> = {};
    let shortCircuited = false;

    // MDPD-24: opt-in response cache for standalone minder() GETs. Only active
    // when the caller passes `{ cache: true }` — the default and cache:false
    // paths are unchanged. A fresh cache hit returns a deep copy with
    // metadata.cached=true and never touches the transport.
    const cacheEnabled = options?.cache === true && method === 'GET';
    let cacheKey: string | null = null;
    if (cacheEnabled) {
      const requestUrlForKey = config.url || '';
      const resolvedUrl = ABSOLUTE_URL_RE.test(requestUrlForKey)
        ? requestUrlForKey
        : (config.baseURL || '') + requestUrlForKey;
      const authIdentity = cacheAuthIdentity(
        options?.token,
        (options?.headers ?? config.headers) as Record<string, unknown> | undefined
      );
      cacheKey = buildCacheKey(method, resolvedUrl, config.params, authIdentity);
      const entry = responseCache().get(cacheKey);
      if (entry && entry.expiresAt > Date.now()) {
        const cached = deepCopyResult(entry.result) as MinderResult<TData>;
        // Entries store the RAW (pre-model-decode) response data; decode per hit
        // so `options.model` consumers get a fresh instance with its prototype
        // intact (structuredClone would strip class prototypes if we cached the
        // decoded object). Without a model this is a pass-through.
        cached.data = decodeWithModel<TData>(cached.data, options?.model);
        cached.metadata = {
          ...(cached.metadata as NonNullable<MinderResult['metadata']>),
          duration: Date.now() - startTime,
          cached: true,
        };
        // MDPD-5: notify cache-observability plugins of the hit (fire-and-forget,
        // error-isolated per plugin). Zero-overhead when no plugin is registered.
        const cacheHitPm = peekPluginManager();
        if (cacheHitPm && cacheHitPm.size > 0) {
          void cacheHitPm.executeCacheHitHooks({
            key: cacheKey,
            value: cached.data,
            age: Date.now() - entry.storedAt,
            timestamp: Date.now(),
          });
        }
        if (options?.onSuccess) {
          options.onSuccess(cached.data);
        }
        return cached;
      }
      if (entry) {
        // Stale — drop it so the map doesn't grow unbounded with dead entries.
        responseCache().delete(cacheKey);
      }
      // MDPD-5: a cache-enabled GET with no fresh entry is a miss (first-ever or
      // expired) — notify observability plugins before we touch the transport.
      const cacheMissPm = peekPluginManager();
      if (cacheMissPm && cacheMissPm.size > 0) {
        void cacheMissPm.executeCacheMissHooks(cacheKey);
      }
    }

    // p-d1-inflight-deduplication (fix): in-flight deduplication for
    // standalone GETs, mirroring ApiClient's own gate
    // (`isGet && config.performance?.deduplication`, ApiClient.ts
    // dispatchResolved) — previously `performance.deduplication` was
    // honoured only by the provider path; the SAME unified config was a
    // silent no-op here, so two concurrent identical minder() GETs always
    // dispatched twice. Computed AFTER the cache-hit fast path above (a
    // cache hit never reaches here) and BEFORE any of the plugin-intercept/
    // seal/transport logic below runs: a deduped "follower" call does NONE
    // of that work itself — it purely awaits the SAME promise the "leader"
    // call already registered. Everything from here through the success
    // result below is wrapped in `dispatchPromise` so it can be shared
    // between concurrent callers; wrapping (rather than restructuring
    // control flow) keeps this a purely ADDITIVE change when dedup is not
    // enabled — `dispatchPromise` still runs exactly once, immediately.
    const dedupEnabled = method === 'GET' && registry?.performance?.deduplication === true;
    let dedupKey: string | null = null;
    if (dedupEnabled) {
      const requestUrlForDedupKey = config.url || '';
      const resolvedUrlForDedup = ABSOLUTE_URL_RE.test(requestUrlForDedupKey)
        ? requestUrlForDedupKey
        : (config.baseURL || '') + requestUrlForDedupKey;
      dedupKey = `DEDUP ${method} ${resolvedUrlForDedup} ${JSON.stringify(config.params ?? null)}`;
      const existingInFlight = inFlightDedupMap().get(dedupKey);
      if (existingInFlight) {
        return (await existingInFlight) as unknown as MinderResult<TData>;
      }
    }

    const dispatchPromise: Promise<MinderResult<TData>> = (async (): Promise<MinderResult<TData>> => {
    // Mutating request middleware: registered plugins may rewrite the outgoing
    // config or short-circuit the request with a synthetic response. Runs after
    // the config is fully assembled and before the transport dispatch. Guarded
    // so there is zero overhead when no plugin implements the hook.
    const interceptPm = peekPluginManager();
    if (interceptPm && interceptPm.size > 0 && interceptPm.hasRequestInterceptors()) {
      const interceptable: InterceptableRequest = {
        url: config.url || route,
        method,
        headers: (config.headers as Record<string, string>) || {},
        params: config.params as Record<string, unknown> | undefined,
        data: config.data,
        routeName: registryRoute ? route : undefined,
      };
      const intercepted = await interceptPm.executeRequestInterceptors(interceptable);
      if (isShortCircuitResponse(intercepted)) {
        responseData = intercepted.response.data;
        responseStatus = intercepted.response.status;
        responseHeaders = intercepted.response.headers || {};
        shortCircuited = true;
      } else {
        // Apply the middleware's mutations back onto the outgoing config.
        config.url = intercepted.url;
        config.method = intercepted.method as HttpMethod;
        config.headers = intercepted.headers;
        config.params = intercepted.params;
        config.data = intercepted.data;
      }
    }

    // Fire plugin request hooks (global plugins; non-blocking observability)
    const requestHookPm = peekPluginManager();
    if (requestHookPm && requestHookPm.size > 0) {
      void requestHookPm.executeRequestHooks({
        method,
        url: route,
        headers: config.headers as Record<string, string> | undefined,
        body: data,
        timestamp: startTime,
      });
    }

    // fix-percall-header-redirect-leak (ADR-B): seal immediately before
    // dispatch — AFTER the plugin `onRequestIntercept` middleware above may
    // have replaced `config.headers` entirely, and AFTER the Authorization
    // injection (step 3, above). `sealOutgoingRequest` derives the
    // cross-origin-redirect strip-set from `config.headers` as they stand
    // right now, so a per-call `options.header`, an ambient token, or a
    // plugin-injected header is covered by construction, plus the effective
    // auth/CSRF header names by name (the axios request interceptor sets the
    // ACTUAL Authorization value later, inside `axios(config)`'s own
    // dispatch, but the NAME is already known from config here). The retry
    // loop below reuses this SAME `config` object on every attempt — no
    // plugin re-interception happens on retry — so sealing once, here, is
    // correct for every attempt.
    //
    // KNOWN GAP (both native-fetch transports, deliberately out of scope —
    // see the identical note on ApiClient.dispatchNativeFetch): the fetch
    // branch below (`useFetch`) never reads `config.sensitiveHeaders` at
    // all — `fetch()` follows redirects itself. undici/browsers strip
    // authorization/cookie/host/proxy-authorization on a cross-origin
    // redirect per spec; the residual exposure is a CUSTOM sensitive header
    // surviving a cross-origin redirect under `transport:'fetch'`.
    sealOutgoingRequest(config, registry);

    // Transport selection:
    // - An EXPLICIT `transport: 'fetch'` always wins, INCLUDING for complex
    //   requests (file uploads / progress) — BLOCKER 2 (transport-and-
    //   packaging fix): this used to be unconditionally forced onto axios
    //   regardless of the caller's explicit choice, which is exactly why
    //   axios's own internal transport-selection fallback (used wherever its
    //   Node HTTP adapter is unavailable — bare Cloudflare Workerd and
    //   similar) still ran and could set RequestInit fields the runtime
    //   doesn't implement, even though the caller had explicitly asked to
    //   bypass axios entirely via `transport:'fetch'`. Mirrors the SAME rule
    //   the provider's ApiClient already applies uniformly to EVERY request
    //   including uploads (`useNativeFetch`, ApiClient.ts) — see the FormData
    //   handling in the fetch branch below for the corresponding body fix.
    //   Upload progress has no fetch equivalent, so `onProgress` silently
    //   does not fire under an explicit `transport:'fetch'` — a documented
    //   trade-off, matching ApiClient.dispatchNativeFetch's own "no
    //   onUploadProgress equivalent" limitation.
    // - Without an explicit 'fetch', complex requests still prefer axios (its
    //   onUploadProgress support has no fetch equivalent) — unchanged default
    //   semantics for existing Node/browser callers.
    // - `'axios'` forces axios.
    // - `'auto'` (and unset) pick fetch ONLY in an edge runtime (isEdgeRuntime),
    //   where axios's Node HTTP adapter is unavailable and would otherwise fail.
    //   Node and browser keep the axios default unchanged — so this can never
    //   silently change request semantics for existing Node/browser callers; it
    //   only makes edge (previously broken with the default) transparently work.
    const isComplexRequest = isFileUpload(data) || options?.onProgress || config.onUploadProgress;
    const transport = options?.transport;
    const explicitFetch = transport === 'fetch';
    const wantsFetch =
      explicitFetch ||
      ((transport === 'auto' || transport === undefined) && isEdgeRuntime());
    const useFetch = explicitFetch || (wantsFetch && !isComplexRequest);

    // MDPD-23: explicit retry for the standalone minder() path. minder() never
    // rejects, so TanStack's retry can't help here — retryable transport
    // failures (network / 5xx / 429; NOT 4xx) are retried up to options.retries
    // times with a small backoff. Short-circuited (plugin-synthesized) responses
    // are never retried. The never-throws contract is preserved: after retries
    // are exhausted the original error propagates to the terminal handler below,
    // which fires onError/plugin hooks exactly once and returns a failure result.
    const maxRetries =
      options?.retries && options.retries > 0 ? Math.floor(options.retries) : 0;
    let retryAttempt = 0;

    while (true) {
      try {
        if (shortCircuited) {
          // A plugin already produced a synthetic response — skip the transport
          // entirely (responseData/status/headers were set during interception).
        } else if (!useFetch) {
          const axiosModule = await loadAxios();
          const axios = (axiosModule as { default?: AxiosInstance }).default ?? (axiosModule as AxiosInstance);
          const response = await axios(config);
          responseData = response.data;
          responseStatus = response.status;
          responseHeaders = response.headers as Record<string, string>;
        } else {
          // Super-fast native fetch path
          // MDPD-18: absolute http(s) URLs bypass the configured baseURL, mirroring
          // the axios path — otherwise baseURL is double-prefixed onto the absolute
          // URL (e.g. 'http://BASEhttp://x/api').
          const requestUrl = config.url || '';
          let fullUrl = ABSOLUTE_URL_RE.test(requestUrl)
            ? requestUrl
            : (config.baseURL || '') + requestUrl;
      
          // Handle query parameters
          if (config.params) {
            const queryParams = new URLSearchParams();
            Object.entries(config.params).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                queryParams.append(key, String(value));
              }
            });
            const queryString = queryParams.toString();
            if (queryString) {
              fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
            }
          }

          // BLOCKER 2 (transport-and-packaging fix): a FormData body (file
          // upload, now reachable here whenever the caller sets an explicit
          // `transport:'fetch'` — see the transport-selection comment above)
          // previously fell into the `JSON.stringify(config.data)` branch
          // below, which stringifies a FormData instance to the literal
          // string '{}' (it has no enumerable own properties) — a broken,
          // empty body reaching the server. fetch accepts a FormData body
          // directly and computes its own multipart boundary; pass it
          // through untouched instead of stringifying it. Its Content-Type
          // is never forced here — step 4 above already deleted the
          // hand-set, boundary-less 'multipart/form-data' header for exactly
          // this reason, so fetch is free to set its own correctly-
          // boundaried Content-Type.
          const isFormDataBody = typeof FormData !== 'undefined' && config.data instanceof FormData;
          const fetchOptions: RequestInit = {
            method: config.method,
            headers: config.headers as Record<string, string>,
            body: (config.method !== 'GET' && config.method !== 'HEAD' && config.data)
              ? (isFormDataBody || typeof config.data === 'string' ? config.data : JSON.stringify(config.data))
              : undefined,
          };
      
          const controller = new AbortController();
          const timeoutId = config.timeout ? setTimeout(() => controller.abort(), config.timeout) : null;
          fetchOptions.signal = controller.signal;
      
          const response = await fetch(fullUrl, fetchOptions);
          if (timeoutId) clearTimeout(timeoutId);
      
          responseStatus = response.status;
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
      
          if (!response.ok) {
             // Create axios-like error for compatibility with handleError
             const error: any = new Error(response.statusText);
             error.response = { status: responseStatus, data: await response.text().catch(() => ''), headers: responseHeaders };
             error.isAxiosError = true;
             throw error;
          }
      
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            responseData = await response.json().catch(() => null);
          } else {
            responseData = await response.text().catch(() => '');
          }
        }
        // Transport succeeded — leave the retry loop.
        break;
      } catch (transportError: unknown) {
        // fix-a-app-router-crash-offline-parity (H1/H1b): use the
        // side-effect-free `peekRetryStatus` here, NOT `handleError` — see
        // its doc comment for why calling the real (auto-queueing)
        // classifier on every retry attempt would over-queue a single
        // logical failed mutation once per attempt instead of once per call.
        if (
          !shortCircuited &&
          maxRetries > 0 &&
          retryAttempt < maxRetries &&
          isRetryableFailure(peekRetryStatus(transportError)) &&
          // Never resubmit non-idempotent methods (POST/PATCH) unless the caller
          // explicitly accepts the duplicate-write risk via retryNonIdempotent.
          // Judge config.method — request-intercept plugins may have rewritten
          // the method after `method` was derived, and config is what dispatches.
          isRetryableMethod(String(config.method ?? method), options?.retryNonIdempotent === true)
        ) {
          retryAttempt++;
          await retrySleep(retryBackoffMs(retryAttempt));
          continue;
        }
        // Not retryable or retries exhausted — propagate the ORIGINAL error to
        // the terminal handler so onError/plugin hooks fire exactly once.
        throw transportError;
      }
    }

    // Task 3.1: opt-in runtime response validation via Standard Schema.
    // Per-call `options.schema` wins over the route-def `registryRoute.schema`
    // — the same "explicit option > registry entry" precedence used for
    // method/timeout/headers above. Validates the RAW wire body (pre-model
    // decode), since schemas describe JSON shape, not a decoded model
    // instance. The validator, the error class, AND the throw/message logic
    // all live in the deferred `responseValidation.js` chunk, so callers who
    // never configure a schema pay only the bare presence-guard below.
    const effSchema = options?.schema ?? registryRoute?.schema;
    if (effSchema) {
      const { validateResponseOrThrow } = await import('./responseValidation.js');
      // Throws MinderResponseValidationError on mismatch → falls into the
      // existing terminal `catch` below (the SAME path a transport failure
      // takes), which gives this feature the never-throws contract (unless
      // `throwOnError`), the `onError`/plugin-onError hooks, and the `.raw`
      // attachment for free. On success `responseData` is replaced with the
      // validator's (possibly transformed) output before model decode.
      responseData = await validateResponseOrThrow(responseData, effSchema, responseStatus);
    }

    // 7. Decode response with model if provided
    const decodedData = decodeWithModel<TData>(responseData, options?.model);
    
    // 8. Calculate duration
    const duration = Date.now() - startTime;

    // Fire plugin response hooks (non-blocking)
    const responseHookPm = peekPluginManager();
    if (responseHookPm && responseHookPm.size > 0) {
      void responseHookPm.executeResponseHooks({
        status: responseStatus,
        data: responseData,
        headers: responseHeaders,
        duration,
        timestamp: Date.now(),
      });
    }

    // 9. Success callback
    if (options?.onSuccess) {
      options.onSuccess(decodedData);
    }
    
    // 10. Return success result
    const successResult: MinderResult<TData> = {
      data: decodedData,
      error: null,
      status: responseStatus,
      success: true,
      headers: responseHeaders,
      metadata: {
        method,
        url: route,
        duration,
        cached: false,
      },
    };

    // MDPD-24: store the fresh (non-short-circuited) GET result when caching was
    // opted into. The entry holds the RAW (pre-model-decode) response data — the
    // hit path re-decodes per call so model prototypes survive — and a deep copy
    // is stored so later callers can't mutate the entry. setCacheEntry enforces
    // the size cap (oldest evicted).
    if (cacheEnabled && cacheKey && !shortCircuited) {
      setCacheEntry(cacheKey, {
        result: deepCopyResult({ ...successResult, data: responseData }),
        expiresAt: Date.now() + resolveCacheTtl(options?.cacheTTL),
        storedAt: Date.now(),
      });
    }

    return successResult;
    })();

    // p-d1-inflight-deduplication (fix): register the leader's promise so
    // concurrent identical GETs share it, and clean up once it settles
    // (success OR failure — a failed leader must not permanently poison the
    // key for later, independent calls). The `.catch(() => {})` below only
    // silences THIS derived/floating promise from the cleanup chain; the
    // real rejection is still delivered to whoever awaits `dispatchPromise`
    // itself (the `return await dispatchPromise;` below, and any deduped
    // follower's `return await existingInFlight;` above).
    if (dedupEnabled && dedupKey) {
      const keyForCleanup = dedupKey;
      inFlightDedupMap().set(keyForCleanup, dispatchPromise as unknown as Promise<MinderResult<unknown>>);
      dispatchPromise
        .finally(() => {
          inFlightDedupMap().delete(keyForCleanup);
        })
        .catch(() => { /* real rejection handled by the awaited caller below */ });
    }

    return await dispatchPromise;

  } catch (error: unknown) {
    // Handle error - NEVER throw
    const minderError = handleError(error);

    // Expose the ORIGINAL underlying error (e.g. the raw AxiosError) as `.raw` so
    // consumers can inspect the untouched transport error, not just the normalized
    // Minder shape. Survives into both the returned error result and the thrown
    // throwOnError error below.
    (minderError as { raw?: unknown }).raw = error;

    // Fire plugin error hooks (non-blocking)
    const errorHookPm = peekPluginManager();
    if (errorHookPm && errorHookPm.size > 0) {
      void errorHookPm.executeErrorHooks({
        message: minderError.message,
        code: minderError.code,
        timestamp: Date.now(),
      });
    }

    // Error callback
    if (options?.onError) {
      options.onError(minderError);
    }

    // Opt-in: throw instead of returning a structured error result.
    if (options?.throwOnError) {
      const err = new Error(minderError.message);
      Object.assign(err, {
        code: minderError.code,
        status: minderError.status,
        details: minderError.details,
        minderError,
        // Original underlying error, so throwOnError consumers get `.raw` too.
        raw: error,
      });
      throw err;
    }

    // Return error result
    return {
      data: null,
      error: minderError,
      status: minderError.status,
      success: false,
      metadata: {
        method: detectMethod(route, data, options),
        url: route,
        duration: Date.now() - startTime,
        cached: false,
      },
    };
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Attach config method to minder function
 */
(minder as any).config = configureMinder;

/**
 * Attach Server-Sent Events stream capability
 */
(minder as any).stream = async (url: string, options: StreamOptions) => {
  const streamClient = new StreamClient(minderUrlConfig() as any);
  return streamClient.stream(url, options);
};

/**
 * Export configured minder as default
 */
export default minder;
