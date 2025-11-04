/**
 * Prefetch Utilities for SSR/SSG
 * 
 * Provides helpers for prefetching data on the server
 * and optimizing initial page load.
 * 
 * @module prefetch
 */

import type { QueryClient } from '@tanstack/react-query';

/**
 * Prefetch configuration
 */
export interface PrefetchConfig {
  /**
   * Query key
   */
  queryKey: unknown[];

  /**
   * Query function that fetches data
   */
  queryFn: () => Promise<unknown>;

  /**
   * Stale time in milliseconds
   * @default 0
   */
  staleTime?: number;

  /**
   * Cache time in milliseconds
   * @default 5 * 60 * 1000 (5 minutes)
   */
  cacheTime?: number;

  /**
   * Retry failed queries
   * @default false
   */
  retry?: boolean | number;
}

/**
 * Batch prefetch configuration
 */
export interface BatchPrefetchConfig {
  /**
   * Maximum concurrent prefetch operations
   * @default 5
   */
  maxConcurrency?: number;

  /**
   * Timeout for each prefetch operation (ms)
   * @default 5000
   */
  timeout?: number;

  /**
   * Continue on error (don't throw)
   * @default true
   */
  continueOnError?: boolean;
}

/**
 * Prefetch result
 */
export interface PrefetchResult {
  /**
   * Query key
   */
  queryKey: unknown[];

  /**
   * Success status
   */
  success: boolean;

  /**
   * Error if failed
   */
  error?: Error;

  /**
   * Duration in milliseconds
   */
  duration: number;
}

/**
 * Prefetch a single query
 */
export async function prefetchQuery(
  queryClient: QueryClient,
  config: PrefetchConfig
): Promise<PrefetchResult> {
  const startTime = Date.now();

  try {
    await queryClient.prefetchQuery({
      queryKey: config.queryKey,
      queryFn: config.queryFn,
      staleTime: config.staleTime ?? 0,
      retry: config.retry ?? false,
    } as any);

    return {
      queryKey: config.queryKey,
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      queryKey: config.queryKey,
      success: false,
      error: error as Error,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Prefetch multiple queries in batch
 */
export async function batchPrefetch(
  queryClient: QueryClient,
  queries: PrefetchConfig[],
  options: BatchPrefetchConfig = {}
): Promise<PrefetchResult[]> {
  const {
    maxConcurrency = 5,
    timeout = 5000,
    continueOnError = true,
  } = options;

  const results: PrefetchResult[] = [];
  const chunks: PrefetchConfig[][] = [];

  // Split queries into chunks based on max concurrency
  for (let i = 0; i < queries.length; i += maxConcurrency) {
    chunks.push(queries.slice(i, i + maxConcurrency));
  }

  // Process chunks sequentially, queries within chunks in parallel
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (query) => {
        try {
          // Add timeout to each prefetch
          const result = await Promise.race([
            prefetchQuery(queryClient, query),
            new Promise<PrefetchResult>((_, reject) =>
              setTimeout(
                () => reject(new Error('Prefetch timeout')),
                timeout
              )
            ),
          ]);

          return result;
        } catch (error) {
          if (!continueOnError) {
            throw error;
          }

          return {
            queryKey: query.queryKey,
            success: false,
            error: error as Error,
            duration: timeout,
          };
        }
      })
    );

    results.push(...chunkResults);
  }

  return results;
}

/**
 * Prefetch queries with dependencies
 * Executes queries in order, passing results to dependent queries
 */
export async function prefetchWithDependencies(
  queryClient: QueryClient,
  queries: Array<{
    config: PrefetchConfig;
    dependsOn?: unknown[][];
  }>
): Promise<PrefetchResult[]> {
  const results: PrefetchResult[] = [];
  const cache = new Map<string, unknown>();

  for (const { config, dependsOn } of queries) {
    // Wait for dependencies to complete
    if (dependsOn && dependsOn.length > 0) {
      const allDepsResolved = dependsOn.every((depKey) => {
        const key = JSON.stringify(depKey);
        return cache.has(key);
      });

      if (!allDepsResolved) {
        results.push({
          queryKey: config.queryKey,
          success: false,
          error: new Error('Dependencies not resolved'),
          duration: 0,
        });
        continue;
      }
    }

    // Execute query
    const result = await prefetchQuery(queryClient, config);
    results.push(result);

    // Cache result for dependent queries
    if (result.success) {
      const key = JSON.stringify(config.queryKey);
      const data = queryClient.getQueryData(config.queryKey);
      cache.set(key, data);
    }
  }

  return results;
}

/**
 * Prefetch infinite query for pagination
 */
export async function prefetchInfiniteQuery(
  queryClient: QueryClient,
  config: Omit<PrefetchConfig, 'queryFn'> & {
    queryFn: (pageParam: number) => Promise<unknown>;
    pages?: number;
  }
): Promise<PrefetchResult> {
  const { pages = 1, queryFn, ...restConfig } = config;
  const startTime = Date.now();

  try {
    await queryClient.prefetchInfiniteQuery({
      queryKey: restConfig.queryKey,
      queryFn: ({ pageParam = 0 }) => queryFn(pageParam as number),
      getNextPageParam: (lastPage: any, allPages: any[]) => {
        return allPages.length < pages ? allPages.length : undefined;
      },
      pages,
    } as any);

    return {
      queryKey: restConfig.queryKey,
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      queryKey: restConfig.queryKey,
      success: false,
      error: error as Error,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Warmup cache with initial data
 */
export function warmupCache(
  queryClient: QueryClient,
  data: Array<{
    queryKey: unknown[];
    data: unknown;
    staleTime?: number;
  }>
): void {
  data.forEach(({ queryKey, data: initialData, staleTime }) => {
    queryClient.setQueryData(queryKey, initialData, {
      updatedAt: Date.now(),
    } as any);

    if (staleTime !== undefined) {
      queryClient.setQueryDefaults(queryKey, {
        staleTime,
      });
    }
  });
}

/**
 * Get prefetch statistics
 */
export function getPrefetchStats(results: PrefetchResult[]): {
  total: number;
  successful: number;
  failed: number;
  totalDuration: number;
  averageDuration: number;
  errors: Error[];
} {
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const errors = results
    .filter((r) => r.error)
    .map((r) => r.error) as Error[];

  return {
    total: results.length,
    successful,
    failed,
    totalDuration,
    averageDuration: totalDuration / results.length || 0,
    errors,
  };
}
