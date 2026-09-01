import { Logger, LogLevel } from '../utils/Logger.js';
import type { MinderConfig } from '../core/types.js';
import { normalizeHttpMethod } from '../core/apiClient/resolveRequest.js';
import { hasUnreplacedParams } from '../utils/routeHelpers.js';

const logger = /*#__PURE__*/ new Logger('SSR', { level: LogLevel.WARN });

export interface SSROptions {
  prefetch?: string[];
  hydrate?: boolean;
  fallback?: any;
}

export function createSSRConfig(config: MinderConfig, options: SSROptions = {}) {
  return {
    ...config,
    ssr: {
      enabled: true,
      prefetch: options.prefetch || [],
      hydrate: options.hydrate !== false,
      fallback: options.fallback
    }
  };
}

export async function prefetchData(config: MinderConfig, routes: string[]) {
  const data: Record<string, unknown> = {};

  for (const routeName of routes) {
    const route = config.routes[routeName];
    if (!route) continue;

    // fix-2.2.0-blockers (ResolvedRequest migration): this is a genuine
    // dispatch path (a real `fetch()` below) that used to read the DECLARED
    // `route.method`/`route.url` straight off the registry with no
    // normalization or placeholder check — the same defect class fixed
    // throughout ApiClient/minder(). `normalizeHttpMethod` closes the
    // case-sensitivity gap (a hand-authored route can declare
    // `method: 'get'`). `prefetchData` has no mechanism to supply per-route
    // params, so a route whose URL still carries an unresolved ':param'
    // placeholder can never be safely prefetched here — REFUSE (skip + warn)
    // rather than fetch the literal, unresolved URL (which would either
    // 404 or, worse, silently hit whatever resource happens to live at that
    // literal path).
    if (normalizeHttpMethod(route.method) !== 'GET') continue;
    if (hasUnreplacedParams(route.url)) {
      logger.warn(
        `Skipping prefetch for "${routeName}": route URL "${route.url}" has an unresolved parameter and prefetchData() has no way to supply it.`
      );
      continue;
    }

    try {
      const url = `${config.apiBaseUrl}${route.url}`;
      const response = await fetch(url, { method: 'GET' });
      data[routeName] = await response.json();
    } catch (error) {
      logger.warn(`Failed to prefetch ${routeName}:`, error);
    }
  }

  return data;
}

export function withSSR<T = any>(routeName: string, fallback?: T) {
  return {
    routeName,
    fallback,
    ssr: true
  };
}

export function withCSR(routeName: string) {
  return {
    routeName,
    ssr: false
  };
}

// Re-export TanStack Query hydration tools
import { dehydrate, HydrationBoundary, QueryClient, QueryClientProvider } from '@tanstack/react-query';
export { dehydrate, HydrationBoundary, QueryClient, QueryClientProvider };

/**
 * Helper to prefetch data and return dehydrated state for SSR
 * @example
 * const state = await getDehydratedState([
 *   queryClient.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
 * ]);
 */
export async function getDehydratedState(
  queryClient: any,
  prefetchPromises: Promise<any>[]
): Promise<Record<string, any>> {
  await Promise.all(prefetchPromises);
  return dehydrate(queryClient);
}