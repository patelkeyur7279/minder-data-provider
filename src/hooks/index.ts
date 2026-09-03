"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { QueryClient } from '@tanstack/query-core';
import { parseJWT as decodeJwt } from '../utils/jwt.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMinderContext, useMinderContextSafe } from '../core/MinderContext.js';
import type { CrudOperations, UploadProgress, MediaUploadResult } from '../core/types.js';
import { CacheManager } from '../core/CacheManager.js';
import type { AuthManager } from '../core/AuthManager.js';
import { globalAuthManager } from '../auth/GlobalAuthManager.js';
import type { GlobalAuthManager } from '../auth/GlobalAuthManager.js';
// fix-a-crud-silent-success (BLOCKER 1): `resolveCrudOperationRoute` and
// `assertValidResourceId` are the SAME choke-point helpers `useMinder.ts`'s
// (non-deprecated) create/update/delete mutations already go through — see
// their use below for why this deprecated sibling hook needs the identical
// fix.
import { resolveCrudOperationRoute, assertValidResourceId } from './useMinder.helpers.js';

// Main hook for CRUD operations
/**
 * @deprecated Use useMinder instead - it now provides all CRUD operations
 * Hook for CRUD operations with automatic or manual data fetching
 * Supports parameter replacement for dynamic routes like :id
 * @param routeName - The route name for API endpoint
 * @param options - Configuration options for the hook
 * @returns CrudOperations object with data, loading states, errors and operations
 * 
 * @example
 * // ✅ RECOMMENDED: Use useMinder instead
 * const { items, operations } = useMinder('posts');
 * 
 * // ❌ DEPRECATED: This still works but useMinder is better
 * const { data, operations } = useOneTouchCrud('posts');
 */
