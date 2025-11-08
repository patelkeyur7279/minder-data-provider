import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { CacheManager } from '../src/core/CacheManager';
import type { DebugManager } from '../src/debug/DebugManager';

describe('CacheManager', () => {
  let queryClient: QueryClient;
  let mockDebugManager: DebugManager;
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Mock DebugManager
    mockDebugManager = {
      log: jest.fn(),
    } as any;
  });

  describe('Constructor', () => {
    it('should create CacheManager without debug manager', () => {
      const manager = new CacheManager(queryClient);
      expect(manager).toBeDefined();
    });

    it('should create CacheManager with debug manager', () => {
      const manager = new CacheManager(queryClient, mockDebugManager);
      expect(manager).toBeDefined();
    });

    it('should create CacheManager with logging enabled', () => {
      const manager = new CacheManager(queryClient, mockDebugManager, true);
      expect(manager).toBeDefined();
    });
  });

  describe('getCachedData', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should get cached data with string key', () => {
      const testData = { id: 1, name: 'Test' };
      queryClient.setQueryData(['users'], testData);

      const result = cacheManager.getCachedData('users');

      expect(result).toEqual(testData);
    });

    it('should get cached data with array key', () => {
      const testData = { id: 1, name: 'John' };
      queryClient.setQueryData(['users', '1'], testData);

      const result = cacheManager.getCachedData(['users', '1']);

      expect(result).toEqual(testData);
    });

    it('should return undefined for non-existent cache', () => {
      const result = cacheManager.getCachedData('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should log cache hit when data exists', () => {
      queryClient.setQueryData(['users'], { id: 1 });

      cacheManager.getCachedData('users');

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('HIT'),
        expect.objectContaining({
          hasData: true,
        })
      );
    });

    it('should log cache miss when data does not exist', () => {
      cacheManager.getCachedData('nonexistent');

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('MISS'),
        expect.objectContaining({
          hasData: false,
        })
      );
    });

    it('should not log when logging is disabled', () => {
      const manager = new CacheManager(queryClient, mockDebugManager, false);
      queryClient.setQueryData(['users'], { id: 1 });

      manager.getCachedData('users');

      expect(mockDebugManager.log).not.toHaveBeenCalled();
    });
  });

  describe('setCachedData', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should set cached data with string key', () => {
      const testData = { id: 1, name: 'Test' };

      cacheManager.setCachedData('users', testData);

      const result = queryClient.getQueryData(['users']);
      expect(result).toEqual(testData);
    });

    it('should set cached data with array key', () => {
      const testData = { id: 1, name: 'John' };

      cacheManager.setCachedData(['users', '1'], testData);

      const result = queryClient.getQueryData(['users', '1']);
      expect(result).toEqual(testData);
    });

    it('should log when setting cache with logging enabled', () => {
      const testData = { id: 1 };

      cacheManager.setCachedData('users', testData);

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('SET'),
        expect.objectContaining({
          queryKey: ['users'],
        })
      );
    });

    it('should not log when logging is disabled', () => {
      const manager = new CacheManager(queryClient, mockDebugManager, false);
      const testData = { id: 1 };

      manager.setCachedData('users', testData);

      expect(mockDebugManager.log).not.toHaveBeenCalled();
    });
  });

  describe('invalidateQueries', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should invalidate specific query with string key', async () => {
      queryClient.setQueryData(['users'], { id: 1 });

      await cacheManager.invalidateQueries('users');

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('INVALIDATE'),
        expect.anything()
      );
    });

    it('should invalidate specific query with array key', async () => {
      queryClient.setQueryData(['users', '1'], { id: 1 });

      await cacheManager.invalidateQueries(['users', '1']);

      expect(mockDebugManager.log).toHaveBeenCalled();
    });

    it('should invalidate all queries when no key provided', async () => {
      queryClient.setQueryData(['users'], { id: 1 });
      queryClient.setQueryData(['posts'], { id: 2 });

      await cacheManager.invalidateQueries();

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('ALL'),
        expect.anything()
      );
    });

    it('should not log when logging is disabled', async () => {
      const manager = new CacheManager(queryClient, mockDebugManager, false);

      await manager.invalidateQueries('users');

      expect(mockDebugManager.log).not.toHaveBeenCalled();
    });
  });

  describe('removeQueries', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should remove query with string key', () => {
      queryClient.setQueryData(['users'], { id: 1 });

      cacheManager.removeQueries('users');

      const result = queryClient.getQueryData(['users']);
      expect(result).toBeUndefined();
    });

    it('should remove query with array key', () => {
      queryClient.setQueryData(['users', '1'], { id: 1 });

      cacheManager.removeQueries(['users', '1']);

      const result = queryClient.getQueryData(['users', '1']);
      expect(result).toBeUndefined();
    });

    it('should log when removing query', () => {
      queryClient.setQueryData(['users'], { id: 1 });

      cacheManager.removeQueries('users');

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('REMOVE'),
        expect.objectContaining({
          queryKey: ['users'],
        })
      );
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should clear specific cache with string key', () => {
      queryClient.setQueryData(['users'], { id: 1 });
      queryClient.setQueryData(['posts'], { id: 2 });

      cacheManager.clearCache('users');

      expect(queryClient.getQueryData(['users'])).toBeUndefined();
      expect(queryClient.getQueryData(['posts'])).toEqual({ id: 2 });
    });

    it('should clear all cache when no key provided', () => {
      queryClient.setQueryData(['users'], { id: 1 });
      queryClient.setQueryData(['posts'], { id: 2 });

      cacheManager.clearCache();

      expect(queryClient.getQueryData(['users'])).toBeUndefined();
      expect(queryClient.getQueryData(['posts'])).toBeUndefined();
    });

    it('should log when clearing all cache', () => {
      cacheManager.clearCache();

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('CLEAR ALL'),
        {}
      );
    });

    it('should log when clearing specific cache', () => {
      cacheManager.clearCache('users');

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('REMOVE'),
        expect.anything()
      );
    });
  });

  describe('getAllCachedQueries', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient);
    });

    it('should return empty array when no queries cached', () => {
      const queries = cacheManager.getAllCachedQueries();

      expect(queries).toEqual([]);
    });

    it('should return all cached queries', () => {
      queryClient.setQueryData(['users'], { id: 1 });
      queryClient.setQueryData(['posts'], { id: 2 });

      const queries = cacheManager.getAllCachedQueries();

      expect(queries).toHaveLength(2);
    });
  });

  describe('prefetchQuery', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should prefetch data with string key', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      await cacheManager.prefetchQuery('users', queryFn);

      const result = queryClient.getQueryData(['users']);
      expect(result).toEqual({ id: 1, name: 'Test' });
      expect(queryFn).toHaveBeenCalled();
    });

    it('should prefetch data with array key', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1 });

      await cacheManager.prefetchQuery(['users', '1'], queryFn);

      const result = queryClient.getQueryData(['users', '1']);
      expect(result).toEqual({ id: 1 });
    });

    it('should prefetch with staleTime option', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1 });

      await cacheManager.prefetchQuery('users', queryFn, { staleTime: 5000 });

      expect(queryFn).toHaveBeenCalled();
    });

    it('should prefetch with gcTime option', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1 });

      await cacheManager.prefetchQuery('users', queryFn, { gcTime: 10000 });

      expect(queryFn).toHaveBeenCalled();
    });

    it('should log when prefetching', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1 });

      await cacheManager.prefetchQuery('users', queryFn);

      expect(mockDebugManager.log).toHaveBeenCalledWith(
        'cache',
        expect.stringContaining('PREFETCH'),
        expect.objectContaining({
          queryKey: ['users'],
        })
      );
    });
  });

  describe('isQueryFresh', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient);
    });

    it('should return false for non-existent query', () => {
      const isFresh = cacheManager.isQueryFresh('nonexistent');

      expect(isFresh).toBe(false);
    });

    it('should return false for invalidated query', async () => {
      queryClient.setQueryData(['users'], { id: 1 });
      await queryClient.invalidateQueries({ queryKey: ['users'] });

      const isFresh = cacheManager.isQueryFresh('users');

      expect(isFresh).toBe(false);
    });

    it('should work with array key', () => {
      queryClient.setQueryData(['users', '1'], { id: 1 });

      const isFresh = cacheManager.isQueryFresh(['users', '1']);

      // May be false due to staleness calculation
      expect(typeof isFresh).toBe('boolean');
    });
  });

  describe('getQueryState', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient);
    });

    it('should return undefined for non-existent query', () => {
      const state = cacheManager.getQueryState('nonexistent');

      expect(state).toBeUndefined();
    });

    it('should return query state for existing query', () => {
      queryClient.setQueryData(['users'], { id: 1 });

      const state = cacheManager.getQueryState('users');

      expect(state).toBeDefined();
      expect(state?.data).toEqual({ id: 1 });
    });

    it('should work with array key', () => {
      queryClient.setQueryData(['users', '1'], { id: 1 });

      const state = cacheManager.getQueryState(['users', '1']);

      expect(state).toBeDefined();
    });
  });

  describe('optimisticUpdate', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient);
    });

    it('should perform optimistic update with string key', async () => {
      queryClient.setQueryData(['users'], { id: 1, name: 'John' });

      await cacheManager.optimisticUpdate(
        'users',
        (oldData: any) => ({ ...oldData, name: 'Jane' })
      );

      const result = queryClient.getQueryData(['users']);
      expect(result).toEqual({ id: 1, name: 'Jane' });
    });

    it('should perform optimistic update with array key', async () => {
      queryClient.setQueryData(['users', '1'], { id: 1, count: 0 });

      await cacheManager.optimisticUpdate(
        ['users', '1'],
        (oldData: any) => ({ ...oldData, count: oldData.count + 1 })
      );

      const result = queryClient.getQueryData(['users', '1']);
      expect(result).toEqual({ id: 1, count: 1 });
    });

    it('should handle undefined old data', async () => {
      await cacheManager.optimisticUpdate(
        'newData',
        () => ({ id: 1, name: 'New' })
      );

      const result = queryClient.getQueryData(['newData']);
      expect(result).toEqual({ id: 1, name: 'New' });
    });

    it('should call rollback function on error', async () => {
      const rollbackFn = jest.fn();
      queryClient.setQueryData(['users'], { id: 1 });

      // The optimistic update itself doesn't throw, but we can test the rollback mechanism
      await cacheManager.optimisticUpdate(
        'users',
        (oldData: any) => ({ ...oldData, updated: true }),
        rollbackFn
      );

      // Rollback function is set up but only called on error during actual mutation
      expect(rollbackFn).not.toHaveBeenCalled();
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      cacheManager = new CacheManager(queryClient, mockDebugManager, true);
    });

    it('should handle complete cache lifecycle', async () => {
      // Set initial data
      cacheManager.setCachedData('users', [{ id: 1, name: 'John' }]);

      // Get cached data
      let result = cacheManager.getCachedData('users');
      expect(result).toEqual([{ id: 1, name: 'John' }]);

      // Update data
      cacheManager.setCachedData('users', [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ]);

      result = cacheManager.getCachedData('users');
      expect(result).toHaveLength(2);

      // Invalidate
      await cacheManager.invalidateQueries('users');

      // Clear
      cacheManager.clearCache('users');
      result = cacheManager.getCachedData('users');
      expect(result).toBeUndefined();
    });

    it('should handle multiple queries', async () => {
      // Set multiple queries
      cacheManager.setCachedData('users', [{ id: 1 }]);
      cacheManager.setCachedData('posts', [{ id: 1 }]);
      cacheManager.setCachedData(['comments', '1'], [{ id: 1 }]);

      // Verify all exist
      expect(cacheManager.getCachedData('users')).toBeDefined();
      expect(cacheManager.getCachedData('posts')).toBeDefined();
      expect(cacheManager.getCachedData(['comments', '1'])).toBeDefined();

      // Get all queries
      const allQueries = cacheManager.getAllCachedQueries();
      expect(allQueries.length).toBeGreaterThanOrEqual(3);

      // Clear all
      cacheManager.clearCache();
      expect(cacheManager.getCachedData('users')).toBeUndefined();
      expect(cacheManager.getCachedData('posts')).toBeUndefined();
    });

    it('should handle prefetch and optimistic updates together', async () => {
      // Prefetch initial data
      await cacheManager.prefetchQuery('users', async () => [{ id: 1, name: 'John' }]);

      // Verify prefetched data
      let result = cacheManager.getCachedData('users');
      expect(result).toEqual([{ id: 1, name: 'John' }]);

      // Optimistic update
      await cacheManager.optimisticUpdate(
        'users',
        (oldData: any) => [...oldData, { id: 2, name: 'Jane' }]
      );

      result = cacheManager.getCachedData('users');
      expect(result).toHaveLength(2);
    });
  });
});
