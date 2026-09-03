"use client";

/**
 * 🎯 useMinder - The ONLY Hook You Need for Everything
 * 
 * One unified hook for ALL data operations, authentication, caching, WebSocket, and file uploads.
 * No need for separate useAuth, useCache, useWebSocket, or useMediaUpload hooks.
 * Context-aware: works with or without MinderDataProvider.
 * 
 * ✨ Core Features:
 * - ✅ Data fetching with auto-caching
 * - ✅ CRUD operations (create, read, update, delete)
 * - ✅ Authentication & token management
 * - ✅ Cache control & invalidation
 * - ✅ WebSocket real-time communication
 * - ✅ File uploads with progress tracking
 * - ✅ Loading & error states
 * - ✅ Optimistic updates
 * - ✅ SSR/CSR compatible
 * 
 * @example
 * // ✅ Fetch data
 * const { data, loading, error } = useMinder('posts');
 * 
 * @example
 * // ✅ CRUD operations
 * const { items, operations } = useMinder('posts');
 * await operations.create({ title: 'New Post' });
 * await operations.update(1, { title: 'Updated' });
 * await operations.delete(1);
 * 
 * @example
 * // ✅ Authentication
 * const { auth } = useMinder('users');
 * await auth.setToken('jwt-token');
 * const isLoggedIn = auth.isAuthenticated();
 * const user = auth.getCurrentUser();
 * 
 * @example
 * // ✅ Cache control
 * const { cache } = useMinder('posts');
 * await cache.invalidate(['posts']);
 * cache.clear();
 * const isFresh = cache.isQueryFresh(['posts', '1']);
 * 
 * @example
 * // ✅ WebSocket
 * const { websocket } = useMinder('messages');
 * websocket.connect();
 * websocket.subscribe('new-message', (msg) => console.log(msg));
 * websocket.send('chat', { text: 'Hello!' });
 * 
 * @example
 * // ✅ File upload
 * const { upload } = useMinder('media');
 * const result = await upload.uploadFile(file);
 * console.log(upload.progress.percentage); // 0-100
 * 
 * @example
 * // ✅ All features combined
 * const {
 *   data,
 *   operations,
 *   auth,
 *   cache,
 *   websocket,
 *   upload
 * } = useMinder('posts');
 * 
 * // Everything you need in ONE hook! 🚀
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions, UseInfiniteQueryOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult, HttpMethod as MutationHttpMethod } from '../core/minder.js';
import { useMinderContextSafe } from '../core/MinderContext.js';
import { HttpMethod } from '../constants/enums.js';
import type { RetryConfig } from '../core/types.js';
import { getGlobalMinderConfig } from '../core/globalConfig.js';
import { globalAuthManager } from '../auth/GlobalAuthManager.js';
import {
  subscribeToUploadProgress,
  setUploadProgress as setGlobalUploadProgress,
  getUploadProgress as getGlobalUploadProgress
} from '../upload/uploadProgressStore.js';
import type { UploadProgress } from '../upload/uploadProgressStore.js';
import { MinderError } from '../errors/MinderError.js';
import { parseJWT as decodeJwt } from '../utils/jwt.js';
// Local-first storage is opt-in (`source: 'local' | 'local-first'`); load it
// lazily so the platform storage-adapter graph never ships to consumers that
// don't use it. Module promise is cached — one dynamic import per session.
let localStorePromise: Promise<typeof import('../core/LocalStore.js')> | null = null;
const loadLocalStore = () => (localStorePromise ??= import('../core/LocalStore.js'));
import {
  createRetryConfig,
  deriveQueryKey,
  mergeRequestParams,
  deriveLocalKey,
  computeRouteValidation,
  validateMutationRoute,
  buildMinderResult,
  unwrapMutationVariables,
  mergeMutationRuntimeOptions,
  buildInvalidRouteResult,
  resolveCrudOperationRoute,
  resolveFetchRouteName,
  assertValidResourceId,
} from './useMinder.helpers.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Validation function type - can be sync or async
 * @example Using Zod
 * const userSchema = z.object({ email: z.string().email(), age: z.number().min(0) });
 * validate: (data) => userSchema.parse(data)
 * 
 * @example Using Yup
 * const userSchema = yup.object({ email: yup.string().email(), age: yup.number().positive() });
 * validate: (data) => userSchema.validate(data)
 * 
 * @example Custom validation
 * validate: (data) => {
 *   if (!data.email?.includes('@')) throw new Error('Invalid email');
 *   return data;
 * }
 */
export type ValidateFunction<TData = any> = (data: TData) => TData | Promise<TData>;

/**
 * Options for useMinder hook
 */
export interface UseMinderOptions<TData = any> extends MinderOptions<TData> {
  /**
   * Auto-fetch data on component mount
   * @default true
   */
  autoFetch?: boolean;

  /**
   * Refetch on window focus
   * @default false
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Refetch on reconnect
   * @default true
   */
  refetchOnReconnect?: boolean;

  /**
   * Refetch interval in milliseconds
   * @default false (no interval)
   */
  refetchInterval?: number | false;

  /**
   * Enable query (allows conditional fetching)
   * @default true
   */
  enabled?: boolean;

  /**
   * Throw errors instead of returning them in `error`. Lets you use
   * try/catch, TanStack Query's native error states, and React error
   * boundaries instead of the structured-result model.
   * @default false
   */
  throwOnError?: boolean;

  /**
   * Treat `route` as a raw/arbitrary URL and bypass the route registry, so you
   * can call ad-hoc or third-party endpoints without pre-registering them.
   * Absolute URLs (http/https) bypass the registry automatically.
   * @default false
   */
  rawUrl?: boolean;

  /**
   * Where this query reads its data (Wave I — local-first):
   * - `'network'` (default): fetch from the API, as always.
   * - `'local'`: read only from local persistent storage (offline data store);
   *   never touches the network. Returns `null` data if nothing is stored.
   * - `'local-first'`: fetch from the network; on success persist the result to
   *   local storage; on network failure fall back to the last persisted value.
   *   Your UI keeps working offline with no extra code.
   *
   * Local storage is platform-appropriate (web → localStorage, native →
   * AsyncStorage, expo → SecureStore, electron → electron-store).
   * @default 'network'
   */
  source?: 'network' | 'local' | 'local-first';

  /**
   * Optional validation function called before mutations
   * Supports Zod, Yup, or custom validation logic
   * Validation errors prevent API calls
   * 
   * @example With Zod
   * ```typescript
   * import { z } from 'zod';
   * const userSchema = z.object({ 
   *   email: z.string().email(), 
   *   age: z.number().min(0) 
   * });
   * 
   * const { operations } = useMinder('users', {
   *   validate: (data) => userSchema.parse(data)
   * });
   * 
   * // This will throw before API call
   * await operations.create({ email: 'invalid', age: -5 });
   * ```
   * 
   * @example With custom validation
   * ```typescript
   * const { operations } = useMinder('users', {
   *   validate: (data) => {
   *     if (!data.email?.includes('@')) {
   *       throw new Error('Invalid email format');
   *     }
   *     return data;
   *   }
   * });
   * ```
   */
  validate?: ValidateFunction<TData>;