export function useOneTouchCrud<T = any>(
  routeName: string,
  options: {
    /**
     * If true, data will be fetched automatically when component mounts
     * If false, you need to call operations.fetch() manually
     */
    autoFetch?: boolean;
    /**
     * Parameters for initial fetch (supports :id replacement)
     */
    params?: Record<string, any>;
    /**
     * Enable/disable automatic background refetching
     */
    enableAutoRefetch?: boolean;
    /**
     * Cache time in milliseconds
     */
    cacheTime?: number;
  } = {}
): CrudOperations<T> {
  const { apiClient, cacheManager, config } = useMinderContext();
  const queryClient = useQueryClient();

  // Fetch data with configurable options
  const {
    data = [],
    isLoading: fetchLoading,
    error: fetchError,
    refetch
  } = useQuery({
    queryKey: [routeName, options.params], // Include params in cache key
    queryFn: () => apiClient.request<T[]>(routeName, undefined, options.params), // Pass params for :id replacement
    enabled: options.autoFetch !== false, // Only fetch if autoFetch is not explicitly false
    staleTime: options.cacheTime || 0,
    refetchOnWindowFocus: options.enableAutoRefetch,
    refetchOnReconnect: options.enableAutoRefetch,
  });

  // Create mutation.
  //
  // fix-a-crud-silent-success (BLOCKER 1): this used to be
  // `apiClient.request<T>(routeName, item)` — no method override — which
  // resolves through `resolveRequest`'s declared-method fallback: with no
  // override, dispatch falls back to the REGISTERED route's OWN declared
  // method, and a base collection route (e.g. `{ items: { url: '/items',
  // method: 'GET' } }`, the normal shape for a single route reused by
  // fetch/create/update/delete) declares GET. create() therefore dispatched
  // as a GET — hitting the SAME GET handler the initial list fetch used —
  // never a POST, while still resolving successfully with that GET
  // response's body standing in for "the created item". `resolveCrudOperationRoute`
  // (the exact function `useMinder.ts`'s own create mutation already uses)
  // redirects to a registered `create<Singular>` sibling route when one
  // exists, or otherwise forces the POST method explicitly on the base
  // route — so a resolved promise here now always means a real POST reached
  // the server.
  const createMutation = useMutation({
    mutationFn: (item: Partial<T>) => {
      const { routeName: resolvedRouteName, method, urlOverride } = resolveCrudOperationRoute(
        routeName, 'create', config?.routes
      );
      return apiClient.request<T>(resolvedRouteName, item, undefined, {
        ...(method ? { method } : {}),
        ...(urlOverride ? { urlOverride } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
    // fix-a-crud-silent-success (HIGH 5): see the identical `retry: false` +
    // full rationale on useMinder.ts's own createMutation. This mutationFn
    // throws on failure, so TanStack Query's OWN mutation-retry engine (a
    // SEPARATE mechanism from ApiClient's axios-interceptor idempotent-only
    // gate) would otherwise re-invoke this whole function — including a
    // fresh `apiClient.request()` call — and silently resubmit the POST a
    // second time regardless of what the axios layer decided.
    retry: false,
  });

  // Update mutation. BLOCKER 1 (see createMutation above): same declared-
  // method-fallback defect — an unadorned `apiClient.request(routeName, item,
  // { id })` dispatched through the base route's declared GET instead of
  // PUT. Also validates the id VALUE first (assertValidResourceId), matching
  // useMinder.ts's own updateMutation, so a hostile id never reaches the wire.
  const updateMutation = useMutation({
    mutationFn: ({ id, item }: { id: string | number; item: Partial<T> }) => {
      assertValidResourceId('update', id);
      const { routeName: resolvedRouteName, method } = resolveCrudOperationRoute(
        routeName, 'update', config?.routes
      );
      return apiClient.request<T>(resolvedRouteName, item, { id }, method ? { method } : undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
  });

  // Delete mutation. BLOCKER 1 (see createMutation above): same fix.
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => {
      assertValidResourceId('delete', id);
      const { routeName: resolvedRouteName, method } = resolveCrudOperationRoute(
        routeName, 'delete', config?.routes
      );
      return apiClient.request(resolvedRouteName, undefined, { id }, method ? { method } : undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
  });

  const operations = {
    // Manual fetch function that uses refetch from useQuery.
    //
    // fix-a-crud-silent-success (BLOCKER 2): this used to be
    // `return (result.data || []) as T[]` unconditionally — on a genuine
    // server failure (e.g. a real 5xx), TanStack Query's `refetch()` settles
    // with `data: undefined` (no prior successful fetch to fall back to) and
    // `isError: true`, so the old code silently coerced that into an empty
    // array and RESOLVED as if the fetch had simply found nothing. The
    // destructured `fetchError` above is a snapshot from the PREVIOUS render
    // and is not guaranteed to reflect this refetch by the time this promise
    // settles, so a caller awaiting `fetch()` had no way to observe the
    // failure at all. `refetch()`'s own OWN returned result carries
    // `isError`/`error` synchronously and accurately — checking THAT (not the
    // stale closure variable) and rethrowing is what makes a resolved promise
    // here actually mean "the fetch succeeded".
    fetch: useCallback(async () => {
      const result = await refetch();
      if (result.isError) {
        throw result.error ?? new Error(`useOneTouchCrud('${routeName}').operations.fetch() failed`);
      }
      return (result.data || []) as T[];  // ✅ Return T[] instead of T
    }, [refetch, routeName]),
    // Create new item
    create: useCallback((item: Partial<T>) => createMutation.mutateAsync(item), [createMutation]),
    // Update existing item
    update: useCallback(
      (id: string | number, item: Partial<T>) => updateMutation.mutateAsync({ id, item }),
      [updateMutation]
    ),
    // Delete item
    delete: useCallback((id: string | number) => deleteMutation.mutateAsync(id), [deleteMutation]),
    // Force refresh data
    refresh: useCallback(() => queryClient.invalidateQueries({ queryKey: [routeName] }), [queryClient, routeName]),
    // Clear cached data
    clear: useCallback(() => cacheManager.clearCache(routeName), [cacheManager, routeName]),
  };

  return {
    data: (data || []) as T[],  // ✅ Return T[] instead of T, with fallback to empty array
    loading: {
      fetch: fetchLoading,
      create: createMutation.isPending,
      update: updateMutation.isPending,
      delete: deleteMutation.isPending,
    },
    errors: {
      current: fetchError || createMutation.error || updateMutation.error || deleteMutation.error || null,
      hasError: !!(fetchError || createMutation.error || updateMutation.error || deleteMutation.error),
      message: (fetchError || createMutation.error || updateMutation.error || deleteMutation.error)?.message || '',
    },
    operations,
  };
}

/**
 * B3 helper: `AuthManager` (provider-backed) exposes `subscribe(listener)`;
 * `GlobalAuthManager` (the standalone fallback) does not. Returns a bound
 * `subscribe` function when the manager supports it, `undefined` otherwise —
 * lets callers degrade gracefully instead of crashing on a missing method.
 */
function getAuthChangeSubscriber(
  manager: AuthManager | GlobalAuthManager
): ((listener: () => void) => () => void) | undefined {
  const maybeSubscribable = manager as unknown as {
    subscribe?: (listener: () => void) => () => void;
  };
  return typeof maybeSubscribable.subscribe === 'function'
    ? maybeSubscribable.subscribe.bind(manager)
    : undefined;
}

/**
 * Client-side token-storage hook (raw JWT/opaque token persistence + auth-state
 * subscription via `AuthManager`).
 *
 * This is NOT the capability-contract `useAuth` exported from `src/hooks/contracts.ts`
 * (root, `/web`, `/nextjs`, `/electron`, and — as of 2.2.0 — every subpath, including
 * `/auth`, `/native`, `/expo`). That hook models a session backed by a registered
 * certified provider (`{ ready, error, session, signOut, getProviderClient }`) and
 * shares no keys with this one. `useAuthToken` was previously exported under the name
 * `useAuth` on the `/auth`, `/native`, and `/expo` subpaths; that collision is why the
 * rename happened — see CHANGELOG.md and docs/MIGRATION_GUIDE.md (2.2.0-beta.2 → 2.2.0).
 *
 * @returns Token-store state and operations: `isLoggedIn`, `setToken`, `getToken`,
 * `clearAuth`, `isAuthenticated`, `setRefreshToken`, `getRefreshToken`.
 */
export function useAuthToken() {
  // B3 (fix-2.2.0-blockers): was `useMinderContext()` — the THROWING accessor —
  // so this hook raised "useMinderContext must be used within
  // MinderDataProvider" even though the docs (llms.txt, docs/USAGE_GUIDE.md)
  // promise no provider is required. Swapped for the non-throwing
  // `useMinderContextSafe()` with a `globalAuthManager` fallback, mirroring
  // the pattern `useMinder.ts` already uses for its integrated `authMethods`
  // (useMinder.ts ~1079-1133).
  const context = useMinderContextSafe();
  const authManager = context?.authManager ?? globalAuthManager;
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Initial check
    setIsLoggedIn(authManager.isAuthenticated());

    // Subscribe to changes. Only the provider-backed `AuthManager` exposes a
    // subscription; the standalone `globalAuthManager` fallback does not, so
    // this degrades gracefully to a one-shot check outside a provider rather
    // than reacting to changes made by another hook instance.
    const subscribe = getAuthChangeSubscriber(authManager);
    if (!subscribe) {
      return undefined;
    }
    const unsubscribe = subscribe(() => {
      setIsLoggedIn(authManager.isAuthenticated());
    });

    return () => {
      unsubscribe();
    };
  }, [authManager]);

  return {
    isLoggedIn, // ✅ Safe for hydration (false initially, updates after mount)
    setToken: (token: string) => {
      authManager.setToken(token);
      setIsLoggedIn(true);
    },
    getToken: () => authManager.getToken(),
    clearAuth: () => {
      authManager.clearAuth();
      setIsLoggedIn(false);
    },
    isAuthenticated: () => authManager.isAuthenticated(), // ⚠️ Warning: unsafe for hydration if called in render
    setRefreshToken: (token: string) => authManager.setRefreshToken(token),
    getRefreshToken: () => authManager.getRefreshToken(),
  };
}

/**
 * B3 fallback (fix-2.2.0-blockers): `useCache()` previously threw outside
 * `<MinderDataProvider>` via the throwing `useMinderContext()`. Unlike auth
 * (`globalAuthManager`), there is no cross-entry singleton `CacheManager` in
 * this codebase to fall back to, so — created lazily on first ACTUAL use,
 * never at import, consistent with this package's `sideEffects: false`
 * convention (see src/core/singletons.ts) — this module constructs its OWN
 * standalone `CacheManager` backed by a fresh `QueryClient`. It is
 * process-local to this module and does not share cache state with a
 * `<MinderDataProvider>` mounted elsewhere in the tree; that is an inherent
 * property of standalone mode, not a bug — mount a provider if you need one
 * shared cache.
 */
let fallbackCacheManager: CacheManager | null = null;
function getFallbackCacheManager(): CacheManager {
  return (fallbackCacheManager ??= new CacheManager(new QueryClient()));
}

// Cache management hook
export function useCache() {
  const context = useMinderContextSafe();
  const cacheManager = context?.cacheManager ?? getFallbackCacheManager();

  return {
    getCachedData: <T = any>(queryKey: string | string[]) => cacheManager.getCachedData<T>(queryKey),
    setCachedData: <T = any>(queryKey: string | string[], data: T) => cacheManager.setCachedData(queryKey, data),
    invalidateQueries: (queryKey?: string | string[]) => cacheManager.invalidateQueries(queryKey),
    clearCache: (queryKey?: string | string[]) => cacheManager.clearCache(queryKey),
    getAllCachedQueries: () => cacheManager.getAllCachedQueries(),
    isQueryFresh: (queryKey: string | string[]) => cacheManager.isQueryFresh(queryKey),
    prefetchQuery: <T = any>(queryKey: string | string[], queryFn: () => Promise<T>, options?: any) =>
      cacheManager.prefetchQuery(queryKey, queryFn, options),
  };
}

// Current user hook
export function useCurrentUser() {
  const [user, setUser] = useState<any>(null);

  // B3 (fix-2.2.0-blockers): swapped the throwing `useMinderContext()` for
  // the safe accessor + `globalAuthManager` fallback (see `useAuthToken`
  // above for the full rationale).
  const context = useMinderContextSafe();
  const authManager = context?.authManager ?? globalAuthManager;

  useEffect(() => {
    const token = authManager.getToken();
    setUser(token ? decodeJwt(token) : null);
  }, [authManager]);

  return {
    user,
    isLoggedIn: !!user,
    hasRole: (role: string) => user?.roles?.includes(role) || false,
    hasPermission: (permission: string) => user?.permissions?.includes(permission) || false,
  };
}

/** Default trailing-edge throttle interval for upload progress commits (ms). */
const DEFAULT_UPLOAD_PROGRESS_THROTTLE_MS = 100;

/**
 * MDPD-4 (perf audit A4): trailing-edge throttle for upload progress state
 * commits. Coalesces a burst of progress events into at most one React state
 * update per `intervalMs`, but ALWAYS commits the terminal (100%) value
 * immediately so the final progress is never dropped. The latest value is held
 * in a ref between commits, so intermediate events don't re-render the consumer.
 * `intervalMs` is injectable for deterministic testing with fake timers.
 */
function useThrottledProgress(
  intervalMs: number
): {
  progress: UploadProgress;
  push: (p: UploadProgress) => void;
  reset: () => void;
} {
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0, percentage: 0 });
  const latestRef = useRef<UploadProgress>(progress);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (p: UploadProgress) => {
      latestRef.current = p;
      // Terminal value (complete): flush immediately and cancel any pending tick
      // so the 100% progress always commits without waiting on the interval.
      if (p.percentage >= 100) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setProgress(p);
        return;
      }
      // Otherwise coalesce: start one trailing timer that commits the latest
      // value when it fires. Additional events before it fires only update the ref.
      if (timerRef.current == null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setProgress(latestRef.current);
        }, intervalMs);
      }
    },
    [intervalMs]
  );

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const zero: UploadProgress = { loaded: 0, total: 0, percentage: 0 };
    latestRef.current = zero;
    setProgress(zero);
  }, []);

  // Clear any pending timer on unmount so a late commit can't fire post-unmount.
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    []
  );

  return { progress, push, reset };
}

