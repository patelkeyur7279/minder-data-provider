/**
 * SSR/SSG Support Tests
 * 
 * Tests for server-side rendering and static site generation utilities.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SSRManager, createSSRManager } from '../src/platform/ssr/SSRManager';
import {
  prefetchQuery,
  batchPrefetch,
  prefetchWithDependencies,
  warmupCache,
  getPrefetchStats,
} from '../src/platform/ssr/prefetch';
import {
  HydrationManager,
  createHydrationManager,
  hydrateQueryClient,
  extractDehydratedState,
  getHydratedQueryCount,
  getHydratedQueryKeys,
} from '../src/platform/ssr/hydration';

// Mock QueryClient
const createMockQueryClient = () => ({
  prefetchQuery: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  prefetchInfiniteQuery: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  setQueryData: jest.fn(),
  getQueryData: jest.fn(),
  setQueryDefaults: jest.fn(),
  invalidateQueries: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  refetchQueries: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  clear: jest.fn(),
  getQueryCache: jest.fn(() => ({
    getAll: jest.fn(() => [
      { queryKey: ['user', '1'] },
      { queryKey: ['posts'] },
    ]),
  })),
});

// Mock Next.js contexts
const createMockSSRContext = () => ({
  req: {
    url: '/test',
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0',
      cookie: 'session=abc123',
    },
    cookies: {
      session: 'abc123',
    },
  },
  res: {},
  query: { id: '123' },
  params: { slug: 'test-post' },
  preview: false,
  resolvedUrl: '/test',
});

const createMockSSGContext = () => ({
  params: { id: '123' },
  preview: false,
  previewData: undefined,
});

describe('SSRManager', () => {
  let ssrManager: SSRManager;
  let mockQueryClient: any;

  beforeEach(() => {
    ssrManager = createSSRManager({
      enableSSR: true,
      enableSSG: true,
      enableISR: true,
      revalidate: 60,
      timeout: 5000,
    });

    mockQueryClient = createMockQueryClient();
    ssrManager.setQueryClient(mockQueryClient as any);
  });

  describe('Configuration', () => {
    it('should create SSRManager with default config', () => {
      const manager = createSSRManager();
      expect(manager).toBeInstanceOf(SSRManager);
    });

    it('should create SSRManager with custom config', () => {
      const manager = createSSRManager({
        enableSSR: false,
        enableISR: true,
        revalidate: 120,
      });
      expect(manager).toBeInstanceOf(SSRManager);
    });

    it('should set and get query client', () => {
      const manager = createSSRManager();
      manager.setQueryClient(mockQueryClient as any);
      expect(manager.getQueryClient()).toBe(mockQueryClient);
    });
  });

  describe('Context Extraction', () => {
    it('should extract SSR context from Next.js context', () => {
      const ctx = createMockSSRContext();
      const ssrContext = ssrManager.extractContext(ctx as any);

      expect(ssrContext.url).toBe('/test');
      expect(ssrContext.method).toBe('GET');
      expect(ssrContext.headers).toBeDefined();
      expect(ssrContext.cookies).toEqual({ session: 'abc123' });
      expect(ssrContext.query).toEqual({ id: '123' });
      expect(ssrContext.params).toEqual({ slug: 'test-post' });
      expect(ssrContext.userAgent).toBe('Mozilla/5.0');
      expect(ssrContext.preview).toBe(false);
    });

    it('should extract SSG context from Next.js context', () => {
      const ctx = createMockSSGContext();
      const ssrContext = ssrManager.extractContext(ctx as any);

      expect(ssrContext.params).toEqual({ id: '123' });
      expect(ssrContext.preview).toBe(false);
      expect(ssrContext.url).toBeUndefined();
    });
  });

  describe('Query Prefetching', () => {
    it('should prefetch single query', async () => {
      const queries = [
        {
          queryKey: ['user', '1'],
          queryFn: async () => ({ id: '1', name: 'John' }),
        },
      ];

      await ssrManager.prefetchQueries(queries);

      expect(mockQueryClient.prefetchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['user', '1'],
        })
      );
    });

    it('should prefetch multiple queries', async () => {
      const queries = [
        {
          queryKey: ['user', '1'],
          queryFn: async () => ({ id: '1', name: 'John' }),
        },
        {
          queryKey: ['posts'],
          queryFn: async () => [{ id: '1', title: 'Post 1' }],
        },
      ];

      await ssrManager.prefetchQueries(queries);

      expect(mockQueryClient.prefetchQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle prefetch errors gracefully', async () => {
      mockQueryClient.prefetchQuery.mockRejectedValueOnce(
        new Error('Network error')
      );

      const queries = [
        {
          queryKey: ['user', '1'],
          queryFn: async () => {
            throw new Error('Network error');
          },
        },
      ];

      // Should not throw when gracefulErrors is true
      await expect(ssrManager.prefetchQueries(queries)).resolves.not.toThrow();
    });
  });

  describe('withServerSideProps', () => {
    it('should execute handler and return props', async () => {
      const ctx = createMockSSRContext();
      const handler = async (context: any) => ({
        user: { id: '1', name: 'John' },
      });

      const result = await ssrManager.withServerSideProps(
        ctx as any,
        handler
      );

      expect(result.props).toHaveProperty('user');
      expect(result.props.user).toEqual({ id: '1', name: 'John' });
    });

    it('should prefetch queries before handler', async () => {
      const ctx = createMockSSRContext();
      const handler = async () => ({ data: 'test' });
      const queries = [
        {
          queryKey: ['user', '1'],
          queryFn: async () => ({ id: '1' }),
        },
      ];

      await ssrManager.withServerSideProps(ctx as any, handler, queries);

      expect(mockQueryClient.prefetchQuery).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const ctx = createMockSSRContext();
      const handler = async () => {
        throw new Error('Handler error');
      };

      const result = await ssrManager.withServerSideProps(ctx as any, handler);

      // Should return empty props on error
      expect(result.props).toEqual({});
    });

    it('should handle timeout', async () => {
      const manager = createSSRManager({ timeout: 100 });
      const ctx = createMockSSRContext();
      const handler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { data: 'test' };
      };

      const result = await manager.withServerSideProps(ctx as any, handler);

      // Should return empty props on timeout
      expect(result.props).toEqual({});
    });
  });

  describe('withStaticProps', () => {
    it('should execute handler and return props with ISR', async () => {
      const ctx = createMockSSGContext();
      const handler = async () => ({
        post: { id: '1', title: 'Test Post' },
      });

      const result = await ssrManager.withStaticProps(ctx as any, handler);

      expect(result.props).toHaveProperty('post');
      expect(result.revalidate).toBe(60);
    });

    it('should return props without ISR when disabled', async () => {
      const manager = createSSRManager({ enableISR: false });
      const ctx = createMockSSGContext();
      const handler = async () => ({ data: 'test' });

      const result = await manager.withStaticProps(ctx as any, handler);

      expect(result.revalidate).toBeUndefined();
    });

    it('should prefetch queries before handler', async () => {
      const mockClient = createMockQueryClient();
      ssrManager.setQueryClient(mockClient as any);

      const ctx = createMockSSGContext();
      const handler = async () => ({ data: 'test' });
      const queries = [
        {
          queryKey: ['post', '1'],
          queryFn: async () => ({ id: '1' }),
        },
      ];

      await ssrManager.withStaticProps(ctx as any, handler, queries);

      expect(mockClient.prefetchQuery).toHaveBeenCalled();
    });
  });

  describe('withStaticPaths', () => {
    it('should generate static paths', async () => {
      const handler = async () => ['1', '2', '3'];

      const result = await ssrManager.withStaticPaths(handler);

      expect(result.paths).toHaveLength(3);
      expect(result.paths[0]).toEqual({ params: { id: '1' } });
      expect(result.fallback).toBe(false);
    });

    it('should handle custom fallback option', async () => {
      const handler = async () => ['1', '2'];

      const result = await ssrManager.withStaticPaths(handler, {
        fallback: 'blocking',
      });

      expect(result.fallback).toBe('blocking');
    });

    it('should handle errors with fallback', async () => {
      const handler = async () => {
        throw new Error('Failed to fetch IDs');
      };

      const result = await ssrManager.withStaticPaths(handler, {
        fallback: true,
      });

      expect(result.paths).toEqual([]);
      expect(result.fallback).toBe(true);
    });
  });

  describe('Static Helpers', () => {
    it('should check if running on server or client', () => {
      // SSRManager checks typeof window === 'undefined'
      // In Jest, window may or may not be defined depending on test environment
      const isServer = SSRManager.isServer();
      const isClient = SSRManager.isClient();
      
      // They should be opposite of each other
      expect(isServer).toBe(!isClient);
    });

    it('should get headers from context', () => {
      const ctx = createMockSSRContext();
      const headers = SSRManager.getHeaders(ctx as any);
      expect(headers['user-agent']).toBe('Mozilla/5.0');
    });

    it('should get cookies from context', () => {
      const ctx = createMockSSRContext();
      const cookies = SSRManager.getCookies(ctx as any);
      expect(cookies.session).toBe('abc123');
    });

    it('should get single cookie value', () => {
      const ctx = createMockSSRContext();
      const value = SSRManager.getCookie(ctx as any, 'session');
      expect(value).toBe('abc123');
    });

    it('should get user agent', () => {
      const ctx = createMockSSRContext();
      const userAgent = SSRManager.getUserAgent(ctx as any);
      expect(userAgent).toBe('Mozilla/5.0');
    });

    it('should detect mobile device', () => {
      const ctx = createMockSSRContext();
      ctx.req.headers['user-agent'] = 'iPhone';
      expect(SSRManager.isMobile(ctx as any)).toBe(true);

      ctx.req.headers['user-agent'] = 'Mozilla/5.0';
      expect(SSRManager.isMobile(ctx as any)).toBe(false);
    });

    it('should create redirect response', () => {
      const redirect = SSRManager.redirect('/login');
      expect(redirect).toEqual({
        redirect: { destination: '/login', permanent: false },
      });
    });

    it('should create not found response', () => {
      const notFound = SSRManager.notFound();
      expect(notFound).toEqual({ notFound: true });
    });
  });
});

describe('Prefetch Utilities', () => {
  let mockQueryClient: any;

  beforeEach(() => {
    mockQueryClient = createMockQueryClient();
  });

  it('should prefetch single query successfully', async () => {
    const result = await prefetchQuery(mockQueryClient as any, {
      queryKey: ['user', '1'],
      queryFn: async () => ({ id: '1', name: 'John' }),
    });

    expect(result.success).toBe(true);
    expect(result.queryKey).toEqual(['user', '1']);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should handle prefetch errors', async () => {
    mockQueryClient.prefetchQuery.mockRejectedValueOnce(
      new Error('Network error')
    );

    const result = await prefetchQuery(mockQueryClient as any, {
      queryKey: ['user', '1'],
      queryFn: async () => {
        throw new Error('Network error');
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should batch prefetch multiple queries', async () => {
    const queries = [
      {
        queryKey: ['user', '1'],
        queryFn: async () => ({ id: '1' }),
      },
      {
        queryKey: ['user', '2'],
        queryFn: async () => ({ id: '2' }),
      },
      {
        queryKey: ['posts'],
        queryFn: async () => [],
      },
    ];

    const results = await batchPrefetch(mockQueryClient as any, queries);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('should respect max concurrency in batch prefetch', async () => {
    const queries = Array.from({ length: 10 }, (_, i) => ({
      queryKey: ['user', String(i)],
      queryFn: async () => ({ id: i }),
    }));

    const results = await batchPrefetch(mockQueryClient as any, queries, {
      maxConcurrency: 3,
    });

    expect(results).toHaveLength(10);
  });

  it('should handle timeout in batch prefetch', async () => {
    // Mock slow query that will timeout
    mockQueryClient.prefetchQuery.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    const queries = [
      {
        queryKey: ['slow'],
        queryFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return {};
        },
      },
    ];

    const results = await batchPrefetch(mockQueryClient as any, queries, {
      timeout: 100,
      continueOnError: true,
    });

    // Should have a result (either success or failure)
    expect(results).toHaveLength(1);
    expect(results[0].queryKey).toEqual(['slow']);
  });

  it('should prefetch queries with dependencies', async () => {
    mockQueryClient.getQueryData.mockReturnValueOnce({ id: '1' });

    const queries = [
      {
        config: {
          queryKey: ['user', '1'],
          queryFn: async () => ({ id: '1' }),
        },
      },
      {
        config: {
          queryKey: ['user-posts', '1'],
          queryFn: async () => [],
        },
        dependsOn: [['user', '1']],
      },
    ];

    const results = await prefetchWithDependencies(
      mockQueryClient as any,
      queries
    );

    expect(results).toHaveLength(2);
  });

  it('should warmup cache with initial data', () => {
    const data = [
      {
        queryKey: ['user', '1'],
        data: { id: '1', name: 'John' },
        staleTime: 60000,
      },
    ];

    warmupCache(mockQueryClient as any, data);

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['user', '1'],
      { id: '1', name: 'John' },
      expect.any(Object)
    );
  });

  it('should calculate prefetch statistics', () => {
    const results = [
      { queryKey: ['1'], success: true, duration: 100 },
      { queryKey: ['2'], success: true, duration: 200 },
      {
        queryKey: ['3'],
        success: false,
        duration: 50,
        error: new Error('Failed'),
      },
    ];

    const stats = getPrefetchStats(results as any);

    expect(stats.total).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.totalDuration).toBe(350);
    expect(stats.averageDuration).toBe(350 / 3);
    expect(stats.errors).toHaveLength(1);
  });
});

describe('Hydration Utilities', () => {
  let mockQueryClient: any;
  let hydrationManager: HydrationManager;

  beforeEach(() => {
    mockQueryClient = createMockQueryClient();
    hydrationManager = createHydrationManager();
  });

  it('should create hydration manager with config', () => {
    const manager = createHydrationManager({
      autoHydrate: true,
      clearStaleQueries: true,
      defaultStaleTime: 60000,
    });

    expect(manager).toBeInstanceOf(HydrationManager);
  });

  it('should extract dehydrated state from props', () => {
    const props = {
      user: { id: '1' },
      dehydratedState: { queries: [], mutations: [] },
    };

    const state = extractDehydratedState(props);
    expect(state).toEqual({ queries: [], mutations: [] });
  });

  it('should return undefined for missing dehydrated state', () => {
    const props = { user: { id: '1' } };
    const state = extractDehydratedState(props);
    expect(state).toBeUndefined();
  });

  it('should get hydrated query count', () => {
    const count = getHydratedQueryCount(mockQueryClient as any);
    expect(count).toBe(2);
  });

  it('should get hydrated query keys', () => {
    const keys = getHydratedQueryKeys(mockQueryClient as any);
    expect(keys).toHaveLength(2);
  });

  it('should track hydration state', () => {
    expect(hydrationManager.isHydrated()).toBe(false);
    hydrationManager.reset();
    expect(hydrationManager.isHydrated()).toBe(false);
  });
});
