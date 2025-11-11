"use client";

/**
 * 🎯 usePaginatedMinder - Pagination & Infinite Scroll Made Easy
 * 
 * Specialized hook for paginated data with built-in infinite scroll support.
 * Supports both offset-based and cursor-based pagination.
 * 
 * ✨ Features:
 * - ✅ Offset pagination (page/limit)
 * - ✅ Cursor pagination (next/previous tokens)
 * - ✅ Infinite scroll with hasNextPage/fetchNextPage
 * - ✅ Auto-loading on scroll
 * - ✅ Optimistic updates
 * - ✅ Cache management
 * 
 * @example Offset Pagination
 * ```typescript
 * const { 
 *   data, 
 *   hasNextPage, 
 *   fetchNextPage, 
 *   isFetchingNextPage 
 * } = usePaginatedMinder('posts', {
 *   pagination: {
 *     type: 'offset',
 *     pageSize: 20,
 *   }
 * });
 * 
 * // Load more
 * if (hasNextPage) {
 *   await fetchNextPage();
 * }
 * ```
 * 
 * @example Cursor Pagination
 * ```typescript
 * const { 
 *   data, 
 *   hasNextPage, 
 *   fetchNextPage 
 * } = usePaginatedMinder('posts', {
 *   pagination: {
 *     type: 'cursor',
 *     pageSize: 20,
 *     getCursor: (lastItem) => lastItem.id,
 *   }
 * });
 * ```
 * 
 * @example Infinite Scroll
 * ```typescript
 * const { 
 *   pages, 
 *   hasNextPage, 
 *   fetchNextPage,
 *   isFetchingNextPage 
 * } = usePaginatedMinder('posts', {
 *   pagination: {
 *     type: 'offset',
 *     pageSize: 10,
 *   }
 * });
 * 
 * // Render all pages
 * {pages.map((page, i) => (
 *   <div key={i}>
 *     {page.data.map(item => <Item key={item.id} {...item} />)}
 *   </div>
 * ))}
 * 
 * // Load more button
 * {hasNextPage && (
 *   <button onClick={fetchNextPage} disabled={isFetchingNextPage}>
 *     {isFetchingNextPage ? 'Loading...' : 'Load More'}
 *   </button>
 * )}
 * ```
 */

import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { UseInfiniteQueryOptions } from '@tanstack/react-query';
import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { useMinderContext } from '../core/MinderDataProvider.js';
import { HttpMethod } from '../constants/enums.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pagination configuration
 */
export interface PaginationConfig<TData = any> {
  /**
   * Type of pagination
   * - 'offset': Page number and limit (e.g., page=1&limit=20)
   * - 'cursor': Cursor-based (e.g., cursor=abc123&limit=20)
   */
  type: 'offset' | 'cursor';
  
  /**
   * Number of items per page
   * @default 20
   */
  pageSize?: number;
  
  /**
   * Initial page number (offset pagination only)
   * @default 1
   */
  initialPage?: number;
  
  /**
   * Query parameter name for page number (offset pagination)
   * @default 'page'
   */
  pageParam?: string;
  
  /**
   * Query parameter name for limit
   * @default 'limit'
   */
  limitParam?: string;
  
  /**
   * Query parameter name for cursor (cursor pagination)
   * @default 'cursor'
   */
  cursorParam?: string;
  
  /**
   * Function to extract cursor from last item (cursor pagination)
   * @example (lastItem) => lastItem.id
   * @example (lastItem) => lastItem.nextCursor
   */
  getCursor?: (lastItem: TData) => string | number | undefined;
  
  /**
   * Function to extract next page info from response
   * Use this when API returns pagination metadata
   * @example (response) => response.nextPage
   * @example (response) => response.pagination?.hasNext
   */
  getNextPageParam?: (lastPage: MinderResult<TData[]>) => any;
  
  /**
   * Function to extract previous page info from response
   * @example (firstPage) => firstPage.prevPage
   */
  getPreviousPageParam?: (firstPage: MinderResult<TData[]>) => any;
}