/**
 * Media upload hook.
 *
 * Progress semantics (single shared `progress` value):
 * - Progress commits are throttled (see {@link useThrottledProgress}) to avoid a
 *   re-render storm; the terminal 100% value always commits.
 * - Each `uploadFile` / `uploadMultiple` call RESETS progress to zero at its
 *   start, so a subsequent upload never briefly shows the previous upload's
 *   stale 100%.
 * - Concurrent `uploadFile` calls on the SAME hook instance are SERIALIZED: a
 *   second call issued while the first is still in flight is queued behind it
 *   and only begins (resetting progress and dispatching) once the first
 *   settles. This deliberately avoids two overlapping uploads sharing — and
 *   corrupting — the single throttle timer / progress state (upload A's terminal
 *   flush would otherwise clear the shared pending timer and drop upload B's
 *   coalesced update). `uploadMultiple` was already sequential and inherits the
 *   per-file reset.
 */
export function useMediaUpload(
  routeName: string,
  options?: { throttleMs?: number }
) {
  const { apiClient } = useMinderContext();
  const throttleMs = options?.throttleMs ?? DEFAULT_UPLOAD_PROGRESS_THROTTLE_MS;
  const { progress, push: pushProgress, reset: resetProgress } = useThrottledProgress(throttleMs);

  // Tail of the serialized-upload chain. `null` means no upload is in flight, so
  // the next call runs SYNCHRONOUSLY (preserving eager progress-callback wiring);
  // a non-null tail means a call is active and the next one queues behind it.
  const chainTailRef = useRef<Promise<unknown> | null>(null);

  const runUpload = useCallback(
    (file: File): Promise<MediaUploadResult> => {
      // Fresh progress for every upload — no stale 100% carried over.
      resetProgress();
      // MDPD-4: commit progress through the throttle instead of setState-per-event.
      return apiClient.uploadFile(routeName, file, pushProgress);
    },
    [apiClient, routeName, pushProgress, resetProgress]
  );

  const uploadFile = useCallback(
    (file: File): Promise<MediaUploadResult> => {
      const prior = chainTailRef.current;
      // No upload in flight: start immediately. Otherwise serialize behind it.
      const result: Promise<MediaUploadResult> = prior
        ? prior.then(() => runUpload(file))
        : runUpload(file);

      // Track this call as the new tail; swallow rejection for chaining only
      // (callers still receive the real `result` promise, rejection intact).
      const tail = result.catch(() => undefined);
      chainTailRef.current = tail;
      void tail.then(() => {
        if (chainTailRef.current === tail) {
          chainTailRef.current = null;
        }
      });

      return result;
    },
    [runUpload]
  );

  const uploadMultiple = useCallback(
    async (files: File[]): Promise<MediaUploadResult[]> => {
      const results: MediaUploadResult[] = [];
      for (const file of files) {
        const result = await uploadFile(file);
        results.push(result);
      }
      return results;
    },
    [uploadFile]
  );

  return {
    uploadFile,
    uploadMultiple,
    progress,
    isUploading: progress.percentage > 0 && progress.percentage < 100,
  };
}

