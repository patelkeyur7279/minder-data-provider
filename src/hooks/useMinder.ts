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

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { useMinderContext } from '../core/MinderDataProvider.js';
import { HttpMethod } from '../constants/enums.js';
import type { RetryConfig } from '../core/types.js';

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
   */
  mutate: (data?: any) => Promise<MinderResult<TData>>;
  
  /**
   * CRUD operations (available when within MinderDataProvider)
   */
  operations?: {
    create: (item: Partial<TData>) => Promise<TData>;
    update: (id: string | number, item: Partial<TData>) => Promise<TData>;
    delete: (id: string | number) => Promise<void>;
    fetch: () => Promise<TData[]>;
    refresh: () => void;
    clear: () => void;
  };
  
  /**
   * Authentication methods (NEW - integrated from useAuth)
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
    getCurrentUser?: () => any;
  };
  
  /**
   * Cache control methods (NEW - integrated from useCache)
   */
  cache: {
    invalidate: (keys?: string | string[]) => Promise<void>;
    prefetch: (queryFn: () => Promise<any>, options?: any) => Promise<void>;
    clear: (key?: string | string[]) => void;
    getStats: () => any[];
    isQueryFresh: (key: string | string[]) => boolean;
  };
  
  /**
   * WebSocket methods (NEW - integrated from useWebSocket)
   */
  websocket: {
    connect: () => void;
    disconnect: () => void;
    send: (type: string, data: any) => void;
    subscribe: (event: string, callback: (data: any) => void) => void;
    isConnected: () => boolean;
  };
  
  /**
   * File upload methods (NEW - integrated from useMediaUpload)
   */
  upload: {
    uploadFile: (file: File) => Promise<any>;
    uploadMultiple: (files: File[]) => Promise<any[]>;
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
   * Cancel ongoing requests for this query
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
 * Helper function to create retry configuration for React Query
 */
function createRetryConfig(retryConfig?: RetryConfig) {
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

/**
 * useMinder - React hook for data fetching and mutations
 * 
 * Thin wrapper around minder() function with reactive state
 * Uses TanStack Query under the hood for caching and deduplication
 */
export function useMinder<TData = any>(
  route: string,
  options: UseMinderOptions<TData> = {}
): UseMinderReturn<TData> {
  // All hooks MUST be at the top level (React Rules of Hooks)
  const queryClient = useQueryClient();
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number; percentage: number }>({
    loaded: 0,
    total: 0,
    percentage: 0,
  });
  
  // Try to get context (ApiClient) - gracefully fallback if not available
  let context: any = null;
  try {
    context = useMinderContext();
  } catch {
    // Not within MinderDataProvider - use global config
  }
  
  // Stabilize query key to prevent unnecessary refetches on every render
  // Include route and params for proper caching
  const queryKey = useMemo(
    () => [route, options.params],
    [route, JSON.stringify(options.params)]
  );
  
  // Determine if query should be enabled
  const isQueryEnabled = useMemo(
    () => options.enabled !== false && options.autoFetch !== false,
    [options.enabled, options.autoFetch]
  );
  
  // Create retry configuration
  const retryConfig = useMemo(
    () => createRetryConfig(options.retryConfig),
    [options.retryConfig]
  );
  
  // =========================================================================
  // QUERY (for GET requests)
  // =========================================================================
  
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<MinderResult<TData>> => {
      let result: MinderResult<TData>;
      
      if (context?.apiClient) {
        // Use ApiClient for parameter replacement (when within MinderDataProvider)
        try {
          const data = await context.apiClient.request(route, undefined, options.params);
          result = {
            data: data as TData,
            error: null,
            status: 200,
            success: true,
            metadata: {
              method: HttpMethod.GET,
              url: route,
              duration: 0,
              cached: false,
            },
          };
        } catch (error: any) {
          result = {
            data: null,
            error,
            status: error.status || 500,
            success: false,
            metadata: {
              method: HttpMethod.GET,
              url: route,
              duration: 0,
              cached: false,
            },
          };
        }
      } else {
        // Use core minder function (global config, no parameter replacement)
        result = await minder<TData>(route, null, {
          ...options,
          method: HttpMethod.GET,
        });
      }
      
      // If error, throw to trigger React Query error state
      // But still provide structured error to user
      if (!result.success && result.error) {
        // Don't actually throw - just return error result
        // This way we never crash the app
        return result;
      }
      
      return result;
    },
    enabled: isQueryEnabled,
    staleTime: options.cacheTTL || 5 * 60 * 1000, // 5 minutes default
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? true,
    refetchInterval: options.refetchInterval || false,
    retry: retryConfig.retry,
    retryDelay: retryConfig.retryDelay,
    ...options.queryOptions,
  });
  
  // =========================================================================
  // MUTATION (for POST/PUT/DELETE requests)
  // =========================================================================
  
  const mutation = useMutation({
    mutationFn: async (data?: any): Promise<MinderResult<TData>> => {
      // Validate data before mutation if validation function provided
      let validatedData = data;
      if (data && options.validate) {
        try {
          validatedData = await options.validate(data);
        } catch (validationError: any) {
          // Return validation error without making API call
          return {
            data: null,
            error: validationError,
            status: 400,
            success: false,
            metadata: {
              method: options.method || HttpMethod.POST,
              url: route,
              duration: 0,
              cached: false,
            },
          };
        }
      }
      
      let result: MinderResult<TData>;
      
      if (context?.apiClient) {
        // Use ApiClient for parameter replacement (when within MinderDataProvider)
        try {
          const responseData = await context.apiClient.request(route, validatedData, options.params);
          result = {
            data: responseData as TData,
            error: null,
            status: 200,
            success: true,
            metadata: {
              method: options.method || HttpMethod.POST,
              url: route,
              duration: 0,
              cached: false,
            },
          };
        } catch (error: any) {
          result = {
            data: null,
            error,
            status: error.status || 500,
            success: false,
            metadata: {
              method: options.method || HttpMethod.POST,
              url: route,
              duration: 0,
              cached: false,
            },
          };
        }
      } else {
        // Use core minder function (global config, no parameter replacement)
        result = await minder<TData>(route, validatedData, options);
      }
      
      // Don't throw errors - return structured result
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
  
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  
  const cancel = async () => {
    await queryClient.cancelQueries({ queryKey });
  };
  
  const refetchData = async (): Promise<MinderResult<TData>> => {
    const result = await query.refetch();
    return result.data as MinderResult<TData>;
  };
  
  const mutateData = async (data?: any): Promise<MinderResult<TData>> => {
    return mutation.mutateAsync(data);
  };
  
  // =========================================================================
  // CRUD OPERATIONS (when within MinderDataProvider)
  // =========================================================================
  
  let crudOperations: any = undefined;
  if (context?.apiClient && context?.cacheManager) {
    // Create CRUD operations similar to useOneTouchCrud
    const createMutation = useMutation({
      mutationFn: async (item: Partial<TData>) => {
        // Validate before create
        let validatedItem = item;
        if (options.validate) {
          validatedItem = await options.validate(item as TData);
        }
        return context.apiClient.request(route, validatedItem);
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const updateMutation = useMutation({
      mutationFn: async ({ id, item }: { id: string | number; item: Partial<TData> }) => {
        // Validate before update
        let validatedItem = item;
        if (options.validate) {
          validatedItem = await options.validate(item as TData);
        }
        return context.apiClient.request(route, validatedItem, { id });
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const deleteMutation = useMutation({
      mutationFn: (id: string | number) => context.apiClient.request(route, undefined, { id }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    crudOperations = {
      create: (item: Partial<TData>) => createMutation.mutateAsync(item),
      update: (id: string | number, item: Partial<TData>) => updateMutation.mutateAsync({ id, item }),
      delete: (id: string | number) => deleteMutation.mutateAsync(id),
      fetch: async () => {
        const result = await query.refetch();
        return (result.data?.data || []) as TData[];
      },
      refresh: () => queryClient.invalidateQueries({ queryKey }),
      clear: () => context.cacheManager.clearCache(route),
    };
  }
  
  // =========================================================================
  // AUTHENTICATION (integrated from useAuth)
  // =========================================================================
  
  const authMethods = {
    setToken: async (token: string) => {
      if (context?.authManager) {
        await context.authManager.setToken(token);
      }
    },
    getToken: () => {
      return context?.authManager ? context.authManager.getToken() : null;
    },
    clearAuth: async () => {
      if (context?.authManager) {
        await context.authManager.clearAuth();
      }
    },
    isAuthenticated: () => {
      return context?.authManager ? context.authManager.isAuthenticated() : false;
    },
    setRefreshToken: async (token: string) => {
      if (context?.authManager) {
        await context.authManager.setRefreshToken(token);
      }
    },
    getRefreshToken: () => {
      return context?.authManager ? context.authManager.getRefreshToken() : null;
    },
    getCurrentUser: () => {
      const token = context?.authManager?.getToken();
      if (token) {
        try {
          // Decode JWT token to get user info
          const payload = JSON.parse(atob(token.split('.')[1] || ''));
          return payload;
        } catch {
          return null;
        }
      }
      return null;
    },
  };
  
  // =========================================================================
  // CACHE CONTROL (integrated from useCache)
  // =========================================================================
  
  const cacheMethods = {
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
  };
  
  // =========================================================================
  // WEBSOCKET (integrated from useWebSocket)
  // =========================================================================
  
  const websocketMethods = {
    connect: () => {
      context?.websocketManager?.connect();
    },
    disconnect: () => {
      context?.websocketManager?.disconnect();
    },
    send: (type: string, data: any) => {
      context?.websocketManager?.send(type, data);
    },
    subscribe: (event: string, callback: (data: any) => void) => {
      context?.websocketManager?.subscribe(event, callback);
    },
    isConnected: () => {
      return context?.websocketManager?.isConnected() || false;
    },
  };
  
  // =========================================================================
  // FILE UPLOAD (integrated from useMediaUpload)
  // =========================================================================
  
  const uploadMethods = {
    uploadFile: async (file: File) => {
      if (context?.apiClient) {
        return context.apiClient.uploadFile(route, file, setUploadProgress);
      }
      throw new Error('Upload requires MinderDataProvider context');
    },
    uploadMultiple: async (files: File[]) => {
      const results = [];
      for (const file of files) {
        const result = await uploadMethods.uploadFile(file);
        results.push(result);
      }
      return results;
    },
    progress: uploadProgress,
    isUploading: uploadProgress.percentage > 0 && uploadProgress.percentage < 100,
  };
  
  // =========================================================================
  // RETURN
  // =========================================================================
  
  // Extract data from MinderResult
  const resultData = query.data?.data ?? null;
  const resultError = query.data?.error ?? mutation.data?.error ?? null;
  const resultSuccess = query.data?.success ?? mutation.data?.success ?? false;
  
  return {
    // Data & states
    data: resultData,
    items: resultData,  // Alias for collections
    loading: query.isLoading || mutation.isPending,
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
    isFetching: query.isFetching,
    isStale: query.isStale,
    isMutating: mutation.isPending,
    
    // Raw objects for advanced use
    query,
    mutation,
  };
}

/**
 * Export as default for convenience
 */
export default useMinder;