  /**
   * Enhanced retry configuration
   * 
   * @example Custom retry count
   * ```typescript
   * const { data } = useMinder('posts', {
   *   retryConfig: { maxRetries: 5 }
   * });
   * ```
   * 
   * @example Custom retry logic
   * ```typescript
   * const { data } = useMinder('posts', {
   *   retryConfig: {
   *     maxRetries: 3,
   *     retryableStatusCodes: [408, 429, 503],
   *     backoff: 'exponential',
   *     baseDelay: 1000,
   *     shouldRetry: (error, attempt) => {
   *       // Only retry on network errors, not client errors
   *       return error.status >= 500 || error.status === 429;
   *     }
   *   }
   * });
   * ```
   * 
   * @example Custom backoff strategy
   * ```typescript
   * const { data } = useMinder('posts', {
   *   retryConfig: {
   *     backoff: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000)
   *   }
   * });
   * ```
   */
  retryConfig?: RetryConfig;

  /**
   * 🆕 Custom query key for fine-grained cache control
   * By default, query key is [route, params]
   * 
   * @example Custom query key
   * ```typescript
   * const { data } = useMinder('posts', {
   *   queryKey: ['posts', 'featured', filters]
   * });
   */
  /** Additional keys for React Query caching */
  queryKey?: unknown[];

  /**
   * 🆕 Cache configuration
   * Controls whether query result should be cached
   * 
   * @default true
   */
  cache?: boolean;

  /**
   * 🆕 Stale time in milliseconds
   * How long data is considered fresh
   * 
   * @default 5 * 60 * 1000 (5 minutes)
   */
  staleTime?: number;

  /**
   * 🆕 Garbage collection time in milliseconds
   * How long inactive data stays in cache
   * 
   * @default 10 * 60 * 1000 (10 minutes)
   */
  gcTime?: number;

  /**
   * 🆕 Enable infinite query mode for pagination
   * When true, uses useInfiniteQuery instead of useQuery
   * 
   * @default false
   */
  infinite?: boolean;

  /**
   * 🆕 Get next page param for infinite queries
   * 
   * @example
   * ```typescript
   * const { data, fetchNextPage } = useMinder('posts', {
   *   infinite: true,
   *   getNextPageParam: (lastPage) => lastPage.nextCursor
   * });
   * ```
   */
  getNextPageParam?: (lastPage: unknown, allPages: unknown[]) => unknown;
  
  /** Function to compute previous page parameter for infinite queries */
  getPreviousPageParam?: (firstPage: unknown, allPages: unknown[]) => unknown;

  /**
   * 🆕 Initial page param for infinite queries
   * 
   * @default undefined
   */
  initialPageParam?: any;

  /**
   * TanStack Query options override
   */
  queryOptions?: Omit<UseQueryOptions<MinderResult<TData>>, 'queryKey' | 'queryFn'>;

  /**
   * TanStack Mutation options override
   */
  mutationOptions?: Omit<UseMutationOptions<MinderResult<TData>>, 'mutationFn'>;
}

/**
 * Return type for useMinder hook
 */
export interface UseMinderReturn<TData = any> {
  /**
   * Response data (single item or array)
   */
  data: TData | null;

  /**
   * Alias for data when working with collections
   */
  items: TData | null;

  /**
   * Loading state (true during fetch or mutation)
   */
  loading: boolean;

  /**
   * Error information (null if no error)
   */
  error: any;

  /**
   * Success flag
   */
  success: boolean;

  /**
   * Refetch data manually
   */
  refetch: () => Promise<MinderResult<TData>>;

  /**
   * Mutate data (create/update/delete)
   * @param data - Data to send
   * @param options - Dynamic options (params, headers, axiosConfig, method)
   */
  mutate: (data?: any, options?: { params?: Record<string, any>, headers?: Record<string, string>, axiosConfig?: Record<string, any>, method?: MutationHttpMethod }) => Promise<MinderResult<TData>>;

  /**
   * CRUD operations (available when within MinderDataProvider)
   */
  operations?: {
    create: (item: Partial<TData>, options?: { params?: Record<string, any> }) => Promise<TData>;
    update: (id: string | number, item: Partial<TData>, options?: { params?: Record<string, any> }) => Promise<TData>;
    delete: (id: string | number, options?: { params?: Record<string, any> }) => Promise<void>;
    fetch: (options?: { params?: Record<string, any> }) => Promise<TData[]>;
    refresh: () => void;
    clear: () => void;
  };

  /**
   * Authentication methods (NEW - integrated from useAuth)
   * 🆕 Now works with or without MinderDataProvider using GlobalAuthManager
   */
  auth: {
    setToken: (token: string) => Promise<void>;
    getToken: () => string | null;
    clearAuth: () => Promise<void>;
    isAuthenticated: () => boolean;
    setRefreshToken: (token: string) => Promise<void>;
    getRefreshToken: () => string | null;
    login?: (credentials: any) => Promise<any>;
    logout?: () => Promise<void>;
    getCurrentUser: () => any;
  };

  /**
   * Cache control methods (NEW - integrated from useCache)
   */
  cache: {
    invalidate: (keys?: string | string[]) => Promise<void>;
    prefetch: (queryFn: () => Promise<any>, options?: any) => Promise<void>;
    clear: (key?: string | string[]) => void;
    /** Get cache statistics */
    getStats: () => unknown[];
    isQueryFresh: (key: string | string[]) => boolean;
  };

  /**
   * WebSocket methods (NEW - integrated from useWebSocket)
   */
  websocket: {
    connect: () => void;
    disconnect: () => void;
    send: (type: string, data: any) => void;
    subscribe: (event: string, callback: (data: any) => void) => (() => void);
    isConnected: () => boolean;
  };

  /**
   * File upload methods (NEW - integrated from useMediaUpload)
   * 🆕 Now uses shared upload progress across all hook instances
   */
  upload: {
    uploadFile: (file: File, uploadId?: string) => Promise<any>;
    /** Upload multiple files with progress tracking */
    uploadMultiple: (files: File[]) => Promise<unknown[]>;
    progress: { loaded: number; total: number; percentage: number };
    isUploading: boolean;
  };

  /**
   * Is currently fetching data
   */
  isFetching: boolean;

  /**
   * Is data stale (needs refetch)
   */
  isStale: boolean;

  /**
   * Is mutation pending
   */
  isMutating: boolean;

  /**
   * Invalidate cache for this query
   */
  invalidate: () => Promise<void>;

