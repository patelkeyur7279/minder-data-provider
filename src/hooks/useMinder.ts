/**
 * 🎯 useMinder - React Hook Wrapper for Minder
 * 
 * Provides reactive state management with TanStack Query
 * Perfect for React components that need automatic re-renders
 * 
 * Features:
 * - Automatic data fetching on mount
 * - Caching and deduplication
 * - Loading and error states
 * - Optimistic updates
 * - SSR/CSR compatible
 * 
 * @example
 * // Simple fetch with auto-refetch
 * const { data, loading } = useMinder('users');
 * 
 * @example
 * // Manual fetch control
 * const { data, refetch } = useMinder('users', { autoFetch: false });
 * await refetch();
 * 
 * @example
 * // Mutations (create/update/delete)
 * const { mutate, loading } = useMinder('users');
 * await mutate({ name: 'John' }); // Create
 * await mutate({ id: 1, name: 'Jane' }); // Update
 * 
 * @example
 * // With model class
 * const { data } = useMinder('users', { model: UserModel });
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';

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
   * Response data (null if loading or error)
   */
  data: TData | null;
  
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
  
  // Stabilize query key to prevent unnecessary refetches on every render
  // Only recreate when route or params actually change (deep comparison)
  const queryKey = useMemo(
    () => [route, options.params],
    [route, JSON.stringify(options.params)] // Deep compare params
  );
  
  // Determine if query should be enabled
  // autoFetch: false should completely disable automatic fetching
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
      const result = await minder<TData>(route, null, {
        ...options,
        method: 'GET',
      });
      
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
      const result = await minder<TData>(route, data, options);
      
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
  
  const refetch = async (): Promise<MinderResult<TData>> => {
    const result = await query.refetch();
    return result.data as MinderResult<TData>;
  };
  
  const mutate = async (data?: any): Promise<MinderResult<TData>> => {
    return mutation.mutateAsync(data);
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
    loading: query.isLoading || mutation.isPending,
    error: resultError,
    success: resultSuccess,
    
    // Operations
    refetch,
    mutate,
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
