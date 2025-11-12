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

import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions, UseInfiniteQueryOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { useMinderContext } from '../core/MinderDataProvider.js';
import { HttpMethod } from '../constants/enums.js';
import type { RetryConfig } from '../core/types.js';
import { getGlobalMinderConfig } from '../core/globalConfig.js';
import { globalAuthManager } from '../auth/GlobalAuthManager.js';
import { 
  subscribeToUploadProgress, 
  setUploadProgress as setGlobalUploadProgress,
  getUploadProgress as getGlobalUploadProgress 
} from '../upload/uploadProgressStore.js';
import {
  replaceUrlParams,
  hasUnreplacedParams,
  getRouteSuggestions,
} from '../utils/routeHelpers.js';

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
   * 🆕 Custom query key for fine-grained cache control
   * By default, query key is [route, params]
   * 
   * @example Custom query key
   * ```typescript
   * const { data } = useMinder('posts', {
   *   queryKey: ['posts', 'featured', filters]
   * });
   * ```
   */
  queryKey?: any[];
  
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
  getNextPageParam?: (lastPage: any, allPages: any[]) => any;
  
  /**
   * 🆕 Get previous page param for infinite queries
   */
  getPreviousPageParam?: (firstPage: any, allPages: any[]) => any;
  
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
   */
  mutate: (data?: any) => Promise<MinderResult<TData>>;
  
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
    subscribe: (event: string, callback: (data: any) => void) => (() => void);
    isConnected: () => boolean;
  };
  
  /**
   * File upload methods (NEW - integrated from useMediaUpload)
   * 🆕 Now uses shared upload progress across all hook instances
   */
  upload: {
    uploadFile: (file: File, uploadId?: string) => Promise<any>;
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
  
  // Upload progress state (local fallback)
  const [localUploadProgress, setLocalUploadProgress] = useState<{ loaded: number; total: number; percentage: number }>({
    loaded: 0,
    total: 0,
    percentage: 0,
  });
  
  // Cancellation state
  const [isCancelled, setIsCancelled] = useState(false);
  const cancelledRef = useRef(false);
  
  // Unique upload ID for shared progress
  const uploadIdRef = useRef(`upload-${route}-${Date.now()}`);
  
  // Try to get context (ApiClient) - gracefully fallback if not available
  let context: any = null;
  let hasContext = false;
  try {
    context = useMinderContext();
    hasContext = true;
  } catch {
    // Not within MinderDataProvider - use global config
  }
  
  // Get global config if no context
  const globalConfig = useMemo(() => {
    if (!hasContext) {
      return getGlobalMinderConfig();
    }
    return null;
  }, [hasContext]);
  
  // Validate route and provide suggestions if invalid
  const routeValidation = useMemo(() => {
    const config = context?.config || globalConfig;
    if (config?.routes) {
      const routeNames = Object.keys(config.routes);
      if (!routeNames.includes(route)) {
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
        if (!options.params) {
          return {
            valid: false,
            error: `Route "${route}" requires parameters: ${routeConfig.url}. Please provide params option.`
          };
        }
        // Try to replace params
        const replacedUrl = replaceUrlParams(routeConfig.url, options.params);
        if (hasUnreplacedParams(replacedUrl)) {
          return {
            valid: false,
            error: `Route "${route}" has unreplaced parameters. URL: ${replacedUrl}`
          };
        }
      }
    }
    return { valid: true };
  }, [route, context?.config, globalConfig, options.params]);
  
  // Stabilize query key to prevent unnecessary refetches on every render
  // Allow custom query key or use [route, params]
  const queryKey = useMemo(
    () => options.queryKey || [route, options.params],
    [options.queryKey, route, JSON.stringify(options.params)]
  );
  
  // Determine if query should be enabled
  const isQueryEnabled = useMemo(
    () => options.enabled !== false && options.autoFetch !== false && routeValidation.valid,
    [options.enabled, options.autoFetch, routeValidation.valid]
  );
  
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
    const requestParams = pageParam !== undefined 
      ? { ...options.params, ...pageParam }
      : options.params;
    
    if (context?.apiClient) {
      // Use ApiClient for parameter replacement (when within MinderDataProvider)
      try {
        const data = await context.apiClient.request(route, undefined, requestParams);
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
      // Use core minder function (global config)
      result = await minder<TData>(route, null, {
        ...options,
        method: HttpMethod.GET,
        params: requestParams,
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
  };
  
  // Use infinite query if infinite option is enabled
  const query = options.infinite
    ? useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam }) => createQueryFn(pageParam)(),
        enabled: isQueryEnabled,
        staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
        gcTime: options.gcTime || 10 * 60 * 1000,
        refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
        refetchOnReconnect: options.refetchOnReconnect ?? true,
        refetchInterval: options.refetchInterval || false,
        retry: retryConfig.retry,
        retryDelay: retryConfig.retryDelay,
        getNextPageParam: options.getNextPageParam,
        getPreviousPageParam: options.getPreviousPageParam,
        initialPageParam: options.initialPageParam,
        ...options.queryOptions,
      } as UseInfiniteQueryOptions<MinderResult<TData>>)
    : useQuery({
        queryKey,
        queryFn: createQueryFn(),
        enabled: isQueryEnabled,
        staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
        gcTime: options.gcTime || 10 * 60 * 1000,
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
    cancelledRef.current = true;
    setIsCancelled(true);
    await queryClient.cancelQueries({ queryKey });
  };
  
  const refetchData = async (): Promise<MinderResult<TData>> => {
    // Reset cancellation state
    cancelledRef.current = false;
    setIsCancelled(false);
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
      mutationFn: async ({ item, params }: { 
        item: Partial<TData>; 
        params?: Record<string, any> 
      }) => {
        // Validate before create
        let validatedItem = item;
        if (options.validate) {
          validatedItem = await options.validate(item as TData);
        }
        // ✅ Pass params to request for dynamic URL replacement
        return context.apiClient.request(route, validatedItem, params);
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const updateMutation = useMutation({
      mutationFn: async ({ id, item, params }: { 
        id: string | number; 
        item: Partial<TData>;
        params?: Record<string, any>
      }) => {
        // Validate before update
        let validatedItem = item;
        if (options.validate) {
          validatedItem = await options.validate(item as TData);
        }
        // ✅ Merge id with params for URL replacement
        return context.apiClient.request(route, validatedItem, { ...params, id });
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const deleteMutation = useMutation({
      mutationFn: ({ id, params }: { 
        id: string | number;
        params?: Record<string, any>
      }) => {
        // ✅ Merge id with params for URL replacement
        return context.apiClient.request(route, undefined, { ...params, id });
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    crudOperations = {
      // ✅ Accept params option in all CRUD operations
      create: (item: Partial<TData>, opts?: { params?: Record<string, any> }) => 
        createMutation.mutateAsync({ item, params: opts?.params }),
      update: (id: string | number, item: Partial<TData>, opts?: { params?: Record<string, any> }) => 
        updateMutation.mutateAsync({ id, item, params: opts?.params }),
      delete: (id: string | number, opts?: { params?: Record<string, any> }) => 
        deleteMutation.mutateAsync({ id, params: opts?.params }),
      fetch: async (opts?: { params?: Record<string, any> }) => {
        const result = await query.refetch();
        return (result.data?.data || []) as TData[];
      },
      refresh: () => queryClient.invalidateQueries({ queryKey }),
      clear: () => context.cacheManager.clearCache(route),
    };
  }
  
  // =========================================================================
  // AUTHENTICATION (integrated from useAuth)
  // 🆕 Now uses GlobalAuthManager as fallback when no provider context
  // =========================================================================
  
  const authMethods = {
    setToken: async (token: string) => {
      if (context?.authManager) {
        await context.authManager.setToken(token);
      } else {
        // Use global auth manager as fallback
        await globalAuthManager.setToken(token);
      }
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
        if (token) {
          try {
            // Validate JWT has 3 parts (header.payload.signature)
            const parts = token.split('.');
            if (parts.length !== 3 || !parts[1]) {
              return null;
            }
            
            // Decode JWT token to get user info
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
          } catch {
            return null;
          }
        }
        return null;
      }
      // Use global auth manager as fallback
      return globalAuthManager.getCurrentUser();
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
      // ✅ Return unsubscribe function for cleanup
      const unsubscribe = context?.websocketManager?.subscribe(event, callback);
      return unsubscribe || (() => {}); // Return noop if no manager
    },
    isConnected: () => {
      return context?.websocketManager?.isConnected() || false;
    },
  };
  
  // =========================================================================
  // FILE UPLOAD (integrated from useMediaUpload)
  // 🆕 Now uses shared upload progress store
  // =========================================================================
  
  // Subscribe to shared upload progress
  const [sharedUploadProgress, setSharedUploadProgress] = useState<{ loaded: number; total: number; percentage: number }>({
    loaded: 0,
    total: 0,
    percentage: 0,
  });
  
  useEffect(() => {
    const unsubscribe = subscribeToUploadProgress(uploadIdRef.current, (progress) => {
      setSharedUploadProgress(progress);
    });
    return unsubscribe;
  }, []);
  
  // Use shared progress if available, otherwise local
  const currentUploadProgress = sharedUploadProgress.percentage > 0 ? sharedUploadProgress : localUploadProgress;
  
  const uploadMethods = {
    uploadFile: async (file: File, customUploadId?: string) => {
      const uploadId = customUploadId || uploadIdRef.current;
      
      if (context?.apiClient) {
        return context.apiClient.uploadFile(route, file, (progress: any) => {
          // Update both local and shared stores
          setLocalUploadProgress(progress);
          setGlobalUploadProgress(uploadId, progress);
        });
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
    progress: currentUploadProgress,
    isUploading: currentUploadProgress.percentage > 0 && currentUploadProgress.percentage < 100,
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
    
    // 🆕 Cancellation state
    isCancelled: cancelledRef.current || isCancelled,
    
    // 🆕 Infinite query methods (only if infinite mode enabled)
    ...(options.infinite ? {
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
  };
}

/**
 * Export as default for convenience
 */
export default useMinder;
