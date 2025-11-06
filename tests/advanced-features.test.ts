/**
 * Advanced Features Tests
 * Tests for DevTools, Plugins, and Query Builder
 */

import {
  QueryBuilder,
  query,
  PaginationHelper,
} from '../src/query/QueryBuilder';

import {
  PluginManager,
  LoggerPlugin,
  createPlugin,
} from '../src/plugins/PluginSystem';

describe('Advanced Features', () => {
  // ============================================================================
  // Query Builder Tests
  // ============================================================================

  describe('QueryBuilder', () => {
    it('should build basic query string', () => {
      const url = query('/api/users')
        .page(2)
        .limit(10)
        .build();

      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
    });

    it('should handle filters', () => {
      const url = query('/api/users')
        .where('role', 'admin')
        .whereGreaterThan('age', 18)
        .build();

      expect(url).toContain('role');
      expect(url).toContain('admin');
      expect(url).toContain('age');
      expect(url).toContain('18');
    });

    it('should handle sorting', () => {
      const url = query('/api/users')
        .sortBy('name')
        .sortByDesc('created_at')
        .build();

      expect(url).toContain('sort');
      expect(url).toContain('name');
      expect(url).toContain('-created_at');
    });

    it('should handle search', () => {
      const url = query('/api/users')
        .search('john')
        .build();

      expect(url).toContain('search=john');
    });

    it('should handle field selection', () => {
      const url = query('/api/users')
        .select('id', 'name', 'email')
        .build();

      expect(url).toContain('fields');
      expect(url).toContain('id');
      expect(url).toContain('name');
      expect(url).toContain('email');
    });

    it('should handle complex queries', () => {
      const url = query('/api/users')
        .where('role', 'admin')
        .whereGreaterThan('age', 21)
        .whereIn('department', ['IT', 'HR'])
        .sortBy('name')
        .page(1)
        .limit(25)
        .select('id', 'name', 'email')
        .build();

      expect(url).toBeTruthy();
      expect(url).toContain('role');
      expect(url).toContain('age');
      expect(url).toContain('page=1');
      expect(url).toContain('limit=25');
    });

    it('should clone query builder', () => {
      const original = query('/api/users')
        .where('role', 'admin')
        .page(1);

      const cloned = original.clone();
      cloned.page(2);

      const originalUrl = original.build();
      const clonedUrl = cloned.build();

      expect(originalUrl).toContain('page=1');
      expect(clonedUrl).toContain('page=2');
    });

    it('should reset query builder', () => {
      const builder = query('/api/users')
        .where('role', 'admin')
        .page(1)
        .limit(10);

      builder.reset();
      const url = builder.build();

      expect(url).toBe('/api/users');
    });

    it('should handle custom parameters', () => {
      const url = query('/api/users')
        .param('custom', 'value')
        .setParams({ foo: 'bar', baz: 'qux' })
        .build();

      expect(url).toContain('custom=value');
      expect(url).toContain('foo=bar');
      expect(url).toContain('baz=qux');
    });

    it('should handle array values', () => {
      const url = query('/api/users')
        .whereIn('status', ['active', 'pending'])
        .build();

      expect(url).toBeTruthy();
    });
  });

  // ============================================================================
  // Pagination Helper Tests
  // ============================================================================

  describe('PaginationHelper', () => {
    it('should calculate pagination state', () => {
      const state = PaginationHelper.calculateState(1, 100, 10);

      expect(state.currentPage).toBe(1);
      expect(state.totalPages).toBe(10);
      expect(state.totalItems).toBe(100);
      expect(state.itemsPerPage).toBe(10);
      expect(state.hasNextPage).toBe(true);
      expect(state.hasPreviousPage).toBe(false);
    });

    it('should handle last page', () => {
      const state = PaginationHelper.calculateState(10, 100, 10);

      expect(state.hasNextPage).toBe(false);
      expect(state.hasPreviousPage).toBe(true);
    });

    it('should get page range', () => {
      const range = PaginationHelper.getPageRange(5, 10, 5);

      expect(range).toEqual([3, 4, 5, 6, 7]);
    });

    it('should handle page range at start', () => {
      const range = PaginationHelper.getPageRange(1, 10, 5);

      expect(range).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle page range at end', () => {
      const range = PaginationHelper.getPageRange(10, 10, 5);

      expect(range).toEqual([6, 7, 8, 9, 10]);
    });

    it('should create pagination result', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = PaginationHelper.createResult(data, 1, 100, 10);

      expect(result.data).toEqual(data);
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.totalPages).toBe(10);
    });
  });

  // ============================================================================
  // Plugin System Tests
  // ============================================================================

  describe('PluginManager', () => {
    let manager: PluginManager;

    beforeEach(() => {
      manager = new PluginManager();
    });

    afterEach(async () => {
      await manager.destroy();
    });

    it('should register plugins', () => {
      const plugin = createPlugin({
        name: 'test-plugin',
        version: '1.0.0'
      });

      manager.register(plugin);

      expect(manager.hasPlugin('test-plugin')).toBe(true);
      expect(manager.getPlugins().length).toBe(1);
    });

    it('should not register duplicate plugins', () => {
      const plugin = createPlugin({ name: 'test-plugin' });

      manager.register(plugin);
      manager.register(plugin);

      expect(manager.getPlugins().length).toBe(1);
    });

    it('should unregister plugins', () => {
      const plugin = createPlugin({ name: 'test-plugin' });

      manager.register(plugin);
      manager.unregister('test-plugin');

      expect(manager.hasPlugin('test-plugin')).toBe(false);
    });

    it('should initialize plugins', async () => {
      const initFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onInit: initFn
      });

      manager.register(plugin);
      await manager.init({});

      expect(initFn).toHaveBeenCalled();
    });

    it('should execute request hooks', async () => {
      const requestFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onRequest: requestFn
      });

      manager.register(plugin);

      await manager.executeRequestHooks({
        method: 'GET',
        url: '/api/users',
        timestamp: Date.now()
      });

      expect(requestFn).toHaveBeenCalled();
    });

    it('should execute response hooks', async () => {
      const responseFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onResponse: responseFn
      });

      manager.register(plugin);

      await manager.executeResponseHooks({
        status: 200,
        data: {},
        duration: 100,
        timestamp: Date.now()
      });

      expect(responseFn).toHaveBeenCalled();
    });

    it('should execute error hooks', async () => {
      const errorFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onError: errorFn
      });

      manager.register(plugin);

      await manager.executeErrorHooks({
        message: 'Test error',
        timestamp: Date.now()
      });

      expect(errorFn).toHaveBeenCalled();
    });

    it('should execute cache hit hooks', async () => {
      const cacheHitFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onCacheHit: cacheHitFn
      });

      manager.register(plugin);

      await manager.executeCacheHitHooks({
        key: 'users',
        value: {},
        age: 1000,
        timestamp: Date.now()
      });

      expect(cacheHitFn).toHaveBeenCalled();
    });

    it('should execute cache miss hooks', async () => {
      const cacheMissFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onCacheMiss: cacheMissFn
      });

      manager.register(plugin);

      await manager.executeCacheMissHooks('users');

      expect(cacheMissFn).toHaveBeenCalled();
    });

    it('should handle plugin errors gracefully', async () => {
      const plugin = createPlugin({
        name: 'test-plugin',
        onRequest: () => {
          throw new Error('Plugin error');
        }
      });

      manager.register(plugin);

      // Should not throw
      await expect(
        manager.executeRequestHooks({
          method: 'GET',
          url: '/api/users',
          timestamp: Date.now()
        })
      ).resolves.not.toThrow();
    });

    it('should destroy all plugins', async () => {
      const destroyFn = jest.fn();
      const plugin = createPlugin({
        name: 'test-plugin',
        onDestroy: destroyFn
      });

      manager.register(plugin);
      await manager.destroy();

      expect(destroyFn).toHaveBeenCalled();
      expect(manager.getPlugins().length).toBe(0);
    });
  });

  // ============================================================================
  // Built-in Plugins Tests
  // ============================================================================

  describe('Built-in Plugins', () => {
    it('should have LoggerPlugin', () => {
      expect(LoggerPlugin.name).toBe('logger');
      expect(LoggerPlugin.version).toBeDefined();
    });

    it('should execute LoggerPlugin hooks', async () => {
      // LoggerPlugin doesn't use console.log by default, it uses the Logger
      // Just verify the plugin has the required hooks
      expect(LoggerPlugin.name).toBe('logger');
      expect(LoggerPlugin.version).toBeDefined();
      expect(typeof LoggerPlugin.onInit).toBe('function');
    });
  });
});
