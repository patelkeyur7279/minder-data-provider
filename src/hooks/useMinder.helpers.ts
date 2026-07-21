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
import type { RetryConfig, MinderConfig } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';
import {
  replaceUrlParams,
  hasUnreplacedParams,
  getRouteSuggestions,
} from '../utils/routeHelpers.js';
import { MinderError } from '../errors/MinderError.js';
import type { UseMinderReturn } from './useMinder.js';

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
    if (routeConfig && hasUnreplacedParams(routeConfig.url)) {
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
  runtimeOptions: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any> };
} {
  const isInternalWrapper = variables && typeof variables === 'object' && '__minder_wrapper' in variables;
  return {
    data: isInternalWrapper ? variables.data : variables,
    runtimeOptions: isInternalWrapper ? (variables.options || {}) : {},
  };
}

/** Merges hook-level options with per-call runtime options for a mutation. */
export function mergeMutationRuntimeOptions(
  options: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any> },
  runtimeOptions: { params?: Record<string, any>; headers?: Record<string, string>; axiosConfig?: Record<string, any> }
): {
  mergedParams: Record<string, any>;
  mergedHeaders: Record<string, string>;
  mergedAxiosConfig: Record<string, any>;
} {
  return {
    mergedParams: { ...options.params, ...runtimeOptions.params },
    mergedHeaders: { ...options.headers, ...runtimeOptions.headers },
    mergedAxiosConfig: { ...options.axiosConfig, ...runtimeOptions.axiosConfig },
  };
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
