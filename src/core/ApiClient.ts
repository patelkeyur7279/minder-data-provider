import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { MinderConfig, ApiRoute, ApiError } from './types.js';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import { HttpMethod, DebugLogType } from '../constants/enums.js';
import { isEdgeRuntime } from './minder/utils.js';
import { AuthManager } from './AuthManager.js';
import { ProxyManager } from './ProxyManager.js';
import { OfflineManager } from '../platform/offline/OfflineManager.js';
import { getActiveOfflineManager } from '../platform/offline/registry.js';
import type { QueuedRequest } from '../platform/offline/types.js';
import {
  MinderConfigError,
  MinderNetworkError,
} from '../errors/index.js';
import {
  CSRFTokenManager,
  XSSSanitizer,
  RateLimiter
} from '../utils/security.js';
import { CorsManager, handleCorsError } from '../utils/corsManager.js';
import {
  RequestBatcher,
  RequestDeduplicator,
  PerformanceMonitor,
} from '../utils/performance.js';
import { AnalyticsManager } from '../utils/analytics.js';
import { telemetry } from '../utils/TelemetryTracker.js';
import { TelemetryManager } from '../utils/telemetry.js';
import type { DebugManager } from '../debug/DebugManager.js';
// fix-a-app-router-crash-offline-parity (BLOCKER 1): `pluginManagerSingleton`
// (a plain function, called fresh below) replaces the top-level `pluginManager`
// Proxy binding — see the full note on it in ../plugins/PluginSystem.ts and on
// its own use in ../core/minder.ts, which hit the same undefined-binding crash
// under Next.js App Router's webpack.
import {
  PluginManager,
  pluginManagerSingleton,
  isShortCircuitResponse,
} from '../plugins/PluginSystem.js';
import type { InterceptableRequest, ShortCircuitResponse, UploadLifecycleEvent } from '../plugins/PluginSystem.js';
import { redactSecrets } from '../security/secrets.js';
import { applyRequestBody, buildUploadFormData, createUploadProgressHandler } from './apiClient/upload.js';
import { serializeRequestConfigForDedupKey } from './apiClient/dedupKey.js';
import { normalizeApiError, sanitizeHeaders as sanitizeHeadersInternal } from './apiClient/errors.js';
import { sensitiveHeaderNames as computeSensitiveHeaderNames } from './apiClient/sensitiveHeaders.js';
import { resolveRequest, substituteUrlParams, normalizeHttpMethod } from './apiClient/resolveRequest.js';
import type { ResolvedRequestWithKeys } from './apiClient/resolveRequest.js';
import {
  extractCallerRequestOptions,
} from './apiClient/requestOptions.js';
import type { CallerRequestOptions, ForwardableRequestOptions } from './apiClient/requestOptions.js';

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private config: MinderConfig;
  private authManager: AuthManager;
  private proxyManager?: ProxyManager;
  private debugManager?: DebugManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requestCache: Map<string, Promise<any>> = new Map();
  private csrfManager?: CSRFTokenManager;
  private rateLimiter?: RateLimiter;
  private sanitizer?: XSSSanitizer;
  private requestBatcher?: RequestBatcher;
  private deduplicator?: RequestDeduplicator;
  private performanceMonitor?: PerformanceMonitor;
  private analyticsManager?: AnalyticsManager;
  private telemetryManager?: TelemetryManager;
  private corsManager?: CorsManager;
  private offlineManager?: OfflineManager;
  // True only when THIS client constructed its own OfflineManager (standalone,
  // no configureMinder-wired instance). A wired manager is owned by the config
  // lifecycle, so destroy() must NOT tear it down.
  private ownsOfflineManager = false;

  // Background timers — stored so destroy() can clear them (otherwise they leak
  // and keep firing after the owning provider unmounts / on HMR).
  private analyticsTimer?: ReturnType<typeof setInterval>;
  private telemetryTimer?: ReturnType<typeof setInterval>;

  // Plugin bus. Per-instance when `config.plugins` is supplied, else the global
  // singleton (so `registerPlugins(...)` keeps working). `ownsPluginManager`
  // means destroy() should tear it down.
  private pluginManager: PluginManager;
  private ownsPluginManager = false;

  // Token refresh state
  private isRefreshing = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

  // P2 (fix-2.2.0-blockers): true when THIS request's transport is native
  // `fetch()` rather than axios — either `config.transport === 'fetch'`
  // (explicit escape hatch) or auto-detected (`'auto'`/unset) on an edge
  // runtime (bare Cloudflare Workerd and similar), where axios's Node-oriented
  // adapter machinery cannot reliably dispatch a request. Mirrors the SAME
  // `transport` semantics `minder()` already exposes on its standalone path
  // (core/minder.ts) — this is what makes that same option apply to the
  // PROVIDER's ApiClient instead of being silently ignored. See
  // `dispatchNativeFetch` below for the actual transport, and
  // `applySecurityHeaders` for the auth/CSRF/rate-limit/CORS parity it shares
  // with the axios request interceptor.
  private useNativeFetch: boolean;

  constructor(config: MinderConfig, authManager: AuthManager, proxyManager?: ProxyManager, debugManager?: DebugManager) {
    this.config = config;
    this.authManager = authManager;
    this.proxyManager = proxyManager;
    this.debugManager = debugManager;
    const transport = config.transport;
    this.useNativeFetch =
      transport === 'fetch' ||
      ((transport === 'auto' || transport === undefined) && isEdgeRuntime());

    // Initialize security utilities
    if (config.security?.csrfProtection) {
      const csrfConfig = typeof config.security.csrfProtection === 'object'
        ? config.security.csrfProtection
        : { enabled: true };
      this.csrfManager = new CSRFTokenManager(csrfConfig.cookieName);
    }

    if (config.security?.rateLimiting) {
      this.rateLimiter = new RateLimiter();
    }

    if (config.security?.sanitization) {
      this.sanitizer = new XSSSanitizer(config.security.sanitization);
    }

    // Initialize performance utilities
    if (config.performance?.deduplication) {
      this.deduplicator = new RequestDeduplicator();
    }

    if (config.performance?.batching) {
      this.requestBatcher = new RequestBatcher(config.performance.batchDelay || 10);
    }

    if (config.performance?.monitoring) {
      this.performanceMonitor = new PerformanceMonitor();
    }

    // Initialize CORS manager
    if (config.cors?.enabled) {
      this.corsManager = new CorsManager(config.cors);

      // Validate configuration immediately
      const validation = this.corsManager.validateConfig();

      // Log errors (critical)
      if (!validation.isValid) {
        validation.errors.forEach(error => {
          console.error(`[Minder] CORS Configuration Error: ${error}`);
        });
      }

      // Log warnings (development only)
      if (process.env.NODE_ENV === 'development') {
        validation.warnings.forEach(warning => {
          console.warn(`[Minder] CORS Warning: ${warning}`);
        });
      }
    }

    // Initialize Analytics
    if (config.analytics?.enabled) {
      this.analyticsManager = new AnalyticsManager(config.analytics);

      // Auto-track performance if enabled
      if (config.analytics.autoTrackPerformance && this.performanceMonitor) {
        this.analyticsTimer = setInterval(() => {
          const metrics = this.performanceMonitor?.getMetrics();
          if (metrics) {
            this.analyticsManager?.trackPerformance(metrics);
          }
        }, 60000); // Send every minute
      }
    }

    // Initialize Telemetry (Framework Phone Home)
    if (config.telemetry?.enabled) {
      this.telemetryManager = new TelemetryManager(config.telemetry);

      // Send performance stats to HQ
      if (this.performanceMonitor) {
        this.telemetryTimer = setInterval(() => {
          const metrics = this.performanceMonitor?.getMetrics();
          if (metrics) {
            this.telemetryManager?.trackPerformance(metrics);
          }
        }, 300000); // Send every 5 minutes (less frequent than analytics)
      }
    }

    // Initialize Offline Manager (MDPD unified-manager fix).
    //
    // There is exactly ONE OfflineManager per configuration. When
    // configureMinder wired one (getActiveOfflineManager()), reuse THAT
    // instance — it is the manager whose sync engine emits onSync /
    // onConnectivityChange — so genuinely-failed auto-queued requests replay
    // through it and those hooks fire. Only when running standalone (a bare
    // `new ApiClient(...)` with offline enabled and no wired manager) do we
    // construct our own, and then we own its teardown.
    if (config.offline?.enabled) {
      const wired = getActiveOfflineManager();
      if (wired) {
        this.offlineManager = wired;
        this.ownsOfflineManager = false;
      } else {
        this.offlineManager = new OfflineManager(config.offline);
        this.ownsOfflineManager = true;
        // Async listener setup; isolated so it never breaks construction.
        void this.offlineManager.initialize().catch(() => { /* isolated */ });
      }
      // Inject our axios instance as the replay transport (the unified-manager
      // equivalent of the old setProcessQueueCallback). Replayed requests then
      // carry auth/CSRF/CORS/interceptors, and sync() emits onSync around them.
      this.offlineManager.setRequestExecutor(async (request: QueuedRequest) => {
        try {
          // P2 (fix-2.2.0-blockers): native-fetch transport bypasses axios
          // entirely, but `dispatchNativeFetch` throws through the SAME
          // `normalizeApiError` classifier the axios response interceptor
          // uses below, so the transformed-error assumption this catch block
          // relies on (see the comment just below) holds for both transports.
          const replayConfig = {
            method: request.method,
            url: request.url,
            data: request.body,
            headers: request.headers,
            // Mark the re-dispatch so a replay that fails again is NOT re-captured
            // by the auto-queue path in apiClient/errors.ts (which would duplicate
            // the request). The manager's own retry accounting owns replay failures.
            ...( { __minderReplay: true } as Record<string, unknown> ),
          };
          const response = this.useNativeFetch
            ? await this.dispatchNativeFetch(replayConfig)
            : await this.axiosInstance.request(replayConfig);
          return response.data;
        } catch (err) {
          // This same axiosInstance's response interceptor (setupInterceptors,
          // above) already ran and transformed the raw AxiosError into a
          // Minder*Error/ApiError via handleError() -> normalizeApiError() ->
          // buildApiError() BEFORE this catch ever sees it — `err` here is
          // that transformed value, not the raw AxiosError. normalizeApiError
          // always attaches the untouched original as `err.raw`, so THAT is
          // what tells us whether the server actually responded.
          //
          // Server RESPONDED with a non-2xx status -> report a uniform
          // HTTP-outcome sentinel instead of throwing (Spec 5.1 §10.1, option
          // (a)). ApiClient stays a dumb transport: it never reads
          // `conflictStatuses` and never decides conflict-vs-error, it just
          // reports "here is the HTTP outcome" and leaves that call entirely
          // to the offline layer. Deliberately carrying the ALREADY-TRANSFORMED
          // `err.message`/`err.code` (not the raw generic axios message) is
          // what keeps a non-conflict status byte-equal to the pre-feature
          // thrown error: buildApiError gives 404/429/500/etc. their own
          // custom message text, not axios's generic "Request failed with
          // status code N".
          const raw = (err as { raw?: unknown } | null | undefined)?.raw;
          if (axios.isAxiosError(raw) && raw.response) {
            const transformed = err as { message?: string; code?: string };
            return {
              __minderReplayOutcome: 'error' as const,
              status: raw.response.status,
              serverData: raw.response.data,
              message: transformed?.message ?? raw.message,
              code: transformed?.code ?? raw.code,
            };
          }
          // Genuine transport failure (ERR_NETWORK/timeout/etc, no response)
          // -> re-throw the (already-transformed) error unchanged; this path
          // is untouched by this feature.
          throw err;
        }
      });
    }

    // Initialize plugin bus — per-instance if plugins are supplied, else the
    // shared global manager (so registerPlugins(...) keeps working).
    if (config.plugins && config.plugins.length > 0) {
      this.pluginManager = new PluginManager({ debug: config.debug?.enabled });
      this.ownsPluginManager = true;
      config.plugins.forEach((p) => this.pluginManager.register(p));
    } else {
      this.pluginManager = pluginManagerSingleton();
    }
    if (this.pluginManager.size > 0) {
      // onInit is isolated per-plugin inside the manager; don't block construction.
      void this.pluginManager.init(config).catch(() => { /* isolated */ });
    }

    // Use proxy baseURL if enabled, otherwise use original
    const baseURL = proxyManager?.isEnabled() ? proxyManager.config.baseUrl : config.apiBaseUrl;

    // Create axios instance with CORS support.
    //
    // IMPORTANT: default request headers here must stay within the CORS
    // "safelisted" set (Content-Type: application/json is safelisted;
    // Accept always is). Response-type security headers (CSP, X-Frame-Options,
    // etc. — see getSecurityHeaders() in utils/security.ts) must NEVER be
    // spread onto the request here: they are non-safelisted, so their mere
    // presence forces the browser to perform a CORS preflight OPTIONS request
    // before every single call, roughly doubling latency cross-origin.
    //
    // withCredentials defaults to false (opt-in via config.cors.credentials)
    // for the same reason: sending credentials on cross-origin requests
    // changes preflight requirements and requires the server to echo back a
    // non-wildcard Access-Control-Allow-Origin, so it should be an explicit
    // choice rather than a silent default.
    this.axiosInstance = axios.create({
      baseURL,
      timeout: config.performance?.timeout || 30000,
      withCredentials: config.cors?.credentials === true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Release all resources held by this client.
   *
   * Clears the background analytics/telemetry timers, drops the in-flight
   * request cache and any queued refresh waiters, and tears down the offline
   * manager if it exposes a destroy(). Call this when the owning provider
   * unmounts so intervals/listeners don't leak (especially under HMR or when
   * multiple clients are created).
   */
  public destroy(): void {
    if (this.analyticsTimer) {
      clearInterval(this.analyticsTimer);
      this.analyticsTimer = undefined;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = undefined;
    }
    this.requestCache.clear();
    this.failedQueue = [];
    if (this.ownsPluginManager) {
      void this.pluginManager.destroy();
    }
    // OfflineManager registers window listeners; release them ONLY when this
    // client owns the manager. A configureMinder-wired manager is shared and
    // owned by the config lifecycle (re-configure/destroy handle it there), so
    // tearing it down here would kill offline support for other consumers.
    if (this.ownsOfflineManager) {
      void this.offlineManager?.destroy();
    }
  }

  // ── Plugin bus emitters (observability; fire-and-forget, never block I/O) ──

  private emitPluginRequest(config: AxiosRequestConfig): void {
    if (this.pluginManager.size === 0) return;
    void this.pluginManager.executeRequestHooks({
      method: (config.method || 'GET').toUpperCase(),
      url: config.url || '',
      headers: config.headers as Record<string, string> | undefined,
      body: config.data,
      timestamp: Date.now(),
    });
  }

  private emitPluginResponse(response: AxiosResponse): void {
    if (this.pluginManager.size === 0) return;
    const start = (response.config as { __minderStart?: number }).__minderStart;
    void this.pluginManager.executeResponseHooks({
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, string> | undefined,
      duration: start ? Date.now() - start : 0,
      timestamp: Date.now(),
    });
  }

  private emitPluginError(error: AxiosError): void {
    if (this.pluginManager.size === 0) return;
    const cfg = error.config as (AxiosRequestConfig & { __minderStart?: number }) | undefined;
    void this.pluginManager.executeErrorHooks({
      message: error.message || 'Request error',
      code: error.code || (error.response ? String(error.response.status) : undefined),
      stack: error.stack,
      request: cfg
        ? {
            method: (cfg.method || 'GET').toUpperCase(),
            url: cfg.url || '',
            headers: cfg.headers as Record<string, string> | undefined,
            body: cfg.data,
            timestamp: cfg.__minderStart || Date.now(),
          }
        : undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Run the mutating `onRequestIntercept` middleware chain against the outgoing
   * axios config. Header/url/method/params/data mutations are applied in place.
   * If a plugin short-circuits, the {@link ShortCircuitResponse} is returned and
   * the caller MUST resolve with its synthetic data without hitting the
   * transport. Returns `null` when the chain completed normally.
   *
   * Zero-overhead fast path: returns immediately when no registered plugin
   * implements the hook.
   */
  private async runRequestInterceptors(
    requestConfig: AxiosRequestConfig,
    routeName: string
  ): Promise<ShortCircuitResponse | null> {
    if (this.pluginManager.size === 0 || !this.pluginManager.hasRequestInterceptors()) {
      return null;
    }

    const interceptable: InterceptableRequest = {
      url: requestConfig.url || '',
      method: (requestConfig.method || 'GET').toString().toUpperCase(),
      headers: (requestConfig.headers as Record<string, string>) || {},
      params: requestConfig.params as Record<string, unknown> | undefined,
      data: requestConfig.data,
      routeName,
    };

    const result = await this.pluginManager.executeRequestInterceptors(interceptable);
    if (isShortCircuitResponse(result)) {
      return result;
    }

    // Apply the middleware's mutations back onto the outgoing axios config.
    requestConfig.url = result.url;
    requestConfig.method = result.method as AxiosRequestConfig['method'];
    requestConfig.headers = result.headers as AxiosRequestConfig['headers'];
    requestConfig.params = result.params;
    requestConfig.data = result.data;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processQueue(error: any, token: string | null = null) {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else if (token) {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  /**
   * Auth token injection, CSRF header, rate-limit check, and CORS headers —
   * extracted VERBATIM from the axios request interceptor (setupInterceptors,
   * below) so the native-fetch transport (P2, dispatchNativeFetch) gets the
   * exact same security-header behavior as the axios path, from one place,
   * with no drift between them. Mutates `headers` in place; throws
   * `MinderNetworkError` on a rate-limit rejection (unchanged from the
   * original inline behavior — that throw was always caught by the request
   * interceptor's own rejection handler, propagating out of the request the
   * same way it does when thrown from here).
   */
  private async applySecurityHeaders(
    headers: Record<string, string>,
    method: string,
    url: string
  ): Promise<void> {
    let token = this.authManager.getToken(); // Add auth token if available
    if (!token && this.pluginManager.size > 0) {
      // Auth-provider plugins (Firebase/Auth0/Clerk…) can supply the token.
      token = await this.pluginManager.collectToken();
    }
    if (token) {
      const authHeader = this.config.auth?.authHeader || 'Authorization';
      const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
      headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
    }

    // CSRF Protection
    if (this.csrfManager) {
      const csrfConfig = typeof this.config.security?.csrfProtection === 'object'
        ? this.config.security.csrfProtection
        : { enabled: true, headerName: 'X-CSRF-Token' };
      const headerName = csrfConfig.headerName || 'X-CSRF-Token';
      headers[headerName] = this.csrfManager.getToken();
    }

    // Rate limiting check
    if (this.rateLimiter && this.config.security?.rateLimiting) {
      const key = `${method}:${url}`;
      const { requests, window } = this.config.security.rateLimiting;
      if (!this.rateLimiter.check(key, requests, window)) {
        telemetry.recordRateLimitHit();
        throw new MinderNetworkError('Rate limit exceeded. Please try again later.', 429, undefined, 'RATE_LIMIT_EXCEEDED');
      }
    }

    // Add CORS headers automatically
    if (this.corsManager) {
      const corsHeaders = this.corsManager.getCorsHeaders(method as HttpMethod, headers);
      Object.assign(headers, corsHeaders);
    }
  }

  /**
   * fix-2.2.0-blockers (ALSO REQUIRED — sensitive-header coverage gap): the
   * header NAMES axios's `sensitiveHeaders` option strips on any
   * cross-origin redirect hop (see the doc comment at its call sites in
   * `dispatchResolved`/`requestRaw`). Previously only a registered route's
   * OWN declared header names were listed — that misses two things:
   *
   *   1. follow-redirects (axios's Node http adapter) only strips
   *      `Authorization`/`Cookie`/`Proxy-Authorization` by its OWN built-in
   *      default, hardcoded by literal name. A hand-configured
   *      `config.auth.authHeader` (e.g. `'X-Auth-Token'`) is a name
   *      follow-redirects has never heard of — that header would ride along
   *      to a redirect target unmodified unless THIS list names it too.
   *   2. `requestRaw`'s ad-hoc/absolute-URL dispatch previously set NO
   *      `sensitiveHeaders` at all, even though it goes through the exact
   *      same axios request interceptor (`applySecurityHeaders`) that
   *      attaches the SAME bearer token.
   *
   * Always includes the effective auth header name (defaulting the same way
   * `applySecurityHeaders` does) and the CSRF header name when CSRF
   * protection is configured, plus any route-declared header names the
   * caller supplies. Single source of truth for both dispatch paths so they
   * can never independently drift out of sync with each other again — see
   * `./apiClient/sensitiveHeaders.ts` for the actual implementation, also
   * called directly by the standalone `minder()` path (fix-b-redirect-
   * credential-leak, BLOCKER 2).
   */
  private sensitiveHeaderNames(routeHeaders?: Record<string, string>): string[] {
    return computeSensitiveHeaderNames(this.config, routeHeaders);
  }

  /**
   * P2 (fix-2.2.0-blockers): build a plain object shaped like an AxiosError
   * (`isAxiosError: true` + either `.response` or `.request`) from a native
   * `fetch()` outcome, so the EXISTING `normalizeApiError`/`buildApiError`
   * classifier (core/apiClient/errors.js) — which duck-types axios errors —
   * handles it identically to a real axios failure: same MinderNetworkError/
   * MinderAuthError/etc mapping, same offline auto-queue integration. Never
   * imports or constructs a real `AxiosError`, so this stays reachable even
   * when nothing else in this dispatch touched axios.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildFetchAxiosLikeError(params: {
    message: string;
    code?: string;
    url: string;
    method: string;
    response?: { status: number; data: unknown; headers: Record<string, string> };
  }): any {
    const { message, code, url, method, response } = params;
    return {
      isAxiosError: true,
      message,
      code,
      config: { url, method },
      request: response ? undefined : {},
      response,
    };
  }

  /**
   * P2 (fix-2.2.0-blockers): the native-fetch transport. Used INSTEAD of
   * `this.axiosInstance.request(...)` when `this.useNativeFetch` is true
   * (explicit `transport:'fetch'`, or auto-detected edge runtime) — see the
   * constructor. Never touches axios's request/response dispatch, so it
   * works in runtimes (bare Cloudflare Workerd and similar) where axios's
   * Node-oriented HTTP adapter machinery cannot run. Applies the SAME
   * auth/CSRF/rate-limit/CORS headers as the axios path (applySecurityHeaders
   * above) and normalizes failures through the SAME `normalizeApiError`
   * classifier (via `this.handleError`), including the offline auto-queue
   * integration, analytics/telemetry error tracking, and `config.onError`.
   *
   * Deliberately minimal: no retry-with-backoff and no 401 token-refresh
   * chain (both live in the axios response interceptor and are not
   * replicated here) — an explicit, documented trade-off of the escape hatch,
   * matching `minder()`'s own standalone edge/fetch path, which has the same
   * limitation.
   */
  private async dispatchNativeFetch(requestConfig: AxiosRequestConfig): Promise<AxiosResponse> {
    const method = (requestConfig.method || 'GET').toString().toUpperCase();

    // HIGH (transport-and-packaging fix): axios's own dispatch
    // (axiosInstance.request(...)) automatically merges the INSTANCE's own
    // default headers (Content-Type/Accept: 'application/json' — see the
    // constructor) into every request before it reaches the wire. This
    // transport bypasses axios's dispatch entirely, so it never saw that
    // merge: a plain-object body with no explicit per-route/per-call
    // Content-Type (the ordinary case) reached fetch with NO Content-Type at
    // all, and fetch defaults an un-typed string body to
    // 'text/plain;charset=UTF-8' instead of 'application/json' — a real API
    // then rejects or mis-parses it. Confirmed divergence: the standalone
    // minder() path bakes the SAME default straight into its own request
    // config (minder.ts's defaultMinderUrlConfig) and never had this gap —
    // only the provider's native-fetch transport did. Only the axios
    // instance's STRING-valued default headers are flattened in here; the
    // object-valued buckets (`common`/`get`/`post`/.../`query`) are axios's
    // own internal per-method structure, never real header names, and must
    // never be spread onto the wire as literal header keys. Per-route/
    // per-call headers in `requestConfig.headers` are applied AFTER and win
    // outright — including an explicit `Content-Type: undefined` (see
    // `applyRequestBody` in apiClient/upload.ts, which deletes-then-marks-
    // undefined for a FormData body specifically so this merge can never
    // silently reintroduce 'application/json' under a multipart upload).
    // `undefined`-valued entries are filtered out just below so
    // fetch's `Headers` never receives a literal "undefined" string.
    const axiosDefaultHeaders = this.axiosInstance.defaults.headers as Record<string, unknown> | undefined;
    const defaultHeaders: Record<string, string> = {};
    if (axiosDefaultHeaders) {
      for (const [key, value] of Object.entries(axiosDefaultHeaders)) {
        if (typeof value === 'string') {
          defaultHeaders[key] = value;
        }
      }
    }
    const mergedHeaders: Record<string, string | undefined> = {
      ...defaultHeaders,
      ...(requestConfig.headers as Record<string, string | undefined> | undefined),
    };
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(mergedHeaders)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    // `requestConfig` (built by request()/requestRaw() above) carries the
    // route's RELATIVE `url` only — the base URL normally lives on the axios
    // INSTANCE's own `defaults.baseURL` (set from `config.apiBaseUrl` at
    // construction) and axios combines the two internally on dispatch. This
    // transport bypasses that combination step entirely, so it must resolve
    // the base URL itself: an explicit `requestConfig.baseURL` (e.g. the
    // proxy-rewrite / absolute-URL branches, which set it to `''`) wins;
    // otherwise fall back to the instance default. Absolute URLs are used
    // verbatim either way, mirroring axios's own and minder()'s behavior.
    const routeUrl = requestConfig.url || '';
    const isAbsoluteRouteUrl = /^https?:\/\//i.test(routeUrl);
    const baseURL = requestConfig.baseURL !== undefined
      ? requestConfig.baseURL
      : (this.axiosInstance.defaults.baseURL || '');
    let fullUrl = isAbsoluteRouteUrl ? routeUrl : `${baseURL}${routeUrl}`;
    if (requestConfig.params && typeof requestConfig.params === 'object') {
      const query = new URLSearchParams();
      Object.entries(requestConfig.params as Record<string, unknown>).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
      const queryString = query.toString();
      if (queryString) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
      }
    }

    await this.applySecurityHeaders(headers, method, fullUrl);

    if (this.debugManager && this.config.debug?.networkLogs) {
      this.debugManager.log(DebugLogType.API, `🚀 ${method} ${fullUrl}`, {
        method,
        url: fullUrl,
        headers: this.sanitizeHeaders(headers),
        data: redactSecrets(requestConfig.data),
        params: redactSecrets(requestConfig.params),
      });
    }

    const startTime = Date.now();
    this.emitPluginRequest({ ...requestConfig, url: fullUrl, method, headers });

    // BLOCKER 2 (transport-and-packaging fix): a FormData body (file upload —
    // ApiClient.uploadFile -> request() -> dispatch()) previously fell into
    // the `JSON.stringify(requestConfig.data)` branch below, which
    // stringifies a FormData instance to the literal string '{}' (it has no
    // enumerable own properties) — a broken, empty body reaching the server
    // regardless of transport, the moment `transport:'fetch'` routed an
    // upload through this method. fetch (like axios) accepts a FormData body
    // directly and computes its own multipart boundary; pass it through
    // untouched instead of stringifying it. Its Content-Type is never forced
    // here either — `applyRequestBody` (apiClient/upload.ts) already deleted
    // the hand-set, boundary-less 'multipart/form-data' header for exactly
    // this reason (the SAME removal the axios dispatch path relies on), and
    // the header-merge above respects that deletion, so fetch is free to set
    // its own correctly-boundaried Content-Type.
    const isFormDataBody = typeof FormData !== 'undefined' && requestConfig.data instanceof FormData;

    // Deliberately minimal RequestInit — no `cache`, no `credentials`, no
    // exotic fields: bare edge runtimes (workerd and similar) reject
    // RequestInit properties they don't implement, so the safest transport
    // is the smallest one that still works everywhere fetch works.
    const init: RequestInit = {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' && requestConfig.data !== undefined
        ? (isFormDataBody || typeof requestConfig.data === 'string'
            ? requestConfig.data
            : JSON.stringify(requestConfig.data))
        : undefined,
    };
    if (requestConfig.timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), requestConfig.timeout);
      init.signal = controller.signal;
    }

    let fetchResponse: Response;
    try {
      fetchResponse = await fetch(fullUrl, init);
    } catch (err) {
      const networkError = this.buildFetchAxiosLikeError({
        message: err instanceof Error ? err.message : 'Network error',
        code: 'ERR_NETWORK',
        url: fullUrl,
        method,
      });
      throw this.finalizeAndThrowError(networkError);
    }

    const responseHeaders: Record<string, string> = {};
    fetchResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = fetchResponse.headers.get('content-type');
    const responseData = contentType?.includes('application/json')
      ? await fetchResponse.json().catch(() => null)
      : await fetchResponse.text().catch(() => '');

    if (!fetchResponse.ok) {
      const httpError = this.buildFetchAxiosLikeError({
        message: fetchResponse.statusText || `Request failed with status code ${fetchResponse.status}`,
        url: fullUrl,
        method,
        response: { status: fetchResponse.status, data: responseData, headers: responseHeaders },
      });
      throw this.finalizeAndThrowError(httpError);
    }

    const response = {
      data: responseData,
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers: responseHeaders,
      config: { ...requestConfig, url: fullUrl, method, headers, __minderStart: startTime } as AxiosRequestConfig,
    } as AxiosResponse;

    this.emitPluginResponse(response);
    return response;
  }

  /**
   * Shared terminal-error handling for a native-fetch failure: normalizes it
   * (offline auto-queue included), fires the SAME analytics/telemetry/
   * plugin/onError hooks the axios response interceptor fires on failure,
   * and returns the normalized `ApiError` for the caller to `throw`. Kept as
   * a return-not-throw helper so call sites read `throw this.finalize...()`
   * — TypeScript then knows the call site is unreachable after it, matching
   * the axios path's `Promise.reject(apiError)` semantics.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private finalizeAndThrowError(fetchAxiosLikeError: any): ApiError {
    this.emitPluginError(fetchAxiosLikeError as AxiosError);
    const apiError = this.handleError(fetchAxiosLikeError);
    if (this.analyticsManager) {
      this.analyticsManager.trackError(apiError, `${fetchAxiosLikeError.config?.method} ${fetchAxiosLikeError.config?.url}`);
    }
    if (this.telemetryManager) {
      this.telemetryManager.trackError(apiError, 'API_REQUEST_FAILURE');
    }
    if (this.config.onError) {
      this.config.onError(apiError);
    }
    return apiError;
  }

  private setupInterceptors() {
    // Request interceptor for auth, CORS, and security
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Automatically handle FormData Content-Type
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
          if (config.headers) {
            delete config.headers['Content-Type'];
            delete config.headers['content-type'];
            // Also explicitly delete from common/post/put defaults which axios might merge
            const headers = config.headers as any;
            if (headers.common) delete headers.common['Content-Type'];
            if (headers.post) delete headers.post['Content-Type'];
            if (headers.put) delete headers.put['Content-Type'];
          }
        }

        // Debug logging - API Request (moved below header manipulations)
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log(DebugLogType.API, `🚀 ${config.method?.toUpperCase()} ${config.url}`, {
            method: config.method,
            url: config.url,
            headers: this.sanitizeHeaders(config.headers),
            data: redactSecrets(config.data),
            params: redactSecrets(config.params)
          });
        }

        await this.applySecurityHeaders(
          config.headers as Record<string, string>,
          (config.method || 'GET').toString(),
          config.url || ''
        );

        // Stamp start time + fire plugin request hooks (non-blocking observability)
        (config as { __minderStart?: number }).__minderStart = Date.now();
        this.emitPluginRequest(config);

        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Debug logging - API Response Success
        if (this.debugManager && this.config.debug?.networkLogs) {
          const duration = response.config.headers?.['X-Request-Start-Time']
            ? Date.now() - parseInt(response.config.headers['X-Request-Start-Time'] as string)
            : undefined;

          this.debugManager.log(DebugLogType.API, `✅ ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}${duration ? ` (${duration}ms)` : ''}`, {
            status: response.status,
            statusText: response.statusText,
            data: redactSecrets(response.data),
            headers: this.sanitizeHeaders(response.headers),
            duration
          });
        }
        this.emitPluginResponse(response);
        return response;
      },
      async (error) => {
        // Debug logging - API Response Error
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log(DebugLogType.API, `❌ ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
            data: redactSecrets(error.response?.data)
          });
        }

        this.emitPluginError(error as AxiosError);

        const originalRequest = error.config;

        // --- Exponential Backoff Retry Logic ---
        const retries = this.config.performance?.retries ?? 0;
        const currentRetryCount = originalRequest._retryCount || 0;
        
        // Retry on Network errors (no response), 5XX server errors, or 429 Too Many Requests
        const isRetryableError = !error.response || 
                               (error.response.status >= 500 && error.response.status < 600) || 
                               error.response.status === 429;
        
        // Allow custom shouldRetry function
        const customShouldRetry = this.config.performance?.retryConfig?.shouldRetry;
        const shouldRetry = customShouldRetry 
          ? customShouldRetry(error, currentRetryCount) 
          : isRetryableError;

        if (shouldRetry && currentRetryCount < retries) {
          originalRequest._retryCount = currentRetryCount + 1;
          
          const baseDelay = this.config.performance?.retryDelay ?? 1000;
          const factor = this.config.performance?.retryConfig?.factor ?? 2;
          const maxDelay = this.config.performance?.retryConfig?.maxDelay ?? 30000;
          
          // Calculate delay with exponential backoff and jitter
          const exponentialDelay = Math.min(baseDelay * Math.pow(factor, currentRetryCount), maxDelay);
          const jitter = Math.random() * 200; // Add up to 200ms jitter
          const delay = exponentialDelay + jitter;
          
          if (this.debugManager && this.config.debug?.networkLogs) {
            this.debugManager.log(DebugLogType.API, `⚠️ Retrying request (${originalRequest._retryCount}/${retries}) in ${Math.round(delay)}ms: ${originalRequest.method?.toUpperCase()} ${originalRequest.url}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.axiosInstance.request(originalRequest);
        }
        // --- End Retry Logic ---

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          telemetry.recordAuthFailure();
          originalRequest._retry = true;
          // Check if refresh is configured
          if (this.config.auth?.refreshUrl) {
            if (this.isRefreshing) {
              // If already refreshing, queue this request
              return new Promise((resolve, reject) => {
                this.failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  const authHeader = this.config.auth?.authHeader || 'Authorization';
                  const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                  originalRequest.headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
                  return this.axiosInstance.request(originalRequest);
                })
                .catch((err) => {
                  return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            this.isRefreshing = true;

            try {
              // Call refresh endpoint
              // Use axios directly to avoid interceptors loop
              const refreshToken = await this.authManager.getRefreshToken();

              // If using cookies, the refresh token might be HttpOnly and not accessible via JS.
              // In that case, we send the request anyway, assuming the browser will send the cookie.
              const isCookieStorage = this.config.auth?.storage === 'cookie'; // Check string value or enum

              if (!refreshToken && !isCookieStorage) {
                // If not using cookies and no token, we can't refresh
                throw new Error('No refresh token available');
              }

              // Construct URL safely
              const baseUrl = this.config.apiBaseUrl.replace(/\/$/, '');
              const refreshUrl = this.config.auth.refreshUrl?.replace(/^\//, '') || '';
              const fullRefreshUrl = `${baseUrl}/${refreshUrl}`;

              // Prepare headers
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };

              // Add Authorization header with expired token if available (some APIs require this)
              // We default to true to maintain backward compatibility, but allow users to disable it
              const sendToken = this.config.auth?.sendTokenOnRefresh !== false;
              const expiredToken = this.authManager.getToken();

              if (sendToken && expiredToken) {
                const authHeader = this.config.auth?.authHeader || 'Authorization';
                const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                headers[authHeader] = authPrefix ? `${authPrefix} ${expiredToken}` : expiredToken;
              }

              // Log refresh attempt (since it bypasses interceptors)
              if (this.debugManager && this.config.debug?.networkLogs) {
                this.debugManager.log(DebugLogType.API, `🚀 POST ${fullRefreshUrl} (Refresh)`, {
                  hasRefreshToken: !!refreshToken,
                  isCookieStorage,
                  headers: this.sanitizeHeaders(headers)
                });
              }

              const response = await axios.post(
                fullRefreshUrl,
                this.config.auth?.getRefreshRequestBody
                  ? this.config.auth.getRefreshRequestBody(refreshToken)
                  : (refreshToken ? { refreshToken } : {}),
                {
                  // Follow the same opt-in flag as the main axios instance —
                  // defaulting to true here would silently send credentials
                  // cross-origin even when the app never asked for it.
                  withCredentials: this.config.cors?.credentials === true,
                  headers
                }
              );

              // Flexible token extraction
              let responseData = response.data;

              // Use custom model if configured
              if (this.config.auth?.refreshModel) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseData = new (this.config.auth.refreshModel as any)().fromJSON(response.data);
              }

              const tokenKey = this.config.auth?.tokenKey || 'accessToken';

              // Try to find token in various common properties
              const token = responseData.token || responseData.accessToken || responseData[tokenKey];
              const newRefreshToken = responseData.refreshToken || responseData.refresh_token;

              if (token) {
                this.authManager.setToken(token);
                if (newRefreshToken) {
                  this.authManager.setRefreshToken(newRefreshToken);
                }

                // Notify plugins of the token rotation (non-blocking)
                if (this.pluginManager.size > 0) {
                  void this.pluginManager.executeAuthRefreshHooks({
                    accessToken: token,
                    refreshToken: newRefreshToken,
                  });
                }

                this.processQueue(null, token);
                this.isRefreshing = false;

                const authHeader = this.config.auth?.authHeader || 'Authorization';
                const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                originalRequest.headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
                return this.axiosInstance.request(originalRequest);
              } else {
                throw new Error(`No token returned from refresh endpoint. Response keys: ${Object.keys(responseData || {}).join(', ')}. Data: ${JSON.stringify(responseData)}`);
              }
            } catch (refreshError) {
              // Log refresh failure
              if (this.debugManager && this.config.debug?.networkLogs) {
                this.debugManager.log(DebugLogType.API, `❌ REFRESH FAILED`, {
                  error: redactSecrets(refreshError instanceof Error ? refreshError.message : refreshError)
                });
              }

              this.processQueue(refreshError, null);
              this.isRefreshing = false;
              this.authManager.clearAuth();
              if (this.config.auth?.onAuthError) {
                this.config.auth.onAuthError();
              }
              return Promise.reject(refreshError);
            }
          } else {
            // No refresh configured, just fail
            this.authManager.clearAuth();
            if (this.config.auth?.onAuthError) {
              this.config.auth.onAuthError();
            }
          }
        } else if (error.response?.status === 401) {
          // Already retried or failed
          this.authManager.clearAuth();
          if (this.config.auth?.onAuthError) {
            this.config.auth.onAuthError();
          }
        }

        // Handle CORS errors automatically
        if (this.corsManager) {
          const corsHandling = await handleCorsError(error, this.corsManager, {
            url: error.config?.url || '',
            method: (error.config?.method as HttpMethod) || HttpMethod.GET,
            headers: error.config?.headers as Record<string, string> || {},
            data: error.config?.data
          });

          if (corsHandling.shouldRetry) {
            if (corsHandling.modifiedRequest) {
              // Retry with modified request
              return this.axiosInstance.request({
                ...error.config,
                ...corsHandling.modifiedRequest
              });
            } else if (corsHandling.useProxy && this.proxyManager) {
              // Retry through proxy
              const proxyConfig = { ...error.config };
              // `rewriteUrl`'s second parameter is optional and unused by the
              // implementation (see ProxyManager.ts) — no route to narrow here.
              proxyConfig.url = this.proxyManager.rewriteUrl(error.config?.url || '');
              proxyConfig.baseURL = '';
              return this.axiosInstance.request(proxyConfig);
            } else if (corsHandling.fallbackUrl) {
              // Retry with fallback URL
              return this.axiosInstance.request({
                ...error.config,
                url: corsHandling.fallbackUrl
              });
            }
          }

          if (corsHandling.error) {
            throw corsHandling.error;
          }
        }

        const apiError = this.handleError(error);

        // Track error in analytics
        if (this.analyticsManager) {
          this.analyticsManager.trackError(apiError, `${error.config?.method?.toUpperCase()} ${error.config?.url}`);
        }

        // Report error to Framework HQ (Telemetry)
        if (this.telemetryManager) {
          this.telemetryManager.trackError(apiError, 'API_REQUEST_FAILURE');
        }

        if (this.config.onError) {
          this.config.onError(apiError);
        }

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Normalize any thrown/rejected error into Minder's structured shape AND attach
   * the ORIGINAL underlying error as `.raw` on whatever it produces — both the
   * objects it returns (e.g. the 400 result object) and the MinderError subclasses
   * it throws. This guarantees every error a consumer eventually sees exposes the
   * untouched source error (typically the AxiosError) for `.raw` inspection.
   *
   * Delegates to `normalizeApiError` in `./apiClient/errors.js`.
   */
  private handleError(error: unknown): ApiError {
    return normalizeApiError(error, this.offlineManager);
  }

  private sanitizeHeaders(headers: any): any {
    return sanitizeHeadersInternal(headers);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(
    routeName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any,
    params?: Record<string, unknown>,
    // `rawUrl` and `urlOverride` are Minder-only escape-hatch flags (not axios
    // options); both are stripped before the config reaches axios.
    // `urlOverride` (HIGH, fix-2.2.0-blockers, adversarial re-probe): lets a
    // caller that already knows `routeName` IS a registered route (e.g.
    // useMinder's N1 Golden Path collection-form resolution) request a
    // MODIFIED starting URL — typically the route's own URL with a trailing
    // ':id' segment stripped — while dispatch stays THROUGH the registered
    // route below, so `route.headers`/`route.schema`/`route.timeout`/
    // dedup/model transform all still apply. Without this, the only way to
    // dispatch a rewritten URL was the ad-hoc/`requestRaw` path (an
    // unregistered raw path), which carries none of that route config —
    // silently failing open on auth headers and response validation.
    options?: CallerRequestOptions
  ): Promise<T> {
    // ── Ad-hoc / third-party escape hatch (mirrors useMinder's route-validation
    //    exemption and minder()'s standalone behavior) ─────────────────────────
    // An absolute URL or an explicit `rawUrl:true` option skips the registry
    // entirely and builds the request directly. Auth/interceptors/plugins still
    // apply because we go through the shared axiosInstance.
    const isAbsoluteUrl = /^https?:\/\//i.test(routeName);
    if (isAbsoluteUrl || options?.rawUrl === true) {
      return this.requestRaw<T>(routeName, data, params, options, isAbsoluteUrl);
    }

    // fix-2.2.0-blockers (REDESIGN): kept as `registeredRoute` — the DECLARED
    // route straight off the registry — deliberately never named `route`
    // beyond this point. `route` is reserved for the NARROWED, resolved
    // config a few lines down (see `resolveRequest`); this raw declared
    // value is only used to build that resolution and, further down, as the
    // `ApiRoute` argument `proxyManager.rewriteUrl` still expects.
    const registeredRoute = this.config.routes?.[routeName];
    if (!registeredRoute) {
      // An ad-hoc relative PATH (leading "/") that is not a registered route
      // NAME is treated as a raw path resolved against baseURL. This lets
      // provider-mode `useMinder('/ad-hoc')` work without the hook having to
      // thread the rawUrl flag. BARE unknown names (no leading slash) still
      // throw the helpful ROUTE_NOT_FOUND below.
      if (routeName.startsWith('/')) {
        return this.requestRaw<T>(routeName, data, params, options, false);
      }

      const availableRoutes = Object.keys(this.config.routes || {});
      const error = new MinderConfigError(
        `Route '${routeName}' not found in configuration`,
        `routes.${routeName}`,
        'ROUTE_NOT_FOUND',
        { requestedRoute: routeName, availableRoutes }
      );
      error.addSuggestion({
        message: `Available routes: ${availableRoutes.join(', ') || 'none configured'}`,
        action: 'Add this route to your configuration or check for typos',
        link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#routes'
      });
      throw error;
    }

    // fix-2.2.0-blockers (item 1, SINGLE CHOKE POINT): the ONE place a
    // caller's per-call `options` bag is ever converted into anything that
    // can reach the outgoing axios config — see requestOptions.ts'
    // `extractCallerRequestOptions` doc comment for why this makes the
    // fourth exfiltration channel structurally unreachable, not merely
    // patched. `otherOptions`/raw `options` no longer exist as bindings past
    // this line: `forwardable` (already narrowed to
    // `ForwardableRequestOptions` — no `url`/`baseURL`/`proxy`/... member)
    // and `schema` (the one other field genuinely needed downstream) are the
    // ONLY things carried forward.
    const {
      headers: customHeaders,
      method: optionMethod,
      params: optionParams,
      urlOverride,
      schema,
      forwardable,
    } = extractCallerRequestOptions(options);

    // fix-2.2.0-blockers (REDESIGN — ResolvedRequest): the ONE place
    // method/url are computed for this request. `route` from here on is the
    // NARROWED `ResolvedRouteConfig` (headers/timeout/schema/model only) —
    // `route.method`/`route.url` are gone; every downstream decision below
    // (the axios/fetch dispatch config, the in-flight cache key, GET-dedup
    // gating) reads `method`/`url` from this ONE resolution, never the
    // DECLARED `registeredRoute.method`/`registeredRoute.url` again. That
    // "declared vs. resolved" divergence was the actual defect: an
    // `operations.create()` call resolves through a GET base route with an
    // explicit POST method OVERRIDE (see resolveCrudOperationRoute), so the
    // DISPATCHED method was always correctly POST — but the cache-key/dedup
    // gating previously re-read `registeredRoute.method` (still 'GET') and
    // treated a real POST as a cacheable/dedupable GET. Two concurrent
    // `operations.create()` calls collapsed into ONE POST; a concurrent
    // `refetch()` (a genuine GET on the same base route/url/body) produced
    // the IDENTICAL cache key and could satisfy a concurrent create() with
    // its own cached GET response — ZERO POSTs reaching the wire while
    // create() still reported `success:true`. MEDIUM: `resolveRequest`
    // substitutes every OCCURRENCE of a repeated `:id` placeholder (not just
    // the first). C5: `consumedKeys` is what a ":id" route substituted into
    // the URL PATH, so it is excluded from the query-string below (no
    // redundant "?id=" alongside the path substitution).
    // item 3 (fix-2.2.0-blockers, adversarial re-probe): PATH substitution
    // must see params from EITHER source — the dedicated positional `params`
    // argument OR `options.params` — never just the former. Previously only
    // `params` reached `resolveRequest`, so a caller supplying the id via
    // `options.params` (e.g. `{ params: { id: 7 } }`) left the route's ':id'
    // placeholder UNRESOLVED while the redundant '?id=7' still landed on the
    // wire (observed: `DELETE /thing/:id?id=7`). `consumedKeys` below is
    // still computed from THIS merged set, so the query-string filter a few
    // lines down correctly excludes a key regardless of which source it came
    // from. Positional `params` wins on key collision (it was always the
    // dedicated path-params channel).
    const pathParams =
      optionParams && typeof optionParams === 'object'
        ? { ...(optionParams as Record<string, unknown>), ...(params || {}) }
        : params;

    // fix-2.2.0-blockers (STRUCTURAL REDESIGN, item 1): `resolveRequest` is
    // the LAST place this function reads `registeredRoute` — everything past
    // this point runs in `dispatchResolved`, a SEPARATE method that receives
    // only the narrowed `ResolvedRequestWithKeys`. `registeredRoute` (the
    // full `ApiRoute`, carrying its own `.method`/`.url`) is therefore
    // genuinely OUT OF LEXICAL SCOPE for all post-resolution dispatch logic —
    // not merely unused-by-convention. A future `registeredRoute.method` or
    // `registeredRoute.url` reintroduced anywhere in `dispatchResolved` is a
    // TypeScript compile error (`registeredRoute` does not exist there), not
    // a silent runtime divergence the next adversarial probe has to
    // rediscover. See `resolveRequest.ts`'s `ResolvedRequest` doc comment for
    // the four-round history this closes.
    const resolved = resolveRequest(registeredRoute, pathParams, { method: optionMethod, url: urlOverride });
    return this.dispatchResolved<T>(
      routeName,
      resolved,
      data,
      optionParams,
      customHeaders,
      forwardable,
      schema as StandardSchemaV1 | undefined
    );
  }

  /**
   * fix-2.2.0-blockers (STRUCTURAL REDESIGN, item 1): everything `request()`
   * does AFTER route resolution, extracted into its own method so the
   * DECLARED `registeredRoute` (a full `ApiRoute`, with its own `.method`/
   * `.url`) cannot be read here even by accident — it is not a parameter and
   * there is no other binding for it in this method's scope. Every
   * method/url decision below reads exclusively from `resolved`
   * (`ResolvedRequestWithKeys`) — normalized method, path-substituted url,
   * and the NARROWED `ResolvedRouteConfig` (`headers`/`timeout`/`schema`/
   * `model` only). Verified: adding a `resolved.route.method` or
   * `resolved.route.url` read anywhere in this method is a `tsc` compile
   * error, since `ResolvedRouteConfig` has neither key — proven directly
   * (inject the reader, observe the error, remove it) rather than merely
   * asserted.
   *
   * fix-2.2.0-blockers (item 3, COMPILE-TIME PROOF): `forwardable` is typed
   * `ForwardableRequestOptions` — a `Pick<AxiosRequestConfig, 'timeout' |
   * 'signal' | 'responseType' | 'onUploadProgress' | 'onDownloadProgress' |
   * 'withCredentials' | 'validateStatus' | 'paramsSerializer' |
   * 'decompress'>` — not `AxiosRequestConfig`. There is no `options: ...`
   * parameter carrying the full per-call bag anymore either (only the one
   * OTHER genuinely-needed field, `schema`, is threaded through
   * separately). `forwardable.url` / `forwardable.baseURL` /
   * `forwardable.proxy` are therefore `TS2339: Property '...' does not
   * exist on type 'ForwardableRequestOptions'` — proven directly: pasting
   * `const leak = forwardable.url;` here fails `tsc -p tsconfig.json` with
   * exactly that error (see the task report for the captured output).
   * `assertNoOriginOrTransportOptions` no longer needs to run here at all —
   * it already ran, unconditionally, inside
   * `extractCallerRequestOptions` (the ONLY function that produces a
   * `ForwardableRequestOptions` value), so by the time `forwardable`
   * reaches this method the origin/transport keys have already been
   * refused or were never present.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async dispatchResolved<T = any>(
    routeName: string,
    resolved: ResolvedRequestWithKeys,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    optionParams: Record<string, unknown> | undefined,
    customHeaders: AxiosRequestConfig['headers'] | undefined,
    forwardable: ForwardableRequestOptions,
    schema: StandardSchemaV1 | undefined
  ): Promise<T> {
    const { method, url, route, consumedKeys } = resolved;

    const queryParams =
      optionParams && typeof optionParams === 'object' && consumedKeys.size > 0
        ? Object.fromEntries(
            Object.entries(optionParams as Record<string, unknown>).filter(
              ([key]) => !consumedKeys.has(key)
            )
          )
        : optionParams;

    const requestConfig: AxiosRequestConfig = {
      url,
      headers: {
        ...route.headers,
        ...(this.proxyManager?.getProxyHeaders() || {}),
        ...(customHeaders || {})
      },
      timeout: route.timeout || this.proxyManager?.getTimeout() || this.config.performance?.timeout,
      // fix-2.2.0-blockers (SECURITY, round 2; item 1/3 STRUCTURAL FIX):
      // `forwardable` — never a raw options bag — see requestOptions.ts'
      // `extractCallerRequestOptions`/`FORWARDABLE_REQUEST_OPTION_KEYS`.
      // Only the vetted, non-origin, non-transport keys can ever reach this
      // config from a per-call option; every origin-changing/
      // transport-hijacking key was already refused before this method was
      // even called, and anything else unvetted is silently dropped by the
      // allowlist itself — "forward only what's explicitly permitted", not
      // "block what we happened to think of".
      ...forwardable,
      ...(queryParams !== undefined ? { params: queryParams } : {}),
      // Set LAST so neither the allowlisted per-call options above nor any
      // other key can clobber the RESOLVED method — already normalized
      // (trimmed/uppercased) by `resolveRequest`, so an untrimmed hand-built
      // `{ method: 'POST ' }` reaches axios/fetch as a clean 'POST' instead
      // of a raw HTTP-invalid token (previously: a bare TypeError reading
      // `_retryCount` off `undefined`, because axios/Node's http layer threw
      // BEFORE attaching `error.config` for that malformed method).
      method,
    };

    // fix-2.2.0-blockers (SECURITY, non-blocking hardening — cross-origin
    // redirect leak): a 3xx response from the route's OWN, trusted host can
    // redirect to ANY host via `Location`, and axios/follow-redirects
    // (Node's http adapter) transparently follows it. follow-redirects
    // already strips `Authorization`/`Cookie`/`Proxy-Authorization` on a
    // cross-origin (non-subdomain) hop by default, but NOT arbitrary custom
    // headers — a route-declared static secret header (e.g. `X-Api-Key`)
    // would otherwise ride along to whatever host the FIRST hop's response
    // pointed at. `sensitiveHeaders` is axios's own, built-in mechanism for
    // exactly this (see axios's Node http adapter / follow-redirects'
    // `_headerFilter`). Set here, unconditionally, from `route.headers` PLUS
    // the effective auth/CSRF header names (see `sensitiveHeaderNames` —
    // ALSO REQUIRED: a hand-configured `config.auth.authHeader` other than
    // the default 'Authorization' is a name follow-redirects' own built-in
    // default never covers) — NEVER from `forwardable`/a per-call option (it
    // is deliberately absent from `FORWARDABLE_REQUEST_OPTION_KEYS`), so a
    // caller can never widen or shrink which headers survive a redirect.
    requestConfig.sensitiveHeaders = this.sensitiveHeaderNames(route.headers);

    // Apply proxy rewriting if enabled. `route` here is the NARROWED
    // `ResolvedRouteConfig` — `ProxyManager.rewriteUrl`'s second parameter is
    // typed to that narrowed shape (it never reads `.method`/`.url` off it
    // anyway; see ProxyManager.ts), so the declared `ApiRoute` never needs to
    // flow this far even as a pass-through argument.
    if (this.proxyManager?.isEnabled()) {
      requestConfig.url = this.proxyManager.rewriteUrl(url, route);
      requestConfig.baseURL = '';
    }

    // Handle different content types with sanitization. D4: the sanitizer
    // lazy-loads DOMPurify; await ready() so a browser call never races an
    // in-flight import into the fail-closed SANITIZER_UNAVAILABLE throw.
    await this.sanitizer?.ready();
    applyRequestBody(requestConfig, data, this.sanitizer);

    // Mutating request middleware: plugins may rewrite the outgoing config or
    // short-circuit the request entirely with a synthetic response. Runs after
    // the config (headers/data) is fully assembled and before any transport.
    const shortCircuit = await this.runRequestInterceptors(requestConfig, routeName);
    if (shortCircuit) {
      const scData = shortCircuit.response.data;
      // Transform the synthetic payload with the route model too, so a
      // short-circuited response behaves exactly as if it came from the network.
      if (route.model && scData) {
        if (Array.isArray(scData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return scData.map((item: any) => new (route.model as any)().fromJSON(item)) as T;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (route.model as any)().fromJSON(scData) as T;
      }
      return scData as T;
    }

    // fix-2.2.0-blockers (dedup/cache-key STRUCTURAL fix, adversarial
    // re-probe round 2 — "phantom success", THEN re-probed again: two
    // wire-affecting fields (`requestConfig.params`/`requestConfig.headers`)
    // were STILL never in the key at all): the key is now derived from
    // `requestConfig` itself, IN FULL — the EXACT object `dispatch()` below
    // hands to axios/fetch — computed HERE, after every mutation point that
    // can change it: the proxy rewrite above, and any plugin
    // `onRequestIntercept` mutation via `runRequestInterceptors` just above
    // (which rewrites `.url`/`.method`/`.headers`/`.params`/`.data` IN PLACE
    // — see its doc comment).
    //
    // Two concurrent GETs to the SAME route with DIFFERENT
    // `{ params: { q: 'alpha' } }` / `{ q: 'beta' }` previously produced the
    // SAME key (params was never read for it at all) — ONE wire request,
    // BOTH callers got the 'alpha' body. Two concurrent GETs with
    // DIFFERENT per-call `{ headers: { 'X-User': 'alice' } }` / `'bob'`
    // collapsed the same way — cross-tenant response disclosure under
    // per-request auth. The previous fix derived the key from `requestConfig`
    // too, but then re-enumerated only TWO of its fields (`method`, `url`) —
    // a list that can silently drift out of sync with what
    // `requestConfig` actually carries the moment a THIRD wire-affecting
    // field (`params`, `headers`, ...) is added or starts being read from
    // it, exactly as happened here. `JSON.stringify(requestConfig)` instead
    // reads the object itself — there is no second, hand-maintained field
    // list to forget to update: any property `requestConfig` carries at
    // dispatch time is automatically part of the key, and any property it
    // DOESN'T carry (e.g. `params`/`headers` being absent) is automatically
    // NOT part of it. Purely-local, non-wire-affecting fields (`signal` — an
    // AbortSignal instance, whose own enumerable properties are empty, so it
    // stringifies to `{}` regardless of identity) can never accidentally
    // NARROW the key and defeat dedup between two calls that only differ in
    // an abort handle. `data` no longer needs its own separate expression
    // either — `applyRequestBody` (above) already wrote the final, sanitized
    // body onto `requestConfig.data`, so it is already part of the same
    // object.
    //
    // fix-2.2.0-blockers (SHOULD-FIX, dedup-key round 3): a bare
    // `JSON.stringify(requestConfig)` has its OWN blind spot — it silently
    // DROPS function-valued fields entirely (rather than merely stringifying
    // them oddly), so it could never distinguish two calls differing only in
    // `paramsSerializer` (added to the forwardable allowlist by the previous
    // round, and genuinely wire-affecting: it changes the encoded query
    // string) — or in a `URLSearchParams`/`FormData` body, which have no
    // enumerable own properties and stringify to `{}` regardless of content.
    // `serializeRequestConfigForDedupKey` (apiClient/dedupKey.ts) walks the
    // SAME `requestConfig` object via `JSON.stringify`'s own replacer and
    // repairs exactly those blind spots generically (by TYPE, not by naming
    // `paramsSerializer` specifically) — see its own doc comment for why a
    // named special case is exactly the mistake this class of bug keeps
    // recurring from.
    const dispatchedMethod = (requestConfig.method ?? method).toString().toUpperCase();
    const cacheKey = `${dispatchedMethod}:${serializeRequestConfigForDedupKey(requestConfig)}`;
    const isGet = dispatchedMethod === HttpMethod.GET;
    if (isGet && this.config.performance?.deduplication) {
      const cachedRequest = this.requestCache.get(cacheKey);
      if (cachedRequest) {
        return cachedRequest;
      }
    }

    // Execute request with caching for GET
    const startTime = performance.now();

    let requestPromise: Promise<AxiosResponse<T>>;

    // P2 (fix-2.2.0-blockers): native-fetch transport bypasses axios's own
    // dispatch entirely — see `dispatchNativeFetch` / the constructor.
    const dispatch = (): Promise<AxiosResponse<T>> =>
      (this.useNativeFetch
        ? this.dispatchNativeFetch(requestConfig)
        : this.axiosInstance.request(requestConfig)) as Promise<AxiosResponse<T>>;

    // Use deduplication if enabled
    if (this.deduplicator && isGet) {
      requestPromise = this.deduplicator.deduplicate(cacheKey, dispatch);
    } else {
      requestPromise = dispatch();

      // Simple cache logic (fallback)
      if (isGet && this.config.performance?.deduplication) {
        this.requestCache.set(cacheKey, requestPromise);

        // Clean up cache after request completes. F5 (fix-2.2.0-blockers):
        // `.finally()`'s return value is a NEW promise that adopts
        // `requestPromise`'s eventual state, so a real request failure (e.g.
        // a dead port) makes this DERIVED promise reject too. `requestPromise`
        // itself is awaited just below and its rejection is handled by the
        // caller — this floating derived promise had no handler at all, and
        // an unhandled rejection can crash a consumer's Node process outright
        // on a transient network error. `.catch(() => {})` only silences that
        // redundant derived promise.
        requestPromise
          .finally(() => {
            setTimeout(() => this.requestCache.delete(cacheKey), 1000);
          })
          .catch(() => { /* see comment above — requestPromise's rejection is handled by the caller */ });
      }
    }

    const response: AxiosResponse<T> = await requestPromise;

    // Record performance metrics
    if (this.performanceMonitor) {
      const duration = performance.now() - startTime;
      this.performanceMonitor.recordLatency(routeName, duration);
    }

    // Task 3.1: opt-in runtime response validation via Standard Schema.
    // `schema` isn't part of AxiosRequestConfig — it arrives as an ad-hoc
    // property on `options`, mirroring how `rawUrl` is threaded through.
    // Per-call `options.schema` wins over the route-def `route.schema`.
    // Validates the RAW response body before the model transform below,
    // since schemas describe wire JSON, not a decoded model instance. The
    // validator, error class, and throw logic all live in the deferred
    // responseValidation.js chunk, so callers who never configure a schema
    // pay only the bare presence-guard here.
    const effSchema = schema ?? route.schema;
    if (effSchema) {
      const { validateResponseOrThrow } = await import('./responseValidation.js');
      response.data = await validateResponseOrThrow<any>(response.data, effSchema, response.status);
    }

    // Transform response using model if specified
    if (route.model && response.data) {
      if (Array.isArray(response.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return response.data.map((item: any) => new (route.model as any)().fromJSON(item)) as T;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (route.model as any)().fromJSON(response.data) as T;
      }
    }

    return response.data;
  }

  /**
   * Build and dispatch a request for an ad-hoc URL that bypasses the route
   * registry — either an absolute `https?://` URL or a `rawUrl`/leading-slash
   * path. Goes through the shared axiosInstance so auth, interceptors and
   * plugins apply exactly as they do for registered routes.
   *
   * Method resolution: an explicit `options.method` wins; otherwise a request
   * carrying a body defaults to POST and a bodyless one to GET.
   *
   * fix-2.2.0-blockers (item 1, THE FOURTH EXFILTRATION CHANNEL): this method
   * used to spread the caller's ENTIRE `otherOptions` bag straight into the
   * outgoing config (`...otherOptions`, AFTER `url:` — so `options.url` won
   * outright; `options.baseURL`/`options.proxy`/`options.adapter`/... all
   * reached axios untouched too) — the EXACT shape fixed ~240 lines above in
   * `request()`'s registered-route path, reintroduced here because the two
   * methods each built their own axios config from caller options
   * independently. Reachable from the public API whenever a route name is
   * path-shaped/unregistered (`request()`'s `routeName.startsWith('/')`
   * branch) or absolute, including through `useMinder()`'s `axiosConfig`
   * passthrough — and every request this method dispatches carries the
   * caller's bearer token (`applySecurityHeaders`, attached by the SAME
   * axios request interceptor `request()`'s dispatch uses), so an
   * attacker-controlled `options.url`/`baseURL`/`proxy` here exfiltrates it
   * exactly like the three channels already closed on the registered-route
   * path did.
   *
   * Now routes through the SAME single choke point —
   * `extractCallerRequestOptions` (requestOptions.ts) — `request()`'s
   * registered-route path uses. `otherOptions`/a raw `AxiosRequestConfig`-
   * shaped caller bag no longer exists as a binding in this method at all;
   * `forwardable` is already narrowed to `ForwardableRequestOptions`, so
   * there is no type-legal way for this method to spread `url`/`baseURL`/
   * `proxy`/... into `requestConfig` even by accident.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requestRaw<T = any>(
    routeName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    params: Record<string, unknown> | undefined,
    options: CallerRequestOptions | undefined,
    isAbsoluteUrl: boolean
  ): Promise<T> {
    // `urlOverride` has no meaning here — there is no registered route to
    // dispatch "through" on this ad-hoc path — so it is simply discarded
    // rather than applied. `options.params` is a legitimate query-string
    // passthrough for this path (mirrors `request()`'s registered-route
    // handling of `optionParams`) — set explicitly below, never through the
    // allowlist (it isn't, and doesn't need to be, an axios TRANSPORT option).
    const {
      headers: customHeaders,
      method: optionMethod,
      params: optionParams,
      schema,
      forwardable,
    } = extractCallerRequestOptions(options);

    // Resolve the URL: absolute is used verbatim; relative resolves against the
    // instance baseURL. Support trivial `:param` substitution for parity with
    // registered routes — `substituteUrlParams` is the SAME single-source-of-
    // truth substitution `request()`'s `resolveRequest` uses (MEDIUM,
    // fix-2.2.0-blockers: every OCCURRENCE of a repeated `:key` placeholder,
    // not just the first).
    const { url } = substituteUrlParams(routeName, params);

    // fix-2.2.0-blockers (REDESIGN): normalize an explicit `options.method`
    // the same way `resolveRequest` does (trim + uppercase) — an untrimmed
    // hand-built `{ method: 'POST ' }` must dispatch cleanly here too,
    // instead of reaching axios/fetch as an HTTP-invalid token.
    const method = normalizeHttpMethod(
      optionMethod,
      data === null || data === undefined ? HttpMethod.GET : HttpMethod.POST
    );

    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      headers: {
        ...(this.proxyManager?.getProxyHeaders() || {}),
        ...(customHeaders || {})
      },
      timeout: this.proxyManager?.getTimeout() || this.config.performance?.timeout,
      ...forwardable,
      ...(optionParams !== undefined ? { params: optionParams } : {}),
    };

    // Absolute URLs are used verbatim: clear baseURL so the instance's
    // apiBaseUrl is never prefixed.
    if (isAbsoluteUrl) {
      requestConfig.baseURL = '';
    }

    // fix-2.2.0-blockers (ALSO REQUIRED, sensitive-header coverage gap): this
    // ad-hoc path dispatches through the SAME axios request interceptor that
    // attaches the caller's bearer token (applySecurityHeaders) — it needs
    // the SAME cross-origin-redirect protection the registered-route path
    // gets, which it never had before (no `sensitiveHeaders` was set here at
    // all).
    requestConfig.sensitiveHeaders = this.sensitiveHeaderNames();

    // Body handling with sanitization, mirroring the registered-route path.
    // D4: await ready() first — see the comment at the other call site above.
    await this.sanitizer?.ready();
    applyRequestBody(requestConfig, data, this.sanitizer);

    // Mutating request middleware (same semantics as the registered-route path).
    const shortCircuit = await this.runRequestInterceptors(requestConfig, routeName);
    if (shortCircuit) {
      return shortCircuit.response.data as T;
    }

    // P2 (fix-2.2.0-blockers): same native-fetch bypass as the registered-route path.
    const response: AxiosResponse<T> = (this.useNativeFetch
      ? await this.dispatchNativeFetch(requestConfig)
      : await this.axiosInstance.request(requestConfig)) as AxiosResponse<T>;

    // Task 3.1: opt-in runtime response validation via Standard Schema. No
    // registry route exists for this ad-hoc/raw path (absolute URL or
    // `rawUrl`/leading-slash escape hatch), so only the per-call
    // `options.schema` applies here — there is no route-def to fall back to.
    const effSchema = schema as StandardSchemaV1 | undefined;
    if (effSchema) {
      const { validateResponseOrThrow } = await import('./responseValidation.js');
      return (await validateResponseOrThrow(response.data, effSchema, response.status)) as T;
    }

    return response.data;
  }

  /**
   * Fire the upload-lifecycle plugin hooks (fire-and-forget, error-isolated per
   * plugin inside the manager). Zero-overhead when no plugins are registered.
   * MDPD-6: this is what makes `onUpload` reachable through the
   * useMinder / useMediaUpload path (both call {@link uploadFile}), not just via
   * the standalone MediaUploadManager.
   */
  private emitUploadHook(
    event: Omit<UploadLifecycleEvent, 'file' | 'timestamp'> & { file?: File }
  ): void {
    if (this.pluginManager.size === 0) return;
    const { file, ...rest } = event;
    void this.pluginManager.executeUploadHooks({
      ...rest,
      file: file ? { name: file.name, size: file.size, type: file.type } : undefined,
      timestamp: Date.now(),
    });
  }

  // File upload with progress
  async uploadFile(
    routeName: string,
    file: File,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // MDPD-6: emit the documented UploadLifecycleEvent phases through the plugin
    // bus so onUpload observers work on the hook path, mirroring MediaUploadManager.
    const uploadId = `${file?.name ?? 'upload'}-${file?.size ?? 0}-${Date.now()}`;
    const url = this.config.routes?.[routeName]?.url ?? routeName;

    this.emitUploadHook({ phase: 'start', uploadId, url, file });

    try {
      const result = await this.request(routeName, buildUploadFormData(file), undefined, {
        onUploadProgress: createUploadProgressHandler((progress) => {
          this.emitUploadHook({ phase: 'progress', uploadId, url, file, progress });
          onProgress?.(progress);
        }),
      });
      // Standardized on 'success' for parity with MediaUploadManager (both
      // emitters are unreleased-new; the type union still allows 'complete').
      this.emitUploadHook({ phase: 'success', uploadId, url, file, result });
      return result;
    } catch (error) {
      this.emitUploadHook({
        phase: 'error',
        uploadId,
        url,
        file,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  // WebSocket connection
  createWebSocket(url: string, protocols?: string[]): WebSocket {
    const token = this.authManager.getToken();
    const wsUrl = token ? `${url}?token=${token}` : url;
    return new WebSocket(wsUrl, protocols);
  }

  /**
   * Escape hatch: get the live, underlying axios instance for full, unrestricted
   * control (arbitrary `axios.request(...)`, adding one-off interceptors, etc.).
   *
   * Requests you issue directly against this instance bypass Minder's route
   * registry and plugin request/response emission — you are talking to axios
   * directly. However, because it is the SAME instance Minder uses internally,
   * all interceptors configured on it (auth-token injection, CSRF, CORS, retry,
   * 401 refresh, error normalization) DO still apply to those direct calls.
   *
   * @returns the internal AxiosInstance (same reference used for all Minder I/O)
   */
  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  // Get performance metrics
  getPerformanceMetrics() {
    return this.performanceMonitor?.getMetrics();
  }

  // Reset performance metrics
  resetPerformanceMetrics() {
    this.performanceMonitor?.reset();
  }
}