// WebSocket hook
export function useWebSocket() {
  const { websocketManager, realtimeManager } = useMinderContext();
  // `realtimeManager` is set for both transports (aliases the WS manager under
  // transport:'ws', holds the lazy SseTransport under transport:'sse'); the
  // `websocketManager` fallback keeps WS behavior identical while making SSE
  // reachable. `send` is optional (SSE is receive-only, §4.7).
  const rt = realtimeManager ?? websocketManager;

  return {
    // N3 (fix-2.2.0-blockers): `rt` is either `WebSocketManager` or an SSE
    // transport (LazySseTransport/SseTransport) — both hand back a promise
    // that REJECTS on a real connection failure (dead port, restarted
    // server, network blip). A caller that fires this off without attaching
    // its own handler (e.g. `<button onClick={connect}>`, or simply not
    // awaiting it) used to crash a Node-hosted consumer (SSR, Electron main,
    // /node, /electron) via an unhandled rejection, and surface as
    // "Uncaught (in promise)" in a browser. Attaching a silent no-op `.catch`
    // here guarantees a handler exists regardless of what the caller does
    // with the returned promise; a caller that DOES `.catch()`/`await` it
    // still observes the real rejection normally — every handler attached to
    // a promise fires independently. `WebSocketManager.connect()` carries the
    // identical safeguard so direct `useMinderContext().websocketManager
    // .connect()` access (bypassing this hook) is covered too.
    connect: () => {
      const result = rt?.connect();
      result?.catch(() => { /* see comment above */ });
      return result;
    },
    disconnect: () => rt?.disconnect(),
    send: (type: string, data: any) => rt?.send?.(type, data),
    subscribe: (event: string, callback: (data: any) => void) => rt?.subscribe(event, callback),
    isConnected: () => rt?.isConnected() || false,
  };
}

