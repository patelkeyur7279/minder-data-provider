import axios, { AxiosError } from 'axios';
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
 * Redact sensitive header values before they reach debug logs.
 *
 * Extracted from `ApiClient.sanitizeHeaders` verbatim.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeHeaders(headers: any): any {
  if (!headers) return headers;
  const sanitized = { ...headers };
  const sensitiveHeaders = ['Authorization', 'Cookie', 'Set-Cookie', 'X-CSRF-Token', 'x-csrf-token'];

  Object.keys(sanitized).forEach(key => {
    if (sensitiveHeaders.some(h => h.toLowerCase() === key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    }
  });
  return sanitized;
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
  // Check if it's an AxiosError
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

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

  // Network error (has request but no response)
  if (error && typeof error === 'object' && 'request' in error) {
    const networkError = error as {
      request?: unknown;
      code?: string;
      config?: { url?: string; method?: string; timeout?: number };
    };

    // Check for timeout
    if (networkError.code === 'ECONNABORTED') {
      throw new MinderTimeoutError(
        'Request timeout',
        networkError.config?.timeout || 30000,
        networkError.config?.url
      );
    }

    // Check for offline
    if (networkError.code === 'ERR_NETWORK' || typeof navigator !== 'undefined' && !navigator.onLine) {
      // Auto-queue the failed request into the UNIFIED (platform) OfflineManager
      // so it replays on reconnect AND drives onSync / onConnectivityChange.
      // Only mutations are queued (GET/HEAD/OPTIONS are safe to simply re-issue
      // and were never queued by the previous manager either). addToQueue is
      // async and may reject (queue full / disabled); fire-and-forget so error
      // normalization stays synchronous.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isReplay = (networkError.config as any)?.__minderReplay === true;
      if (!isReplay && offlineManager && networkError.config?.url && networkError.config?.method) {
        const method = networkError.config.method.toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          void offlineManager
            .addToQueue(method as QueuedRequest['method'], networkError.config.url, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              body: (networkError.config as any).data,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              headers: (networkError.config as any).headers,
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
