import type { AxiosError } from 'axios';
import type { ApiError } from '../types.js';
import {
  MinderNetworkError,
  MinderTimeoutError,
  MinderOfflineError,
  MinderValidationError,
  MinderAuthError,
  MinderAuthorizationError
} from '../../errors/index.js';
import { telemetry } from '../../utils/TelemetryTracker.js';
import type { OfflineManager } from '../../platform/offline/OfflineManager.js';
import type { QueuedRequest } from '../../platform/offline/types.js';

/**
 * Shape shared by every "request went out, no HTTP response ever came back"
 * error this module classifies: axios's own `AxiosError` (ECONNREFUSED,
 * ENOTFOUND, ECONNRESET, ERR_NETWORK, a genuine timeout, ...) AND the legacy
 * plain-object shape (`{ request, code, config }`) `buildFetchAxiosLikeError`
 * and hand-built test doubles use. Both get classified by
 * {@link classifyNoResponseError} identically.
 */
interface NoResponseErrorShape {
  request?: unknown;
  code?: string;
  config?: {
    url?: string;
    method?: string;
    timeout?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headers?: any;
    __minderReplay?: boolean;
  };
}

/**
 * Classify a "request sent, no HTTP response received" failure: a genuine
 * timeout, an offline/unreachable condition (auto-queueing the mutation when
 * offline support is enabled), or a generic network error. Always throws.
 *
 * C3 fix (fix-2.2.0-blockers): previously this logic only ran for a
 * hand-shaped `{ request, code, config }` error — never for a REAL axios
 * failure, because axios sets `isAxiosError: true` on every error it throws
 * (confirmed against a real dead port: `isAxiosError:true`,
 * `code:ECONNREFUSED`, `response:undefined`), so the `isAxios` branch below
 * always won and fell to its generic `default:` case (status 0) first. This
 * function is now invoked from BOTH the axios branch (when there is no
 * `.response`) and the legacy `'request' in error` branch, so a real network
 * failure is classified — and auto-queued — the same way regardless of shape.
 *
 * Offline-queueing condition: when offline support is enabled
 * (`offlineManager` is present — `ApiClient` only ever passes one when
 * `config.offline.enabled` is true), ANY no-response failure (not just
 * `ERR_NETWORK` / `navigator.onLine === false`) is treated as
 * unreachable-and-queueable: the caller cannot distinguish "server refused
 * the connection" from "device has no network" — both mean the mutation
 * cannot be delivered right now. When offline support is NOT enabled, the
 * narrower legacy detection (`ERR_NETWORK` or `navigator.onLine === false`)
 * is preserved so an unconfigured app still gets a plain `NETWORK_ERROR`
 * (not `OFFLINE_ERROR`) for e.g. a dead port — see
 * tests/wire/platform-contract.mjs's P1b case.
 */
function classifyNoResponseError(
  networkError: NoResponseErrorShape,
  offlineManager: OfflineManager | undefined
): never {
  // Check for timeout — deliberately excluded from auto-queueing: the server
  // may have already received/processed the request, so blindly re-issuing
  // it on reconnect risks a duplicate mutation.
  if (networkError.code === 'ECONNABORTED') {
    throw new MinderTimeoutError(
      'Request timeout',
      networkError.config?.timeout || 30000,
      networkError.config?.url
    );
  }

  const isOfflineEnabled = !!offlineManager;
  // fix-a-app-router-crash-offline-parity (H1, discovered verifying this
  // task's own fix against a REAL plain-Node process — no jsdom): this
  // function's own doc comment above already specifies `navigator.onLine
  // === false` (a real, explicit "known offline" signal), but the code used
  // `!navigator.onLine` (a truthy-negation) — a mismatch between the
  // documented and actual contract. Node 21+ ships a minimal global
  // `navigator` object with NO `.onLine` property at all
  // (`navigator.onLine === undefined`), so `!navigator.onLine` was `true`
  // in EVERY plain-Node/SSR call (App Router Route Handlers, Server
  // Components, any non-jsdom Node process) — misclassifying a plain
  // NETWORK_ERROR as OFFLINE_ERROR even with offline support never
  // configured. This never surfaced in this repo's own test/wire suite
  // because every existing case exercising this branch happens to run
  // under jsdom (which DOES set a real `navigator.onLine` boolean, default
  // `true`) — but a genuinely plain Node process (exactly the standalone
  // `minder()` path's real-world environment) hit it every time. Strict
  // `=== false` matches the doc comment's own contract and jsdom's/real
  // browsers' behavior identically; only the previously-mishandled
  // `undefined` case changes (correctly stops looking "offline").
  const looksOffline =
    isOfflineEnabled ||
    networkError.code === 'ERR_NETWORK' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false);

  if (looksOffline) {
    // Auto-queue the failed request into the UNIFIED (platform) OfflineManager
    // so it replays on reconnect AND drives onSync / onConnectivityChange.
    // Only mutations are queued (GET/HEAD/OPTIONS are safe to simply re-issue
    // and were never queued by the previous manager either). addToQueue is
    // async and may reject (queue full / disabled); fire-and-forget so error
    // normalization stays synchronous.
    const isReplay = networkError.config?.__minderReplay === true;
    if (!isReplay && offlineManager && networkError.config?.url && networkError.config?.method) {
      const method = networkError.config.method.toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        void offlineManager
          .addToQueue(method as QueuedRequest['method'], networkError.config.url, {
            body: networkError.config.data,
            headers: networkError.config.headers,
          })
          .catch(() => {
            /* queue full / disabled — best-effort auto-queue only */
          });
      }
    }
    throw new MinderOfflineError('No network connection', networkError.config?.url);
  }

  // Generic network error
  throw new MinderNetworkError(
    'Network error - please check your connection',
    0,
    undefined,
    networkError.config?.url,
    networkError.config?.method?.toUpperCase(),
    'NETWORK_ERROR'
  );
}

