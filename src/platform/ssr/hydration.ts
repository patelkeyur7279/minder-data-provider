/**
 * Hydration Utilities for Client-Side
 * 
 * Provides helpers for hydrating TanStack Query state
 * on the client after SSR/SSG.
 * 
 * @module hydration
 */

import { Logger, LogLevel } from '../../utils/Logger.js';
import type { QueryClient, DehydratedState } from '@tanstack/react-query';

const logger = new Logger('Hydration', { level: LogLevel.WARN });

/**
 * Hydration configuration
 */
export interface HydrationConfig {
  /**
   * Enable automatic hydration
   * @default true
   */
  autoHydrate?: boolean;

  /**
   * Clear stale queries after hydration
   * @default false
   */
  clearStaleQueries?: boolean;

  /**
   * Default stale time for hydrated queries (ms)
   * @default 0
   */
  defaultStaleTime?: number;

  /**
   * Callback after successful hydration
   */
  onHydrate?: (queryClient: QueryClient) => void;

  /**
   * Callback on hydration error
   */
  onError?: (error: Error) => void;
}

/**
 * Hydration manager for client-side state restoration
 */
export class HydrationManager {
  private config: Required<HydrationConfig>;
  private hydrated = false;

  constructor(config: HydrationConfig = {}) {
    this.config = {
      autoHydrate: config.autoHydrate ?? true,
      clearStaleQueries: config.clearStaleQueries ?? false,
      defaultStaleTime: config.defaultStaleTime ?? 0,
      onHydrate: config.onHydrate ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };
  }

  /**
   * Hydrate query client with dehydrated state
   */
  hydrate(
    queryClient: QueryClient,
    dehydratedState: DehydratedState | undefined
  ): void {
    if (!dehydratedState) {
      return;
    }

    if (this.hydrated && !this.config.clearStaleQueries) {
      logger.warn('QueryClient already hydrated');
      return;
    }

    try {
      // Import hydrate dynamically to avoid SSR issues
      const { hydrate } = require('@tanstack/react-query');

      // Hydrate the query client
      hydrate(queryClient, dehydratedState);

      // Clear stale queries if configured
      if (this.config.clearStaleQueries) {
        queryClient.clear();
      }

      // Set default stale time for hydrated queries
      if (this.config.defaultStaleTime > 0) {
        dehydratedState.queries.forEach((query) => {
          queryClient.setQueryDefaults(query.queryKey, {
            staleTime: this.config.defaultStaleTime,
          });
        });
      }

      this.hydrated = true;
      this.config.onHydrate(queryClient);
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  }

  /**
   * Check if already hydrated
   */
  isHydrated(): boolean {
    return this.hydrated;
  }

  /**
   * Reset hydration state
   */
  reset(): void {
    this.hydrated = false;
  }
}

/**
 * Create hydration manager
 */
export function createHydrationManager(
  config?: HydrationConfig
): HydrationManager {
  return new HydrationManager(config);
}

/**
 * Hydrate query client (convenience function)
 */
export function hydrateQueryClient(
  queryClient: QueryClient,
  dehydratedState: DehydratedState | undefined,
  config?: HydrationConfig
): void {
  const manager = createHydrationManager(config);
  manager.hydrate(queryClient, dehydratedState);
}

/**
 * Extract dehydrated state from page props
 */
export function extractDehydratedState<T extends Record<string, unknown>>(
  props: T
): DehydratedState | undefined {
  if (!props || typeof props !== 'object') {
    return undefined;
  }

  return (props as any).dehydratedState;
}

/**
 * Check if running on client
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if running on server
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Wait for hydration to complete
 * Useful for animations or effects that should wait for data
 */
export function waitForHydration(
  queryClient: QueryClient,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkHydration = (): void => {
      const hasQueries = queryClient.getQueryCache().getAll().length > 0;

      if (hasQueries) {
        resolve();
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error('Hydration timeout'));
        return;
      }

      setTimeout(checkHydration, 100);
    };

    checkHydration();
  });
}

/**
 * Get hydrated query count
 */
export function getHydratedQueryCount(queryClient: QueryClient): number {
  return queryClient.getQueryCache().getAll().length;
}

/**
 * Get hydrated query keys
 */
export function getHydratedQueryKeys(queryClient: QueryClient): unknown[][] {
  return queryClient.getQueryCache().getAll().map((query) => query.queryKey as unknown[]);
}

/**
 * Clear all hydrated queries
 */
export function clearHydratedQueries(queryClient: QueryClient): void {
  queryClient.clear();
}

/**
 * Invalidate hydrated queries
 */
export function invalidateHydratedQueries(
  queryClient: QueryClient,
  queryKey?: unknown[]
): Promise<void> {
  if (queryKey) {
    return queryClient.invalidateQueries({ queryKey });
  }

  return queryClient.invalidateQueries();
}

/**
 * Refetch hydrated queries
 */
export function refetchHydratedQueries(
  queryClient: QueryClient,
  queryKey?: unknown[]
): Promise<void> {
  if (queryKey) {
    return queryClient.refetchQueries({ queryKey });
  }

  return queryClient.refetchQueries();
}

/**
 * Default hydration manager instance
 */
export const hydrationManager = createHydrationManager();
