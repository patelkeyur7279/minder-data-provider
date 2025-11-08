import { QueryClient } from '@tanstack/react-query';
import type { DebugManager } from '../debug/DebugManager.js';

export class CacheManager {
  private queryClient: QueryClient;
  private debugManager?: DebugManager;
  private enableLogs: boolean;

  constructor(queryClient: QueryClient, debugManager?: DebugManager, enableLogs: boolean = false) {
    this.queryClient = queryClient;
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
  }

  // Get cached data for a specific query
  getCachedData<T = any>(queryKey: string | string[]): T | undefined {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    const data = this.queryClient.getQueryData<T>(key);
    
    if (this.debugManager && this.enableLogs) {
      const emoji = data ? '✅' : '❌';
      const status = data ? 'HIT' : 'MISS';
      this.debugManager.log('cache', `${emoji} CACHE ${status} ${JSON.stringify(key)}`, {
        queryKey: key,
        hasData: !!data,
        dataSize: data ? JSON.stringify(data).length : 0,
      });
    }
    
    return data;
  }

  // Set cached data for a specific query
  setCachedData<T = any>(queryKey: string | string[], data: T): void {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    this.queryClient.setQueryData<T>(key, data);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log('cache', `💾 CACHE SET ${JSON.stringify(key)}`, {
        queryKey: key,
        dataSize: JSON.stringify(data).length,
      });
    }
  }

  // Invalidate specific queries
  invalidateQueries(queryKey?: string | string[]): Promise<void> {
    if (this.debugManager && this.enableLogs) {
      const keyStr = queryKey ? JSON.stringify(Array.isArray(queryKey) ? queryKey : [queryKey]) : 'ALL';
      this.debugManager.log('cache', `🔄 CACHE INVALIDATE ${keyStr}`, { queryKey });
    }
    
    if (queryKey) {
      const key = Array.isArray(queryKey) ? queryKey : [queryKey];
      return this.queryClient.invalidateQueries({ queryKey: key });
    }
    return this.queryClient.invalidateQueries();
  }

  // Remove specific queries from cache
  removeQueries(queryKey: string | string[]): void {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    this.queryClient.removeQueries({ queryKey: key });
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log('cache', `🗑️ CACHE REMOVE ${JSON.stringify(key)}`, { queryKey: key });
    }
  }

  // Clear all cache
  clearCache(queryKey?: string | string[]): void {
    if (queryKey) {
      this.removeQueries(queryKey);
    } else {
      this.queryClient.clear();
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log('cache', '🗑️ CACHE CLEAR ALL', {});
      }
    }
  }

  // Get all cached queries
  getAllCachedQueries(): any[] {
    return this.queryClient.getQueryCache().getAll();
  }

  // Prefetch data
  async prefetchQuery<T = any>(
    queryKey: string | string[],
    queryFn: () => Promise<T>,
    options?: { staleTime?: number; gcTime?: number }
  ): Promise<void> {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log('cache', `⏬ CACHE PREFETCH ${JSON.stringify(key)}`, {
        queryKey: key,
        staleTime: options?.staleTime,
        gcTime: options?.gcTime,
      });
    }
    
    await this.queryClient.prefetchQuery({
      queryKey: key,
      queryFn,
      staleTime: options?.staleTime,
      gcTime: options?.gcTime,
    });
  }

  // Check if query is cached and fresh
  isQueryFresh(queryKey: string | string[]): boolean {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    const query = this.queryClient.getQueryState(key);
    return query ? !query.isInvalidated && query.dataUpdatedAt > Date.now() - (query.dataUpdateCount * 1000) : false;
  }

  // Get query state
  getQueryState(queryKey: string | string[]): any {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    return this.queryClient.getQueryState(key);
  }

  // Optimistic update
  async optimisticUpdate<T = any>(
    queryKey: string | string[],
    updater: (oldData: T | undefined) => T,
    rollbackFn?: () => void
  ): Promise<void> {
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    
    // Cancel outgoing refetches
    await this.queryClient.cancelQueries({ queryKey: key });

    // Snapshot previous value
    const previousData = this.queryClient.getQueryData<T>(key);

    // Optimistically update
    this.queryClient.setQueryData<T>(key, updater);

    // Return context with rollback function
    return Promise.resolve().catch(() => {
      // Rollback on error
      this.queryClient.setQueryData<T>(key, previousData);
      if (rollbackFn) rollbackFn();
    });
  }
}