// UI State hook
export function useUIState() {
  const [uiState, setUIState] = useState({
    modals: {} as Record<string, boolean>,
    notifications: [] as unknown[],
    loading: {} as Record<string, boolean>,
  });

  const showModal = useCallback((modalName: string) => {
    setUIState((prev: any) => ({
      ...prev,
      modals: { ...prev.modals, [modalName]: true },
    }));
  }, []);

  const hideModal = useCallback((modalName: string) => {
    setUIState((prev: any) => ({
      ...prev,
      modals: { ...prev.modals, [modalName]: false },
    }));
  }, []);

  const addNotification = useCallback((notification: any) => {
    setUIState((prev: any) => ({
      ...prev,
      notifications: [...prev.notifications, { ...notification, id: Date.now() }],
    }));
  }, []);

  const removeNotification = useCallback((id: string | number) => {
    setUIState((prev: any) => ({
      ...prev,
      notifications: prev.notifications.filter((n: any) => n.id !== id),
    }));
  }, []);

  const setLoading = useCallback((key: string, loading: boolean) => {
    setUIState((prev: any) => ({
      ...prev,
      loading: { ...prev.loading, [key]: loading },
    }));
  }, []);

  return {
    ...uiState,
    showModal,
    hideModal,
    addNotification,
    removeNotification,
    setLoading,
  };
}

export { useConfiguration } from './useConfiguration.js';
export { useMinder } from './useMinder.js';
export type { UseMinderOptions, UseMinderReturn } from './useMinder.js';
export { usePaginatedMinder } from './usePaginatedMinder.js';
export type {
  UsePaginatedMinderOptions,
  UsePaginatedMinderReturn,
  PaginationConfig,
  PageData,
} from './usePaginatedMinder.js';
