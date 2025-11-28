"use client";

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector, useDispatch } from 'react-redux';
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
    setIsLoggedIn(authManager.isAuthenticated());
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

// Redux store hook
export function useStore() {
  const { store } = useMinderContext();

  return {
    getState: () => store.getState(),
    dispatch: (action: any) => store.dispatch(action),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}

// Redux slice hook
export function useReduxSlice(routeName: string) {
  const { store } = useMinderContext();
  const dispatch = useDispatch();
  const state = useSelector((state: any) => state[routeName]);

  // Get slice from store (this would be populated by sliceGenerator)
  const slice = (store as any)._slices?.[routeName];

  return {
    state,
    actions: slice?.actions || {},
    selectors: slice?.selectors || {},
    dispatch,
  };
}

// Current user hook
export function useCurrentUser() {
  const [user, setUser] = useState<any>(null);

  const { authManager } = useMinderContext();

  useEffect(() => {
    const token = authManager.getToken();
    if (token) {
      try {
        // Validate JWT has 3 parts (header.payload.signature)
        const parts = token.split('.');
        if (parts.length !== 3 || !parts[1]) {
          setUser(null);
          return;
        }

        // Decode JWT token to get user info
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        setUser(payload);
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [authManager]);

  return {
    user,
    isLoggedIn: !!user,
    hasRole: (role: string) => user?.roles?.includes(role) || false,
    hasPermission: (permission: string) => user?.permissions?.includes(permission) || false,
  };
}

// Media upload hook
export function useMediaUpload(routeName: string) {
  const { apiClient } = useMinderContext();
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0, percentage: 0 });

  const uploadFile = useCallback(
    async (file: File): Promise<MediaUploadResult> => {
      return apiClient.uploadFile(routeName, file, setProgress);
    },
    [apiClient, routeName]
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
    notifications: [] as any[],
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