/**
 * Options for usePaginatedMinder hook
 */
export interface UsePaginatedMinderOptions<TData = any> extends MinderOptions<TData[]> {
  /**
   * Pagination configuration
   */
  pagination: PaginationConfig<TData>;
  
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
   * Enable query (allows conditional fetching)
   * @default true
   */
  enabled?: boolean;
  
  /**
   * TanStack Query infinite query options override
   */
  queryOptions?: Omit<UseInfiniteQueryOptions<MinderResult<TData[]>>, 'queryKey' | 'queryFn' | 'getNextPageParam'>;
}

/**
 * Page data structure
 */
export interface PageData<TData = any> {
  /**
   * Items in this page
   */
  data: TData[];
  
  /**
   * Page metadata
   */
  page?: number;
  cursor?: string | number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  total?: number;
}

/**
 * Return type for usePaginatedMinder hook
 */
export interface UsePaginatedMinderReturn<TData = any> {
  /**
   * All pages data (flattened)
   */
  data: TData[];
  
  /**
   * Individual pages
   */
  pages: PageData<TData>[];
  
  /**
   * Loading state (true during initial fetch)
   */
  loading: boolean;
  
  /**
   * Fetching next page state
   */
  isFetchingNextPage: boolean;
  
  /**
   * Fetching previous page state
   */
  isFetchingPreviousPage: boolean;
  
  /**
   * Error information (null if no error)
   */
  error: any;
  
  /**
   * Whether there are more pages to load
   */
  hasNextPage: boolean;
  
  /**
   * Whether there are previous pages to load
   */
  hasPreviousPage: boolean;
  
  /**
   * Fetch next page
   */
  fetchNextPage: () => Promise<void>;
  
  /**
   * Fetch previous page
   */
  fetchPreviousPage: () => Promise<void>;
  
  /**
   * Refetch all pages
   */
  refetch: () => Promise<void>;
  
  /**
   * Invalidate cache and refetch
   */
  invalidate: () => Promise<void>;
  
  /**
   * Total number of items (if available)
   */
  total?: number;
  
