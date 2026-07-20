"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseJWT as decodeJwt } from '../utils/jwt.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMinderContext } from '../core/MinderDataProvider.js';
import type { CrudOperations, UploadProgress, MediaUploadResult } from '../core/types.js';

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
  const { apiClient, cacheManager } = useMinderContext();
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

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (item: Partial<T>) => apiClient.request<T>(routeName, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, item }: { id: string | number; item: Partial<T> }) =>
      apiClient.request<T>(routeName, item, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => apiClient.request(routeName, undefined, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [routeName] });
    },
  });

  const operations = {
    // Manual fetch function that uses refetch from useQuery
    fetch: useCallback(async () => {
      const result = await refetch();
      return (result.data || []) as T[];  // ✅ Return T[] instead of T
    }, [refetch]),
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

// Authentication hook
export function useAuth() {
  const { authManager } = useMinderContext();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Initial check
    setIsLoggedIn(authManager.isAuthenticated());

    // Subscribe to changes
    const unsubscribe = authManager.subscribe(() => {
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

// Cache management hook
export function useCache() {
  const { cacheManager } = useMinderContext();

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

  const { authManager } = useMinderContext();

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
  const { websocketManager } = useMinderContext();

  return {
    connect: () => websocketManager?.connect(),
    disconnect: () => websocketManager?.disconnect(),
    send: (type: string, data: any) => websocketManager?.send(type, data),
    subscribe: (event: string, callback: (data: any) => void) => websocketManager?.subscribe(event, callback),
    isConnected: () => websocketManager?.isConnected() || false,
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
