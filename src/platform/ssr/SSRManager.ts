/**
 * SSRManager - Server-Side Rendering & Static Site Generation Support
 * 
 * Provides utilities for Next.js SSR, SSG, and ISR:
 * - getServerSideProps helpers
 * - getStaticProps helpers
 * - Incremental Static Regeneration (ISR)
 * - TanStack Query dehydration/hydration
 * - Prefetch utilities
 * - Cookie/header management
 * 
 * @module SSRManager
 */

import { Logger, LogLevel } from '../../utils/Logger.js';
import type {
  GetServerSidePropsContext,
  GetStaticPropsContext,
  SSRConfig,
  SSRContext,
  PrefetchOptions,
  SSRResult,
} from './types.js';

// Re-export types for backward compatibility
export type {
  GetServerSidePropsContext,
  GetStaticPropsContext,
  SSRConfig,
  SSRContext,
  PrefetchOptions,
  SSRResult,
} from './types.js';

const logger = new Logger('SSRManager', { level: LogLevel.WARN });

// Type-only imports - won't be bundled, only used for type checking
import type { QueryClient, DehydratedState } from '@tanstack/react-query';

/**
 * SSRManager - Manages server-side rendering and static generation
 */
export class SSRManager {
  private config: Required<SSRConfig>;
  private queryClient?: QueryClient;

  constructor(config: SSRConfig = {}) {
    this.config = {
      enableSSR: config.enableSSR ?? true,
      enableSSG: config.enableSSG ?? true,
      enableISR: config.enableISR ?? false,
      revalidate: config.revalidate ?? 60,
      prefetchQueries: config.prefetchQueries ?? true,
      timeout: config.timeout ?? 10000,
      gracefulErrors: config.gracefulErrors ?? true,
      onError: config.onError ?? (() => {}),
    };
  }

  /**
   * Set TanStack Query client for prefetching
   */
  setQueryClient(queryClient: QueryClient): void {
    this.queryClient = queryClient;
  }

  /**
   * Get TanStack Query client
   */
  getQueryClient(): QueryClient | undefined {
    return this.queryClient;
  }

  /**
   * Extract SSR context from Next.js context
   */
  extractContext(ctx: GetServerSidePropsContext | GetStaticPropsContext): SSRContext {
    const isSSR = 'req' in ctx;

    if (isSSR) {
      const ssrCtx = ctx as GetServerSidePropsContext;
      return {
        url: ssrCtx.req.url,
        method: ssrCtx.req.method,
        headers: ssrCtx.req.headers as Record<string, string>,
        cookies: ssrCtx.req.cookies,
        query: ssrCtx.query,
        params: ssrCtx.params as Record<string, string>,
        userAgent: ssrCtx.req.headers['user-agent'],
        preview: ssrCtx.preview,
      };
    }

    // SSG context
    const ssgCtx = ctx as GetStaticPropsContext;
    return {
      query: {},
      params: ssgCtx.params as Record<string, string>,
      preview: ssgCtx.preview,
    };
  }

