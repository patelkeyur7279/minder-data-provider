"use client";

/**
 * 🎯 useMinder - Unified React Hook for ALL Data Operations
 * 
 * The ONE hook for everything: fetching, mutations, and CRUD operations.
 * Context-aware: works with or without MinderDataProvider.
 * 
 * Features:
 * - Automatic data fetching on mount
 * - Caching and deduplication
 * - Loading and error states
 * - Optimistic updates
 * - Parameter replacement for dynamic routes
 * - CRUD operations (when within MinderDataProvider)
 * - SSR/CSR compatible
 * 
 * @example
 * // Fetch all posts (collection)
 * const { items: posts, operations } = useMinder('posts');
 * await operations.create({ title: 'New Post' });
 * 
 * @example
 * // Fetch single post with parameters
 * const { data: post } = useMinder('postById', { params: { id: 123 } });
 * 
 * @example
 * // Custom mutations
 * const { mutate } = useMinder('likePost', { params: { id: 123 } });
 * await mutate(); // POST /api/posts/123/like
 * 
 * @example
 * // Manual control
 * const { data, refetch } = useMinder('posts', { autoFetch: false });
 * await refetch();
 * 
 * @example
 * // Outside MinderDataProvider (direct URLs)
 * const { data } = useMinder('/api/posts/123');
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { useMinderContext } from '../core/MinderDataProvider.js';
import { HttpMethod } from '../constants/enums.js';

// ============================================================================
// TYPES
// ============================================================================

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
 */
export function useMinder<TData = any>(
  route: string,
  options: UseMinderOptions<TData> = {}
): UseMinderReturn<TData> {
  const queryClient = useQueryClient();
  
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
    retry: options.retries ?? 3,
    ...options.queryOptions,
  });
  
  // =========================================================================
  // MUTATION (for POST/PUT/DELETE requests)
  // =========================================================================
  
  const mutation = useMutation({
    mutationFn: async (data?: any): Promise<MinderResult<TData>> => {
      let result: MinderResult<TData>;
      
      if (context?.apiClient) {
        // Use ApiClient for parameter replacement (when within MinderDataProvider)
        try {
          const responseData = await context.apiClient.request(route, data, options.params);
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
        result = await minder<TData>(route, data, options);
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
      mutationFn: (item: Partial<TData>) => context.apiClient.request(route, item),
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    const updateMutation = useMutation({
      mutationFn: ({ id, item }: { id: string | number; item: Partial<TData> }) =>
        context.apiClient.request(route, item, { id }),
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