  /**
   * 🆕 Cancel ongoing requests for this query
   * Useful for preventing race conditions and reducing unnecessary network traffic
   * 
   * @example
   * const { cancel } = useMinder('posts');
   * 
   * // Cancel when component unmounts
   * useEffect(() => {
   *   return () => cancel();
   * }, [cancel]);
   * 
   * @example
   * // Cancel when user navigates away
   * const handleNavigation = () => {
   *   cancel();
   *   navigate('/somewhere-else');
   * };
   */
  cancel: () => Promise<void>;

  /**
   * 🆕 Is the current request cancelled
   */
  isCancelled: boolean;

  /**
   * 🆕 Fetch next page (infinite queries only)
   * Available when infinite: true option is set
   */
  fetchNextPage?: () => Promise<any>;

  /**
   * 🆕 Has more pages to fetch (infinite queries only)
   */
  hasNextPage?: boolean;

  /**
   * 🆕 Is fetching next page (infinite queries only)
   */
  isFetchingNextPage?: boolean;

  /**
   * 🆕 Fetch previous page (infinite queries only)
   */
  fetchPreviousPage?: () => Promise<any>;

  /**
   * 🆕 Has previous pages (infinite queries only)
   */
  hasPreviousPage?: boolean;

  /**
   * 🆕 Is fetching previous page (infinite queries only)
   */
  isFetchingPreviousPage?: boolean;

  /**
   * Raw TanStack Query object (for advanced use)
   */
  query: any;

  /**
   * Raw TanStack Mutation object (for advanced use)
   */
  mutation: any;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * useMinder - React hook for data fetching and mutations
 * 
 * Thin wrapper around minder() function with reactive state
 * Uses TanStack Query under the hood for caching and deduplication
 * 
 * 🆕 v2.1 Enhancements:
 * - Works with or without MinderDataProvider
 * - Global auth manager fallback
 * - Shared upload progress across instances
 * - Route validation with suggestions
 * - Parameter replacement without provider
 * - Custom query keys
 * - Per-hook retry configuration
 * - Manual cache control
 * - Request cancellation
 * - Infinite scroll support
 */
export function useMinder<TData = any>(
  route: string,
  options: UseMinderOptions<TData> = {}
): UseMinderReturn<TData> {
  // All hooks MUST be at the top level (React Rules of Hooks)
  const queryClient = useQueryClient();

  // Cancellation state
  const [isCancelled, setIsCancelled] = useState(false);
  const cancelledRef = useRef(false);

  // Unique upload ID for shared progress
  const uploadIdRef = useRef(`upload-${route}-${Date.now()}`);

  // Latest TanStack query/mutation instances, held in a ref so the stable
  // callbacks below (refetch / mutate / CRUD operations) can reach the current
  // instances WITHOUT listing them as deps — their object identity changes on
  // every state transition by design, which would otherwise churn callback
  // identity every render. Assigned once per render after the hooks run.
  const tanstackRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutation: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMutation: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMutation: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMutation: any;
  }>({
    query: null,
    mutation: null,
    createMutation: null,
    updateMutation: null,
    deleteMutation: null,
  });

  // Context is null in standalone (no-provider) mode — non-throwing accessor
  // keeps the hook order stable (react-hooks/rules-of-hooks).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context: any = useMinderContextSafe();
  const hasContext = context !== null;



  // Get global config if no context
  const globalConfig = useMemo(() => {
    if (!hasContext) {
      return getGlobalMinderConfig();
    }
    return null;
  }, [hasContext]);

  // 🛡️ Runtime Safety: Ensure Minder is configured.
  // Zero-config exemption: an absolute http(s) URL needs neither a provider nor a
  // global config — it carries its own origin and is dispatched verbatim by the
  // standalone minder() path. So only demand configuration for non-absolute routes.
  if (!hasContext && !globalConfig && !/^https?:\/\//i.test(route)) {
    throw new Error(
      '[Minder] Configuration missing! You must either:\n' +
      '1. Wrap your app in <MinderDataProvider>\n' +
      '2. Call configureMinder() globally before using hooks\n' +
      '(Absolute http(s) URLs are exempt — they need no configuration.)'
    );
  }

  // Validate route and provide suggestions if invalid. The ad-hoc-bypass /
  // registry-lookup / unreplaced-param logic is pure and lives in
  // computeRouteValidation (useMinder.helpers.ts) — this just supplies the
  // current hook-scoped inputs and memoizes on them.
  const routeValidation = useMemo(
    () => computeRouteValidation(
      route,
      options.rawUrl,
      options.params,
      options.autoFetch,
      context?.config || globalConfig
    ),
    [route, context?.config, globalConfig, options.params, options.autoFetch, options.rawUrl]
  );

  // Stabilize query key to prevent unnecessary refetches on every render
  // Allow custom query key or use [route, params]
  const queryKey = useMemo(
    () => deriveQueryKey(options.queryKey, route, options.params),
    [options.queryKey, route, JSON.stringify(options.params)]
  );

  // C4: mounting a hook whose ROUTE declares a mutating HTTP verb (POST/PUT/
  // PATCH/DELETE) must never fire a request just by rendering — only an
  // explicit mutate()/operations call may. `query`/`infiniteQuery` below
  // auto-fetch on mount by default (isQueryEnabled), and the request they
  // dispatch resolves its ACTUAL wire method the same way ApiClient/minder()
  // do — explicit `options.method`, else the registry's declared route
  // method. So e.g. `useMinder('createUser')` on a route declared POST
  // previously fired a real empty-bodied POST on mount before any mutate()
  // call. Mirrors the "explicit option > registry entry" precedence used
  // everywhere else in this file.
  const resolvedRouteMethod = useMemo(() => {
    const registeredRoute = (context?.config || globalConfig)?.routes?.[route];
    const method = options.method || registeredRoute?.method;
    return method ? String(method).toUpperCase() : HttpMethod.GET;
  }, [context?.config, globalConfig, route, options.method]);
  const isMutatingRoute = resolvedRouteMethod !== HttpMethod.GET;

  // Determine if query should be enabled
  const isQueryEnabled = useMemo(
    () =>
      options.enabled !== false &&
      options.autoFetch !== false &&
      routeValidation.valid &&
      !isMutatingRoute,
    [options.enabled, options.autoFetch, routeValidation.valid, isMutatingRoute]
  );