/**
 * Classify a raw axios/network/unknown error into Minder's structured
 * `ApiError` shape, throwing one of the `Minder*Error` subclasses for
 * well-known HTTP/network conditions.
 *
 * Extracted from `ApiClient.buildError` verbatim — the offline manager
 * (previously read via `this.offlineManager`) is now an explicit parameter
 * so this function has no implicit `this` dependency.
 */
export function buildApiError(error: unknown, offlineManager?: OfflineManager): ApiError {
  // Check if it's an AxiosError.
  // D3: duck-typed instead of `axios.isAxiosError(error)` so this module never
  // statically imports axios (it must stay off the classify-only error path).
  // Every axios adapter sets `isAxiosError: true` on the error it throws —
  // this is exactly what `axios.isAxiosError` itself checks internally.
  const isAxios = !!error && typeof error === 'object' && (error as { isAxiosError?: unknown }).isAxiosError === true;
  if (isAxios) {
    const axiosError = error as AxiosError;

    // C3 fix: no `.response` at all (ECONNREFUSED, ENOTFOUND, ECONNRESET,
    // ERR_NETWORK, a genuine timeout, ...) is NOT an HTTP status to switch
    // on — classify it via the shared no-response path (timeout / offline
    // auto-queue / generic network error) instead of falling into the
    // `default:` case below with a fabricated status of 0.
    if (!axiosError.response) {
      classifyNoResponseError(axiosError as unknown as NoResponseErrorShape, offlineManager);
    }

    const status = axiosError.response?.status || 0;
    const url = axiosError.config?.url;
    const method = axiosError.config?.method?.toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseData = axiosError.response?.data as any;
    const responseHeaders = axiosError.response?.headers as Record<string, string> | undefined;

    switch (status) {
      case 400:
        return {
          message: responseData?.message || 'Bad Request',
          status,
          code: 'BAD_REQUEST',
          details: responseData,
        };

      case 401:
        telemetry.recordAuthFailure();
        throw new MinderAuthError(
          responseData?.message || 'Authentication required'
        );

      case 403:
        // Check if this is a CORS origin blocked error
        if (responseHeaders?.['access-control-allow-origin'] === 'null') {
          const corsMsg = responseData?.message || 'CORS origin blocked - request origin not allowed';
          throw new MinderNetworkError(corsMsg, 403, responseData, url, method, 'CORS_ORIGIN_BLOCKED');
        }
        throw new MinderAuthorizationError(
          responseData?.message || 'Permission denied'
        );

      case 404: {
        const notFoundMsg = responseData?.message || `Resource not found: ${method} ${url}`;
        throw new MinderNetworkError(notFoundMsg, 404, responseData, url, method);
      }

      case 405: {
        // Check if this is a CORS preflight failed error
        if (method === 'OPTIONS') {
          const corsMsg = responseData?.message || 'CORS preflight request failed - server does not allow OPTIONS method';
          throw new MinderNetworkError(corsMsg, 405, responseData, url, method, 'CORS_PREFLIGHT_FAILED');
        }
        const methodMsg = responseData?.message || `Method not allowed: ${method} ${url}`;
        throw new MinderNetworkError(methodMsg, 405, responseData, url, method);
      }

      case 422: {
        throw new MinderValidationError(
          responseData?.message || 'Validation failed',
          responseData?.errors
        );
      }

      case 429: {
        telemetry.recordRateLimitHit();
        const rateLimitMsg = responseData?.message || 'Too many requests - rate limit exceeded';
        throw new MinderNetworkError(rateLimitMsg, 429, responseData, url, method);
      }

      case 500:
      case 502:
      case 503:
      case 504: {
        const serverMsg = responseData?.message || 'Server error - please try again later';
        throw new MinderNetworkError(serverMsg, status, responseData, url, method);
      }

      default:
        throw new MinderNetworkError(
          responseData?.message || axiosError.message || 'API error',
          status,
          responseData,
          url,
          method,
          responseData?.code || 'API_ERROR'
        );
    }
  }

  // Network error (has request but no response) — legacy plain-object shape
  // (`buildFetchAxiosLikeError`, hand-built test doubles). Classified via the
  // SAME shared logic the axios no-response branch above now uses.
  if (error && typeof error === 'object' && 'request' in error) {
    classifyNoResponseError(error as NoResponseErrorShape, offlineManager);
  }

  // Other errors
  const errorMessage = error instanceof Error
    ? error.message
    : 'Unknown error occurred';

  return {
    message: errorMessage,
    code: 'UNKNOWN_ERROR',
    details: error,
  };
}

/**
 * Normalize any thrown/rejected error into Minder's structured shape AND attach
 * the ORIGINAL underlying error as `.raw` on whatever it produces — both the
 * objects it returns (e.g. the 400 result object) and the MinderError subclasses
 * it throws. This guarantees every error a consumer eventually sees exposes the
 * untouched source error (typically the AxiosError) for `.raw` inspection.
 *
 * Extracted from `ApiClient.handleError` verbatim.
 */
export function normalizeApiError(error: unknown, offlineManager?: OfflineManager): ApiError {
  const attachRaw = (target: unknown): void => {
    if (target && (typeof target === 'object' || typeof target === 'function')) {
      try {
        (target as { raw?: unknown }).raw = error;
      } catch {
        /* frozen/sealed target — best-effort only */
      }
    }
  };

  try {
    const apiError = buildApiError(error, offlineManager);
    attachRaw(apiError);
    return apiError;
  } catch (thrown) {
    attachRaw(thrown);
    throw thrown;
  }
}