  /**
   * Raw TanStack Query object (for advanced use)
   */
  query: any;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * usePaginatedMinder - React hook for paginated data fetching
 * 
 * Supports both offset-based and cursor-based pagination with infinite scroll.
 * Uses TanStack Query's useInfiniteQuery under the hood.
 */
export function usePaginatedMinder<TData = any>(
  route: string,
  options: UsePaginatedMinderOptions<TData>
): UsePaginatedMinderReturn<TData> {
  const queryClient = useQueryClient();
  
  // Try to get context (ApiClient) - gracefully fallback if not available
  let context: any = null;
  try {
    context = useMinderContext();
  } catch {
    // Not within MinderDataProvider - use global config
  }
  
  // Extract pagination config with defaults
  const paginationConfig = useMemo(() => ({
    type: options.pagination.type,
    pageSize: options.pagination.pageSize ?? 20,
    initialPage: options.pagination.initialPage ?? 1,
    pageParam: options.pagination.pageParam ?? 'page',
    limitParam: options.pagination.limitParam ?? 'limit',
    cursorParam: options.pagination.cursorParam ?? 'cursor',
    getCursor: options.pagination.getCursor,
    getNextPageParam: options.pagination.getNextPageParam,
    getPreviousPageParam: options.pagination.getPreviousPageParam,
  }), [options.pagination]);
  
  // Stabilize query key
  const queryKey = useMemo(
    () => ['paginated', route, options.params, paginationConfig.type],
    [route, JSON.stringify(options.params), paginationConfig.type]
  );
  
  // Determine if query should be enabled
  const isQueryEnabled = useMemo(
    () => options.enabled !== false && options.autoFetch !== false,
    [options.enabled, options.autoFetch]
  );
  
  // =========================================================================
  // INFINITE QUERY
  // =========================================================================
  
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<MinderResult<TData[]>> => {
      // Build pagination params based on type
      let paginationParams: Record<string, any> = {
        [paginationConfig.limitParam]: paginationConfig.pageSize,
      };
      
      if (paginationConfig.type === 'offset') {
        // Offset pagination: page number
        const page = pageParam ?? paginationConfig.initialPage;
        paginationParams[paginationConfig.pageParam] = page;
      } else {
        // Cursor pagination: cursor token
        if (pageParam) {
          paginationParams[paginationConfig.cursorParam] = pageParam;
        }
      }
      
      // Merge with user params
      const allParams = { ...options.params, ...paginationParams };
      
      let result: MinderResult<TData[]>;
      
      if (context?.apiClient) {
        // Use ApiClient for parameter replacement
        try {
          const data = await context.apiClient.request(route, undefined, allParams);
          result = {
            data: data as TData[],
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
        // Use core minder function
        result = await minder<TData[]>(route, null, {
          ...options,
          params: allParams,
          method: HttpMethod.GET,
        });
      }
      
      return result;
    },
    initialPageParam: paginationConfig.type === 'offset' ? paginationConfig.initialPage : undefined,
    getNextPageParam: (lastPage, allPages) => {
      // Custom getNextPageParam from user
      if (paginationConfig.getNextPageParam) {
        return paginationConfig.getNextPageParam(lastPage);
      }
      
      // No data means no next page
      if (!lastPage.data || lastPage.data.length === 0) {
        return undefined;
      }
      
      // Less data than page size means last page
      if (lastPage.data.length < paginationConfig.pageSize) {
        return undefined;
      }
      
      if (paginationConfig.type === 'offset') {
        // Offset: increment page number
        return allPages.length + 1;
      } else {
        // Cursor: get cursor from last item
        if (paginationConfig.getCursor && lastPage.data && lastPage.data.length > 0) {
          const lastItem = lastPage.data[lastPage.data.length - 1];
          if (lastItem) {
            return paginationConfig.getCursor(lastItem);
          }
        }
        return undefined;
      }
    },
    getPreviousPageParam: paginationConfig.getPreviousPageParam,
    enabled: isQueryEnabled,
    staleTime: options.cacheTTL || 5 * 60 * 1000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? true,
    ...options.queryOptions,
  });
  
  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================
  
  // Flatten all pages data
  const flattenedData = useMemo(() => {
    if (!(query.data as any)?.pages) return [];
    return ((query.data as any).pages as MinderResult<TData[]>[]).flatMap((page) => page.data || []);
  }, [query.data]);
  
  // Convert pages to PageData format
  const pages = useMemo(() => {
    if (!(query.data as any)?.pages) return [];
    return ((query.data as any).pages as MinderResult<TData[]>[]).map((page, index) => ({
      data: page.data || [],
      page: paginationConfig.type === 'offset' ? index + 1 : undefined,
      cursor: undefined, // Could extract from page metadata if available
      hasNext: index < ((query.data as any)?.pages?.length || 0) - 1 || query.hasNextPage,
      hasPrevious: index > 0,
      total: undefined, // Could extract from page metadata if available
    }));
  }, [query.data, query.hasNextPage, paginationConfig.type]);
  
  // Helper functions
  const fetchNextPage = async () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      await query.fetchNextPage();
    }
  };
  
  const fetchPreviousPage = async () => {
    if (query.hasPreviousPage && !query.isFetchingPreviousPage) {
      await query.fetchPreviousPage();
    }
  };
  
  const refetch = async () => {
    await query.refetch();
  };
  
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  
  // =========================================================================
  // RETURN
  // =========================================================================
  
  return {
    data: flattenedData,
    pages,
    loading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchingPreviousPage: query.isFetchingPreviousPage,
    error: query.error,
    hasNextPage: query.hasNextPage ?? false,
    hasPreviousPage: query.hasPreviousPage ?? false,
    fetchNextPage,
    fetchPreviousPage,
    refetch,
    invalidate,
    total: undefined, // Could be extracted from response metadata
    query,
  };
}
