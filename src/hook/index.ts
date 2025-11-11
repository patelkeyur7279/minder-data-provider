/**
 * 🎣 Minder Data Provider - Hook Only
 *
 * Ultra-lightweight entry point for useMinder hook only.
 * Minimal bundle size (~25KB) when you only need the hook within MinderDataProvider.
 *
 * ⚠️  IMPORTANT: This entry point ONLY works within MinderDataProvider context.
 * For standalone usage, use the full library import.
 *
 * @example
 * import { MinderDataProvider, useMinder } from 'minder-data-provider/hook';
 *
 * function App() {
 *   return (
 *     <MinderDataProvider config={{ baseURL: '/api' }}>
 *       <MyComponent />
 *     </MinderDataProvider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const { data, loading } = useMinder('users');
 *   // ...
 * }
 */

// ============================================================================
// MINIMAL HOOK EXPORT (Context-Only)
// ============================================================================

// Create a minimal version of useMinder that ONLY works with context
// This eliminates the axios dependency and reduces bundle size significantly

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { useMinderContext } from '../core/MinderDataProvider.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { HttpMethod } from '../constants/enums.js';

// ============================================================================
// MINIMAL TYPES (only what's needed for the hook)
// ============================================================================

export interface UseMinderOptions<TData = any> extends Omit<MinderOptions<TData>, 'baseURL' | 'timeout' | 'headers' | 'token'> {
  autoFetch?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number | false;
  enabled?: boolean;
  queryOptions?: Omit<UseQueryOptions<MinderResult<TData>>, 'queryKey' | 'queryFn'>;
  mutationOptions?: Omit<UseMutationOptions<MinderResult<TData>>, 'mutationFn'>;
}

export interface UseMinderReturn<TData = any> {
  data: TData | null;
  items: TData | null;
  loading: boolean;
  error: any;
  success: boolean;
  refetch: () => Promise<MinderResult<TData>>;
  mutate: (data?: any) => Promise<MinderResult<TData>>;
  operations?: {
    create: (item: Partial<TData>) => Promise<TData>;
    update: (id: string | number, item: Partial<TData>) => Promise<TData>;
    delete: (id: string | number) => Promise<void>;
    fetch: () => Promise<TData[]>;
    refresh: () => void;
    clear: () => void;
  };
  isFetching: boolean;
  isStale: boolean;
  isMutating: boolean;
  invalidate: () => Promise<void>;
  query: any;
  mutation: any;
}

// ============================================================================
// MINIMAL HOOK IMPLEMENTATION (Context-Only)
// ============================================================================

export function useMinder<TData = any>(
  route: string,
  options: UseMinderOptions<TData> = {}
): UseMinderReturn<TData> {
  const queryClient = useQueryClient();
  const context = useMinderContext(); // Required - no fallback

  // Stabilize query key
  const queryKey = useMemo(
    () => [route, options.params],
    [route, JSON.stringify(options.params)]
  );

  const isQueryEnabled = useMemo(
    () => options.enabled !== false && options.autoFetch !== false,
    [options.enabled, options.autoFetch]
  );

  // Query using ApiClient
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<MinderResult<TData>> => {
      try {
        const data = await context.apiClient.request(route, undefined, options.params);
        return {
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
        return {
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
    },
    enabled: isQueryEnabled,
    staleTime: options.cacheTTL || 5 * 60 * 1000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? true,
    refetchInterval: options.refetchInterval || false,
    retry: options.retries ?? 3,
    ...options.queryOptions,
  });

  // Mutation using ApiClient
  const mutation = useMutation({
    mutationFn: async (data?: any): Promise<MinderResult<TData>> => {
      try {
        const responseData = await context.apiClient.request(route, data, options.params);
        return {
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
        return {
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
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey });
        if (options.onSuccess) {
          options.onSuccess(result.data);
        }
      }
    },
    onError: (error: any) => {
      if (options.onError) {
        options.onError(error);
      }
    },
    ...options.mutationOptions,
  });

  // Helpers
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

  // CRUD Operations
  const crudOperations = {
    create: (item: Partial<TData>) => context.apiClient.request(route, item),
    update: (id: string | number, item: Partial<TData>) => context.apiClient.request(route, item, { id }),
    delete: (id: string | number) => context.apiClient.request(route, undefined, { id }),
    fetch: async () => {
      const result = await query.refetch();
      return (result.data?.data || []) as TData[];
    },
    refresh: () => queryClient.invalidateQueries({ queryKey }),
    clear: () => context.cacheManager.clearCache(route),
  };

  // Return
  const resultData = query.data?.data ?? null;
  const resultError = query.data?.error ?? mutation.data?.error ?? null;
  const resultSuccess = query.data?.success ?? mutation.data?.success ?? false;

  return {
    data: resultData,
    items: resultData,
    loading: query.isLoading || mutation.isPending,
    error: resultError,
    success: resultSuccess,
    refetch: refetchData,
    mutate: mutateData,
    operations: crudOperations,
    invalidate,
    isFetching: query.isFetching,
    isStale: query.isStale,
    isMutating: mutation.isPending,
    query,
    mutation,
  };
}

// ============================================================================
// MINIMAL CONTEXT EXPORT (needed for the hook to work)
// ============================================================================

export { MinderDataProvider, useMinderContext } from '../core/MinderDataProvider.js';

// ============================================================================
// MINIMAL ERROR TYPES (only what's needed)
// ============================================================================

export {
  MinderError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from '../errors/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { useMinder as default } from './index.js';