  // Dev-facing, once-per-mount notice so a silently-skipped auto-fetch isn't
  // mistaken for a bug — only fires when auto-fetch would otherwise have run
  // (i.e. the ONLY reason it didn't is the mutating-route guard above).
  const warnedMutatingRouteRef = useRef(false);
  useEffect(() => {
    if (
      isMutatingRoute &&
      options.enabled !== false &&
      options.autoFetch !== false &&
      !warnedMutatingRouteRef.current
    ) {
      warnedMutatingRouteRef.current = true;
      console.warn(
        `[Minder] useMinder("${route}") declares a ${resolvedRouteMethod} route, so it will NOT ` +
        'auto-fetch on mount — that would fire a real request with no explicit call. Use ' +
        'mutate()/operations to invoke it, or pass { autoFetch: false } to silence this warning.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMutatingRoute, resolvedRouteMethod, route]);



  // NOTE: The invalid-route case is handled as a RESULT branch AFTER all hooks
  // run (see the end of this function), not as an early return. Returning early
  // here would skip the query/mutation/CRUD/upload hooks below and change the
  // hook count between renders whenever `routeValidation.valid` flips, which
  // React rejects with "rendered fewer hooks than expected".

  // Create retry configuration
  const retryConfig = useMemo(
    () => createRetryConfig(options.retryConfig),
    [options.retryConfig]
  );

  // =========================================================================
  // QUERY (for GET requests)
  // 🆕 Now supports both regular and infinite queries
  // =========================================================================

  // Query function factory
  const createQueryFn = (pageParam?: any) => async (): Promise<MinderResult<TData>> => {
    // Check if request was cancelled
    if (cancelledRef.current) {
      throw new Error('Request cancelled');
    }

    // Throw validation error if route is invalid
    if (!routeValidation.valid) {
      throw new Error(routeValidation.error);
    }

    let result: MinderResult<TData>;

    // Merge page param into options if infinite query
    const requestParams = mergeRequestParams(options.params, pageParam);

    // Wave I — local-first. The local key includes pageParam so paginated
    // local reads don't collide. `source` defaults to 'network' → the branches
    // below are skipped entirely and the existing code path runs unchanged.
    const source = options.source ?? 'network';
    const localKey = deriveLocalKey(queryKey, pageParam);

    // LOCAL: read only from local storage; never touch the network.
    if (source === 'local') {
      const { getDefaultLocalStore } = await loadLocalStore();
      const localData = await getDefaultLocalStore().get<TData>(localKey);
      return buildMinderResult<TData>({
        data: localData, error: null, status: 200, success: true,
        method: HttpMethod.GET, route, cached: true,
      });
    }

    if (context?.apiClient) {
      // Use ApiClient for parameter replacement (when within MinderDataProvider)
      try {
        // N1 (fix-2.2.0-blockers, Golden Path): when this route's URL carries
        // an unresolved terminal ':id' PATH placeholder and no id is being
        // supplied via params, resolve to the route's COLLECTION form (':id'
        // segment stripped) instead of sending the literal, unresolved token
        // on the wire — see resolveFetchRouteName's own docs for the full
        // guard. This is how `operations.fetch()` (and the hook's own
        // auto-fetch / refetch()) serve the same single registered route
        // that update()/delete() address by id. HIGH: the collection form is
        // now expressed as a `urlOverride` alongside the SAME route name
        // (rather than a bare stripped-URL string standing in for the route
        // name), so dispatch stays THROUGH the registered route — its
        // headers/schema/timeout/dedup are never dropped.
        const routeConfig = context?.config || globalConfig;
        const { routeName: effectiveRouteName, urlOverride } =
          resolveFetchRouteName(route, routeConfig?.routes, requestParams);
        const data = await context.apiClient.request(
          effectiveRouteName,
          undefined,
          requestParams,
          {
            params: requestParams,
            headers: options.headers,
            rawUrl: options.rawUrl,
            ...(urlOverride ? { urlOverride } : {}),
            // B1b: only include `method` when explicitly set, rather than an
            // always-present key whose `undefined` value could shadow the
            // route's declared method through an object spread elsewhere.
            // N1: when resolved to an unregistered raw path (N4's
            // string-shorthand bypass — `effectiveRouteName !== route`),
            // force an explicit GET so that dispatch never relies on
            // ApiClient's bodyless-request inference. The `urlOverride` case
            // dispatches THROUGH the still-registered route, whose own
            // (already-verified-GET) `method` applies naturally.
            ...(options.method
              ? { method: options.method }
              : effectiveRouteName !== route
                ? { method: HttpMethod.GET }
                : {}),
            ...options.axiosConfig
          } // Pass params as axios config for query string
        );
        result = buildMinderResult<TData>({
          data: data as TData, error: null, status: 200, success: true,
          method: HttpMethod.GET, route,
        });
      } catch (error: any) {
        result = buildMinderResult<TData>({
          data: null, error, status: error.status || 500, success: false,
          method: HttpMethod.GET, route,
        });
      }
    } else {
      // Standalone mode — call minder() directly. minder() takes the request body
      // as its SECOND arg and request options as its THIRD; for a query there's no
      // body, so pass `undefined` then the options. It returns a structured
      // MinderResult and never throws by default, so use it as-is (this surfaces
      // real success/error instead of always reporting success). Hook-level
      // `throwOnError` is applied below, so force minder() to return here.
      result = await minder<TData>(route, undefined, {
        ...options,
        params: requestParams,
        throwOnError: false,
      });
    }

    // LOCAL-FIRST: persist a successful network read; on failure (e.g. offline)
    // fall back to the last persisted value so the UI keeps working.
    if (source === 'local-first') {
      const { getDefaultLocalStore } = await loadLocalStore();
      if (result.success) {
        try {
          await getDefaultLocalStore().set(localKey, result.data);
        } catch {
          // Persistence is best-effort; a storage failure must not fail the read.
        }
      } else {
        const fallback = await getDefaultLocalStore().get<TData>(localKey);
        if (fallback !== null) {
          result = buildMinderResult<TData>({
            data: fallback, error: null, status: 200, success: true,
            method: HttpMethod.GET, route, cached: true,
          });
        }
      }
    }

    // Opt-in: surface errors through TanStack Query / error boundaries instead of
    // the structured result object (lets you use try/catch, <ErrorBoundary>, etc.).
    if (options.throwOnError && !result.success && result.error) {
      throw result.error;
    }

    return result;
  };

  // Both query hooks are ALWAYS called so the hook order never depends on
  // `options.infinite` (React Rules of Hooks). The inactive query is disabled
  // (enabled: false) and its queryKey is namespaced with '__inactive' so it can
  // never collide with the active query in the cache. The active query keeps the
  // original `queryKey`, which the rest of the hook uses for invalidation/cancel.
  const isInfinite = !!options.infinite;

  const infiniteQuery = useInfiniteQuery({
    queryKey: isInfinite ? queryKey : [...queryKey, '__inactive'],
    queryFn: ({ pageParam }) => createQueryFn(pageParam)(),
    enabled: isQueryEnabled && isInfinite,
    staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
    gcTime: options.gcTime || 10 * 60 * 1000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? true,
    refetchInterval: options.refetchInterval || false,
    retry: retryConfig.retry,
    retryDelay: retryConfig.retryDelay,
    throwOnError: options.throwOnError ?? false,
    getNextPageParam: options.getNextPageParam,
    getPreviousPageParam: options.getPreviousPageParam,
    initialPageParam: options.initialPageParam,
    ...options.queryOptions,
  } as UseInfiniteQueryOptions<MinderResult<TData>>);

  const regularQuery = useQuery({
    queryKey: isInfinite ? [...queryKey, '__inactive'] : queryKey,
    queryFn: createQueryFn(),
    enabled: isQueryEnabled && !isInfinite,
    staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
    gcTime: options.gcTime || 10 * 60 * 1000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? true,
    refetchInterval: options.refetchInterval || false,
    retry: retryConfig.retry,
    retryDelay: retryConfig.retryDelay,
    throwOnError: options.throwOnError ?? false,
    ...options.queryOptions,
  });

  // Select the active query result after both hooks have run.
  const query = isInfinite ? infiniteQuery : regularQuery;

  // =========================================================================
  // MUTATION (for POST/PUT/DELETE requests)
  // =========================================================================

  const mutation = useMutation<MinderResult<TData>, any, any>({
    mutationFn: async (variables: any): Promise<MinderResult<TData>> => {
      // Unwrap our internal `{ __minder_wrapper }` envelope (if present) and
      // merge its per-call params/headers/axiosConfig with the hook options.
      const { data, runtimeOptions } = unwrapMutationVariables(variables);
      const { mergedParams, mergedHeaders, mergedAxiosConfig, mergedMethod } =
        mergeMutationRuntimeOptions(options, runtimeOptions);
      // `mutationMethod` is for RESULT METADATA only (buildMinderResult below)
      // — it must never leak into the actual request config as an
      // always-present key, or it silently forces every mutation to this
      // value and defeats route-declared method resolution (B1). The request
      // configs further down use `mergedMethod` (undefined unless the caller
      // explicitly set one via hook options or `mutate(data, { method })`).
      const mutationMethod = mergedMethod || HttpMethod.POST;

      // Check if request was cancelled
      if (cancelledRef.current) {
        throw new Error('Request cancelled');
      }

      // Re-validate route with dynamic params
      const config = context?.config || globalConfig;
      validateMutationRoute(route, config, mergedParams, routeValidation);

      // Validate data
      let validatedData = data;
      if (options.validate) {
        try {
          validatedData = await options.validate(data);
        } catch (validationError: any) {
          return buildMinderResult<TData>({
            data: null, error: validationError, status: 400, success: false,
            method: mutationMethod, route,
          });
        }
      }

      let result: MinderResult<TData>;

      if (context?.apiClient) {
        try {
          const responseData = await context.apiClient.request(
            route,
            validatedData,
            mergedParams,
            {
              params: mergedParams,
              headers: mergedHeaders,
              rawUrl: options.rawUrl,
              // B1a/B1b/B1c: only include `method` when the caller explicitly
              // set one (hook-level `options.method` or a per-call
              // `mutate(data, { method })`); ApiClient falls back to the
              // route's declared method when this key is absent.
              ...(mergedMethod ? { method: mergedMethod } : {}),
              ...mergedAxiosConfig
            }
          );
          result = buildMinderResult<TData>({
            data: responseData as TData, error: null, status: 200, success: true,
            method: mutationMethod, route,
          });
        } catch (error: any) {
          result = buildMinderResult<TData>({
            data: null, error, status: error.status || 500, success: false,
            method: mutationMethod, route,
          });
        }
      } else {
        // Standalone
        try {
          // B1d-standalone mirror: previously this always sent
          // `method: mutationMethod` (defaulting to POST), which permanently
          // shadowed `options.method` from `...options` above AND prevented
          // minder()'s own registry-based verb resolution
          // (`if (registryRoute && !options?.method) method = registryRoute.method`
          // in src/core/minder.ts) from ever firing for declared PUT/PATCH/DELETE
          // routes. Now `method` is included only when explicitly resolved via
          // hook options or a per-call `mutate(data, { method })` override.
          //
          // C1: minder() never throws by default (throwOnError forced false
          // below) and already returns a FULLY FORMED MinderResult — including
          // `success:false` + `error` on a real transport failure (e.g. a dead
          // port). This branch previously discarded that shape entirely:
          // it always built `{ success: true, data: <the inner MinderResult> }`
          // regardless of whether the inner call actually failed — reporting
          // success on failure AND double-wrapping the result (`result.data`
          // was itself a MinderResult), which also violates the shipped
          // `mutate(): Promise<MinderResult<TData>>` contract. Propagate the
          // inner result's own success/data/error/status instead, mirroring
          // the already-correct standalone query path above (createQueryFn).
          const innerResult = await minder<TData>(route, validatedData, {
            ...options,
            params: mergedParams,
            headers: mergedHeaders,
            ...(mergedMethod ? { method: mergedMethod } : {}),
            ...mergedAxiosConfig,
            throwOnError: false,
          });
          result = buildMinderResult<TData>({
            data: innerResult.data,
            error: innerResult.error,
            status: innerResult.status,
            success: innerResult.success,
            method: mutationMethod,
            route,
          });
        } catch (error: any) {
          result = buildMinderResult<TData>({
            data: null, error, status: error.status || 500, success: false,
            method: mutationMethod, route,
          });
        }
        // Opt-in: surface the failure through TanStack's mutation error state
        // (try/catch, onError, throwOnError consumers) instead of only the
        // structured result — same precedence as the query path above.
        if (options.throwOnError && !result.success && result.error) {
          throw result.error;
        }
      }
      return result;
    },
    onSuccess: (result) => {
      // Only invalidate if successful
      if (result.success) {
        queryClient.invalidateQueries({ queryKey });

        // Call user's success callback
        if (options.onSuccess) {
          options.onSuccess(result.data);
        }
      }
    },
    onError: (error: any) => {
      // Call user's error callback
      if (options.onError) {
        options.onError(error);
      }
    },
    ...options.mutationOptions,
  });

  // =========================================================================
  // HELPERS
  // =========================================================================

  // Stable across renders: only re-created when queryClient/queryKey change.
  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    setIsCancelled(true);
    await queryClient.cancelQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Reads the live query via the ref so its identity never changes, even though
  // the underlying TanStack query object is re-created on every state change.
  const refetchData = useCallback(async (): Promise<MinderResult<TData>> => {
    // Reset cancellation state
    cancelledRef.current = false;
    setIsCancelled(false);
    const result = await tanstackRef.current.query.refetch();
    return result.data as MinderResult<TData>;
  }, []);

  const mutateData = useCallback(async (data?: any, options?: { params?: Record<string, any>, headers?: Record<string, string>, axiosConfig?: Record<string, any>, method?: MutationHttpMethod }): Promise<MinderResult<TData>> => {
    if (options) {
      return tanstackRef.current.mutation.mutateAsync({ __minder_wrapper: true, data, options });
    }
    return tanstackRef.current.mutation.mutateAsync(data);
  }, []);

  // =========================================================================
  // CRUD OPERATIONS (when within MinderDataProvider)
  // =========================================================================

  // CRUD mutations are ALWAYS created (React Rules of Hooks) — never gated on
  // context. When there is no provider context the mutationFn throws a
  // MinderError. `operations` itself is still only exposed when the context is
  // present (see below), preserving the pre-existing no-context contract where
  // `operations` is `undefined`.
  const createMutation = useMutation({
    mutationFn: async ({ item, params }: {
      item: Partial<TData>;
      params?: Record<string, any>
    }) => {
      if (!context?.apiClient) {
        throw new MinderError('CRUD operations require MinderDataProvider context', 'CONTEXT_REQUIRED', 500);
      }
      // Validate before create
      let validatedItem = item;
      if (options.validate) {
        validatedItem = await options.validate(item as TData);
      }
      // B1d: `route` resolves to the GET base route by default — redirect to
      // the generated `create${Cap}` sibling (or force POST on the base route
      // when no sibling exists), never touching an already-explicit non-GET
      // route. See resolveCrudOperationRoute for the full guard. N1: `params`
      // is threaded through too — a route whose URL still carries an
      // unresolved terminal ':id' PATH placeholder resolves to its
      // COLLECTION form (Golden Path) unless the caller explicitly supplied
      // `params.id`. HIGH: that collection form now arrives as `urlOverride`
      // — dispatch stays THROUGH the registered `routeName` (its own
      // headers/schema/timeout/dedup intact), only the URL is swapped.
      const { routeName, method, urlOverride } = resolveCrudOperationRoute(
        route, 'create', (context?.config || globalConfig)?.routes, params
      );
      // ✅ Pass params to request for dynamic URL replacement
      return context.apiClient.request(routeName, validatedItem, params, {
        ...(method ? { method } : {}),
        ...(urlOverride ? { urlOverride } : {}),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    // fix-a-crud-silent-success (HIGH 5): `retry: false` here is INDEPENDENT
    // of (and just as load-bearing as) ApiClient's own axios-interceptor
    // idempotent-only retry gate (apiClient/idempotency.ts). This mutationFn
    // THROWS on failure (the `context.apiClient.request(...)` rejection
    // propagates uncaught) — TanStack Query's OWN `useMutation` retry engine
    // (a SEPARATE mechanism from the axios interceptor, driven by
    // `MinderDataProvider`'s QueryClient default `mutations.retry:
    // config.performance?.retries ?? 1` — see getQueryClientConfig,
    // MinderDataProvider.tsx) then re-invokes this ENTIRE mutationFn again on
    // a retryable failure, dispatching a SECOND real POST regardless of what
    // the axios layer decided. Confirmed on a real server: with the axios
    // layer's own retry correctly refusing to resubmit POST, the server
    // STILL received the create() body twice, from this second, independent
    // retry layer. `create()` always resolves through
    // `resolveCrudOperationRoute`'s `CRUD_METHOD_BY_ACTION.create` — always
    // POST, never conditionally idempotent — so refusing retry here
    // unconditionally is correct. update()/delete() are deliberately left at
    // the QueryClient default: PUT/DELETE are idempotent, so either retry
    // layer resubmitting them is safe.
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, item, params }: {
      id: string | number;
      item: Partial<TData>;
      params?: Record<string, any>
    }) => {
      // C5: validate the id VALUE (not just the route shape) before anything
      // else — before the context check, before route resolution, before any
      // data validation — so a hostile id (empty, null, undefined, NaN,
      // whitespace-only, or containing a path separator/traversal sequence)
      // is refused with zero requests ever reaching the wire. See
      // assertValidResourceId's own docs for the exact inputs this refuses.
      assertValidResourceId('update', id);
      if (!context?.apiClient) {
        throw new MinderError('CRUD operations require MinderDataProvider context', 'CONTEXT_REQUIRED', 500);
      }
      // Validate before update
      let validatedItem = item;
      if (options.validate) {
        validatedItem = await options.validate(item as TData);
      }
      // B1d: see createMutation above.
      const { routeName, method } = resolveCrudOperationRoute(
        route, 'update', (context?.config || globalConfig)?.routes
      );
      // ✅ Merge id with params for URL replacement
      return context.apiClient.request(routeName, validatedItem, { ...params, id }, method ? { method } : undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, params }: {
      id: string | number;
      params?: Record<string, any>
    }) => {
      // C5: see the identical guard in updateMutation above — validate the
      // id VALUE first, before the context check or route resolution, so a
      // hostile id never reaches the wire.
      assertValidResourceId('delete', id);
      if (!context?.apiClient) {
        throw new MinderError('CRUD operations require MinderDataProvider context', 'CONTEXT_REQUIRED', 500);
      }
      // B1d: see createMutation above.
      const { routeName, method } = resolveCrudOperationRoute(
        route, 'delete', (context?.config || globalConfig)?.routes
      );
      // ✅ Merge id with params for URL replacement
      return context.apiClient.request(routeName, undefined, { ...params, id }, method ? { method } : undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // Point the ref at the live TanStack instances every render, so the stable
  // callbacks (refetch / mutate above, CRUD operations below) always operate on
  // the current objects without depending on their per-state-change identity.
  tanstackRef.current.query = query;
  tanstackRef.current.mutation = mutation;
  tanstackRef.current.createMutation = createMutation;
  tanstackRef.current.updateMutation = updateMutation;
  tanstackRef.current.deleteMutation = deleteMutation;

  // Each CRUD operation is a stable callback (reads the live mutation/query via
  // the ref), so the `operations` container only changes identity when the
  // provider context flips — not on every render or mutation state change.
  const operationCreate = useCallback(
    (item: Partial<TData>, opts?: { params?: Record<string, any> }) =>
      tanstackRef.current.createMutation.mutateAsync({ item, params: opts?.params }),
    []
  );
  const operationUpdate = useCallback(
    (id: string | number, item: Partial<TData>, opts?: { params?: Record<string, any> }) =>
      tanstackRef.current.updateMutation.mutateAsync({ id, item, params: opts?.params }),
    []
  );
  const operationDelete = useCallback(
    (id: string | number, opts?: { params?: Record<string, any> }) =>
      tanstackRef.current.deleteMutation.mutateAsync({ id, params: opts?.params }),
    []
  );
  const operationFetch = useCallback(async (_opts?: { params?: Record<string, any> }) => {
    const result = await tanstackRef.current.query.refetch();
    return (result.data?.data || []) as TData[];
  }, []);
  const operationRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);
  const operationClear = useCallback(() => {
    context?.cacheManager?.clearCache(route);
  }, [context, route]);

  // `operations` is only exposed with a provider context (preserving the
  // no-context contract where it is `undefined`), and is memoized so its
  // identity is stable across renders.
  const crudOperations = useMemo<UseMinderReturn<TData>['operations']>(() => {
    if (!(context?.apiClient && context?.cacheManager)) {
      return undefined;
    }
    return {
      // ✅ Accept params option in all CRUD operations
      create: operationCreate,
      update: operationUpdate,
      delete: operationDelete,
      fetch: operationFetch,
      refresh: operationRefresh,
      clear: operationClear,
    };
  }, [context, operationCreate, operationUpdate, operationDelete, operationFetch, operationRefresh, operationClear]);

  // =========================================================================
  // AUTHENTICATION (integrated from useAuth)
  // 🆕 Now uses GlobalAuthManager as fallback when no provider context
  // =========================================================================

  const authMethods = useMemo(() => ({
    // N2 (fix-2.2.0-blockers, adversarial re-probe — not fully closed): this
    // was `async (token) => { await ...setToken(token) }`. Both
    // `context.authManager.setToken` (sync, throws synchronously on a bad
    // token — see AuthManager.ts) and `globalAuthManager.setToken` (returns
    // a Promise, but ALSO throws synchronously before ever constructing that
    // promise — see GlobalAuthManager.ts's own N2 fix) validate BEFORE any
    // async work specifically so a bad token throws for real, synchronously,
    // into the immediate caller — README's Security Model promises
    // `setToken()` "throws instead of storing" a bad value. Wrapping the call
    // in `async` here defeated that: an `async` function auto-wraps EVERY
    // throw inside its body (including one from an awaited synchronous
    // throw) into a REJECTED PROMISE, so `try { auth.setToken(bad) } catch`
    // (the natural, synchronous-looking call site) never saw a catchable
    // throw — it became an unhandled rejection instead. This plain
    // (non-`async`) function preserves the synchronous throw for both
    // branches: `context.authManager.setToken` runs (and can throw) before
    // any promise is ever constructed, and `globalAuthManager.setToken`'s own
    // synchronous validation runs before it returns its promise. The valid-
    // token path is unchanged: `Promise.resolve()` / the manager's own
    // promise, so `await auth.setToken(good)` still works exactly as before.
    setToken: (token: string): Promise<void> => {
      if (context?.authManager) {
        context.authManager.setToken(token);
        return Promise.resolve();
      }
      // Use global auth manager as fallback
      return globalAuthManager.setToken(token);
    },
    getToken: () => {
      if (context?.authManager) {
        return context.authManager.getToken();
      }
      // Use global auth manager as fallback
      return globalAuthManager.getToken();
    },
    clearAuth: async () => {
      if (context?.authManager) {
        await context.authManager.clearAuth();
      } else {
        // Use global auth manager as fallback
        await globalAuthManager.clearAuth();
      }
    },
    isAuthenticated: () => {
      if (context?.authManager) {
        return context.authManager.isAuthenticated();
      }
      // Use global auth manager as fallback
      return globalAuthManager.isAuthenticated();
    },
    setRefreshToken: async (token: string) => {
      if (context?.authManager) {
        await context.authManager.setRefreshToken(token);
      } else {
        // Use global auth manager as fallback
        await globalAuthManager.setRefreshToken(token);
      }
    },
    getRefreshToken: () => {
      if (context?.authManager) {
        return context.authManager.getRefreshToken();
      }
      // Use global auth manager as fallback
      return globalAuthManager.getRefreshToken();
    },
    getCurrentUser: () => {
      if (context?.authManager) {
        const token = context.authManager.getToken();
        return token ? decodeJwt(token) : null;
      }
      // Use global auth manager as fallback
      return globalAuthManager.getCurrentUser();
    },
  }), [context]);

  // =========================================================================
  // CACHE CONTROL (integrated from useCache)
  // =========================================================================

  const cacheMethods = useMemo(() => ({
    invalidate: async (keys?: string | string[]) => {
      if (context?.cacheManager) {
        await context.cacheManager.invalidateQueries(keys);
      } else {
        // Fallback to React Query
        if (keys) {
          await queryClient.invalidateQueries({ queryKey: Array.isArray(keys) ? keys : [keys] });
        } else {
          await queryClient.invalidateQueries({ queryKey });
        }
      }
    },
    prefetch: async (queryFn: () => Promise<any>, opts?: any) => {
      if (context?.cacheManager) {
        await context.cacheManager.prefetchQuery(queryKey, queryFn, opts);
      } else {
        await queryClient.prefetchQuery({ queryKey, queryFn, ...opts });
      }
    },
    clear: (key?: string | string[]) => {
      if (context?.cacheManager) {
        context.cacheManager.clearCache(key);
      } else {
        queryClient.removeQueries({ queryKey: key ? (Array.isArray(key) ? key : [key]) : queryKey });
      }
    },
    getStats: () => {
      if (context?.cacheManager) {
        return context.cacheManager.getAllCachedQueries();
      }
      return queryClient.getQueryCache().getAll();
    },
    isQueryFresh: (key: string | string[]) => {
      if (context?.cacheManager) {
        return context.cacheManager.isQueryFresh(key);
      }
      const queryState = queryClient.getQueryState(Array.isArray(key) ? key : [key]);
      return queryState?.isInvalidated === false;
    },
  }), [context, queryClient, queryKey]);

  // =========================================================================
  // WEBSOCKET (integrated from useWebSocket)
  // =========================================================================

  const websocketMethods = useMemo(() => {
    // Route through the transport-neutral `realtimeManager`, which is set for
    // BOTH transports (it aliases `websocketManager` under transport:'ws' and
    // holds the lazy SseTransport under transport:'sse'). Falling back to
    // `websocketManager` keeps this identical for WS while making SSE reachable
    // from the public hook — otherwise apps on transport:'sse' can never open
    // the stream and the resync glue never fires (5.2 §4.6/§4.8).
    const rt = context?.realtimeManager ?? context?.websocketManager;
    return {
      // HIGH (fix-2.2.0-blockers, adversarial re-probe — N3 not fully
      // closed): `rt.connect()` returns a Promise that can reject (dead
      // port, network blip, ...) and this call site discards it entirely.
      // WebSocketManager's OWN `connect()` already self-guards its returned
      // promise with a silent `.catch()` (see its N3 comment), so `rt` being
      // a WebSocketManager was already safe — but `rt` can also be an
      // SseTransport/LazySseTransport (transport:'sse'), which does not
      // carry that same internal guard. A rejection with zero attached
      // handlers is an unhandled promise rejection — fatal to a Node-hosted
      // consumer and an "Uncaught (in promise)" in browsers. `.catch()` here
      // is a silent no-op (it does not swallow anything for a caller that
      // awaits/`.catch()`s a DIRECTLY-held reference to `rt.connect()`
      // itself, e.g. via `useMinderContext().realtimeManager.connect()` —
      // every handler attached to a promise fires independently); real
      // connection failures still surface through `subscribe()`/`onError`
      // callbacks and `isConnected()`.
      connect: () => {
        rt?.connect()?.catch(() => { /* see comment above */ });
      },
      disconnect: () => {
        rt?.disconnect();
      },
      send: (type: string, data: any) => {
        // SSE is receive-only: `send` is optional on RealtimeTransport and
        // no-ops with a warn on SseTransport (§4.7).
        rt?.send?.(type, data);
      },
      subscribe: (event: string, callback: (data: any) => void) => {
        // ✅ Return unsubscribe function for cleanup
        const unsubscribe = rt?.subscribe(event, callback);
        return unsubscribe || (() => { }); // Return noop if no manager
      },
      isConnected: () => {
        return rt?.isConnected() || false;
      },
    };
  }, [context]);

  // =========================================================================
  // FILE UPLOAD (integrated from useMediaUpload)
  // 🆕 Now uses shared upload progress store
  // =========================================================================

  // Upload progress is kept in a REF, not state, so a progress event NEVER
  // triggers a re-render of this hook instance (or any sibling) and NEVER
  // changes the identity of the `upload` object or the container. Consumers read
  // `upload.progress` / `upload.isUploading` through getters that return the
  // live ref value, so reads stay fresh without an identity change.
  const uploadProgressRef = useRef<UploadProgress>({ loaded: 0, total: 0, percentage: 0 });

  useEffect(() => {
    const unsubscribe = subscribeToUploadProgress(uploadIdRef.current, (progress) => {
      // Ref update only — no setState — so progress ticks don't re-render.
      uploadProgressRef.current = progress;
    });
    return unsubscribe;
  }, []);

  // `upload` identity depends only on [context, route] — never on progress — so
  // it stays Object.is-stable across the many progress events of an upload.
  const uploadMethods = useMemo(() => {
    const uploadFile = async (file: File, customUploadId?: string) => {
      const uploadId = customUploadId || uploadIdRef.current;

      if (context?.apiClient) {
        return context.apiClient.uploadFile(route, file, (progress: UploadProgress) => {
          // Keep the local getter fresh and fan the tick out to other instances'
          // subscriptions (which also only update their refs — no re-render).
          uploadProgressRef.current = progress;
          setGlobalUploadProgress(uploadId, progress);
        });
      }
      throw new Error('Upload requires MinderDataProvider context');
    };
    const uploadMultiple = async (files: File[]) => {
      const results = [];
      for (const file of files) {
        results.push(await uploadFile(file));
      }
      return results;
    };
    return {
      uploadFile,
      uploadMultiple,
      // Getters read the ref, so the object identity is decoupled from progress
      // while `upload.progress` / `upload.isUploading` still yield fresh values.
      get progress(): UploadProgress {
        return uploadProgressRef.current;
      },
      get isUploading(): boolean {
        const p = uploadProgressRef.current;
        return p.percentage > 0 && p.percentage < 100;
      },
    };
    // uploadIdRef / setGlobalUploadProgress are stable; progress is read via ref.
  }, [context, route]);

  // =========================================================================
  // RETURN
  // =========================================================================

  // Extract data from MinderResult. Pulled into primitive locals so the
  // container memo below depends on the VALUES, not just query/mutation object
  // identity.
  const resultData = query.data?.data ?? null;
  const resultError = query.data?.error ?? mutation.data?.error ?? null;
  const resultSuccess = query.data?.success ?? mutation.data?.success ?? false;
  const queryIsLoading = query.isLoading;
  const queryIsFetching = query.isFetching;
  const queryIsStale = query.isStale;
  const mutationIsPending = mutation.isPending;
  const isInfiniteReturn = !!options.infinite;

  // Invalid-route RESULT, memoized on the route/validation identity so its
  // object identity stays stable across renders while the route is invalid.
  // Both this and the valid container below are computed UNCONDITIONALLY every
  // render (all hooks have already run in stable order); the conditional only
  // SELECTS which one to return, so the hook count never changes between
  // renders (react-hooks/rules-of-hooks safe). The shape mirrors the documented
  // invalid-route contract exactly.
  const invalidRouteResult = useMemo<UseMinderReturn<TData>>(
    () => buildInvalidRouteResult<TData>(routeValidation, route),
    [routeValidation, route]
  );

  // Valid-route container. Its identity only changes when meaningful data/state
  // changes — the callbacks and sub-objects are all stable, so re-renders with
  // unchanged data return the SAME object. `query`/`mutation` are intentional
  // deps: TanStack re-creates them on every state transition, which is exactly
  // when the container SHOULD change (e.g. data arriving).
  const validResult = useMemo<UseMinderReturn<TData>>(() => ({
    // Data & states
    data: resultData,
    items: resultData,  // Alias for collections
    loading: queryIsLoading || mutationIsPending,
    error: resultError,
    success: resultSuccess,

    // Operations
    refetch: refetchData,
    mutate: mutateData,
    operations: crudOperations,
    invalidate,
    cancel,

    // 🔥 NEW: Integrated features
    auth: authMethods,
    cache: cacheMethods,
    websocket: websocketMethods,
    upload: uploadMethods,

    // TanStack Query states
    isFetching: queryIsFetching,
    isStale: queryIsStale,
    isMutating: mutationIsPending,

    // 🆕 Cancellation state
    isCancelled: cancelledRef.current || isCancelled,

    // 🆕 Infinite query methods (only if infinite mode enabled)
    ...(isInfiniteReturn ? {
      fetchNextPage: (query as any).fetchNextPage,
      hasNextPage: (query as any).hasNextPage,
      isFetchingNextPage: (query as any).isFetchingNextPage,
      fetchPreviousPage: (query as any).fetchPreviousPage,
      hasPreviousPage: (query as any).hasPreviousPage,
      isFetchingPreviousPage: (query as any).isFetchingPreviousPage,
    } : {}),

    // Raw objects for advanced use
    query,
    mutation,
  }), [
    resultData,
    resultError,
    resultSuccess,
    queryIsLoading,
    queryIsFetching,
    queryIsStale,
    mutationIsPending,
    refetchData,
    mutateData,
    crudOperations,
    invalidate,
    cancel,
    authMethods,
    cacheMethods,
    websocketMethods,
    uploadMethods,
    isCancelled,
    isInfiniteReturn,
    query,
    mutation,
  ]);

  // Selection only — no hooks below this point.
  if (!routeValidation.valid) {
    return invalidRouteResult;
  }

  return validResult;
}

/**
 * Export as default for convenience
 */
export default useMinder;
