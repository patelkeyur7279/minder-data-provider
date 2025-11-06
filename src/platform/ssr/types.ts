/**
 * Type definitions for SSR Manager
 */

// Type-only imports - won't be bundled, only used for type checking
import type { DehydratedState } from '@tanstack/react-query';

// Next.js types - optional peer dependency
export type GetServerSidePropsContext = any;
export type GetStaticPropsContext = any;

/**
 * SSR Configuration Options
 */
export interface SSRConfig {
  /**
   * Enable server-side rendering
   * @default true
   */
  enableSSR?: boolean;

  /**
   * Enable static site generation
   * @default true
   */
  enableSSG?: boolean;

  /**
   * Enable Incremental Static Regeneration
   * @default false
   */
  enableISR?: boolean;

  /**
   * ISR revalidation time in seconds
   * @default 60
   */
  revalidate?: number | false;

  /**
   * Prefetch queries on server
   * @default true
   */
  prefetchQueries?: boolean;

  /**
   * Timeout for server-side data fetching (ms)
   * @default 10000
   */
  timeout?: number;

  /**
   * Handle errors gracefully (return empty data instead of throwing)
   * @default true
   */
  gracefulErrors?: boolean;

  /**
   * Custom error handler
   */
  onError?: (error: Error, context: SSRContext) => void;
}

/**
 * SSR Context Information
 */
export interface SSRContext {
  /**
   * Request URL
   */
  url?: string;

  /**
   * Request method
   */
  method?: string;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Request cookies
   */
  cookies?: Record<string, string>;

  /**
   * Query parameters
   */
  query?: Record<string, string | string[]>;

  /**
   * Route parameters
   */
  params?: Record<string, string>;

  /**
   * User agent
   */
  userAgent?: string;

  /**
   * Is preview mode
   */
  preview?: boolean;
}

/**
 * Prefetch Query Options
 */
export interface PrefetchOptions {
  /**
   * Query key
   */
  queryKey: unknown[];

  /**
   * Query function
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
}

/**
 * SSR Result with dehydrated state
 */
export interface SSRResult<T = unknown> {
  /**
   * Props to pass to page component
   */
  props: T & {
    dehydratedState?: DehydratedState;
  };

  /**
   * Revalidation time for ISR
   */
  revalidate?: number | false;

  /**
   * Redirect configuration
   */
  redirect?: {
    destination: string;
    permanent: boolean;
  };

  /**
   * Not found flag
   */
  notFound?: boolean;
}