  /**
   * Prefetch queries on the server
   */
  async prefetchQueries(queries: PrefetchOptions[]): Promise<void> {
    if (!this.queryClient || !this.config.prefetchQueries) {
      return;
    }

    const promises = queries.map(async (query) => {
      try {
        await this.queryClient!.prefetchQuery({
          queryKey: query.queryKey,
          queryFn: query.queryFn,
          staleTime: query.staleTime ?? 0,
        });
      } catch (error) {
        if (!this.config.gracefulErrors) {
          throw error;
        }
        logger.error('Error prefetching query:', error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Dehydrate TanStack Query state for client hydration
   */
  dehydrate(): DehydratedState | undefined {
    if (!this.queryClient) {
      return undefined;
    }

    // Import dehydrate dynamically to avoid SSR issues
    try {
      const { dehydrate } = require('@tanstack/react-query');
      return dehydrate(this.queryClient);
    } catch (error) {
      logger.error('Error dehydrating query client:', error);
      return undefined;
    }
  }

  /**
   * Helper for getServerSideProps with automatic prefetching and error handling
   */
  async withServerSideProps<T extends Record<string, unknown>>(
    ctx: GetServerSidePropsContext,
    handler: (context: SSRContext) => Promise<T>,
    queries?: PrefetchOptions[]
  ): Promise<SSRResult<T>> {
    if (!this.config.enableSSR) {
      return { props: {} as T };
    }

    const ssrContext = this.extractContext(ctx);

    try {
      // Prefetch queries if provided
      if (queries && queries.length > 0) {
        await this.prefetchQueries(queries);
      }

      // Execute handler with timeout
      const props = await this.withTimeout(
        handler(ssrContext),
        this.config.timeout
      );

      // Add dehydrated state
      const dehydratedState = this.dehydrate();

      return {
        props: {
          ...props,
          ...(dehydratedState && { dehydratedState }),
        },
      };
    } catch (error) {
      this.config.onError(error as Error, ssrContext);

      if (!this.config.gracefulErrors) {
        throw error;
      }

      // Return empty props on error
      return {
        props: {} as T,
      };
    }
  }

  /**
   * Helper for getStaticProps with automatic prefetching and ISR support
   */
  async withStaticProps<T extends Record<string, unknown>>(
    ctx: GetStaticPropsContext,
    handler: (context: SSRContext) => Promise<T>,
    queries?: PrefetchOptions[]
  ): Promise<SSRResult<T>> {
    if (!this.config.enableSSG) {
      return { props: {} as T };
    }

    const ssrContext = this.extractContext(ctx);

    try {
      // Prefetch queries if provided
      if (queries && queries.length > 0) {
        await this.prefetchQueries(queries);
      }

      // Execute handler with timeout
      const props = await this.withTimeout(
        handler(ssrContext),
        this.config.timeout
      );

      // Add dehydrated state
      const dehydratedState = this.dehydrate();

      const result: SSRResult<T> = {
        props: {
          ...props,
          ...(dehydratedState && { dehydratedState }),
        },
      };

      // Add ISR revalidation if enabled
      if (this.config.enableISR && this.config.revalidate !== false) {
        result.revalidate = this.config.revalidate;
      }

      return result;
    } catch (error) {
      this.config.onError(error as Error, ssrContext);

      if (!this.config.gracefulErrors) {
        throw error;
      }

      // Return empty props on error
      return {
        props: {} as T,
      };
    }
  }

  /**
   * Get static paths helper
   */
  async withStaticPaths<T extends string | number>(
    handler: () => Promise<T[]>,
    options: {
      fallback?: boolean | 'blocking';
    } = {}
  ): Promise<{
    paths: Array<{ params: Record<string, T> }>;
    fallback: boolean | 'blocking';
  }> {
    try {
      const ids = await this.withTimeout(handler(), this.config.timeout);

      // Assume the parameter name is 'id' by convention
      const paths = ids.map((id) => ({
        params: { id } as Record<string, T>,
      }));

      return {
        paths,
        fallback: options.fallback ?? false,
      };
    } catch (error) {
      logger.error('Error generating static paths:', error);

      return {
        paths: [],
        fallback: options.fallback ?? 'blocking',
      };
    }
  }

  /**
   * Execute promise with timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('SSR timeout')), timeout)
      ),
    ]);
  }

  /**
   * Check if running on server
   */
  static isServer(): boolean {
    return typeof window === 'undefined';
  }

  /**
   * Check if running on client
   */
  static isClient(): boolean {
    return typeof window !== 'undefined';
  }

  /**
   * Get request headers from context
   */
  static getHeaders(ctx: GetServerSidePropsContext): Record<string, string> {
    return ctx.req.headers as Record<string, string>;
  }

  /**
   * Get cookies from context
   */
  static getCookies(ctx: GetServerSidePropsContext): Record<string, string> {
    return ctx.req.cookies;
  }

  /**
   * Get cookie value
   */
  static getCookie(
    ctx: GetServerSidePropsContext,
    name: string
  ): string | undefined {
    return ctx.req.cookies[name];
  }

  /**
   * Get user agent from context
   */
  static getUserAgent(ctx: GetServerSidePropsContext): string | undefined {
    return ctx.req.headers['user-agent'];
  }

  /**
   * Check if request is from mobile device
   */
  static isMobile(ctx: GetServerSidePropsContext): boolean {
    const userAgent = this.getUserAgent(ctx);
    if (!userAgent) return false;

    return /mobile|android|iphone|ipad|phone/i.test(userAgent);
  }

  /**
   * Redirect helper for SSR
   */
  static redirect(
    destination: string,
    permanent = false
  ): { redirect: { destination: string; permanent: boolean } } {
    return {
      redirect: {
        destination,
        permanent,
      },
    };
  }

  /**
   * Not found helper for SSR
   */
  static notFound(): { notFound: true } {
    return {
      notFound: true,
    };
  }
}

/**
 * Create SSRManager instance
 */
export function createSSRManager(config?: SSRConfig): SSRManager {
  return new SSRManager(config);
}

/**
 * Default SSRManager instance
 */
export const ssrManager = createSSRManager();
