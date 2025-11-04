/**
 * Performance Optimization Tests
 * Tests for request batching, deduplication, monitoring, and React hooks
 */

import {
  RequestBatcher,
  RequestDeduplicator,
  PerformanceMonitor,
  getBundleSizeImpact,
} from '../src/utils/performance';

describe('Performance Utilities', () => {
  // ============================================================================
  // Request Batching
  // ============================================================================
  
  describe('RequestBatcher', () => {
    it('should batch multiple requests together', async () => {
      const batcher = new RequestBatcher(50);
      const executor = jest.fn().mockResolvedValue({ data: 'result' });

      const promises = [
        batcher.add('users', executor),
        batcher.add('users', executor),
        batcher.add('users', executor),
      ];

      const results = await Promise.all(promises);

      // Should only call executor once
      expect(executor).toHaveBeenCalledTimes(1);
      
      // All promises should resolve with same result
      results.forEach(result => {
        expect(result).toEqual({ data: 'result' });
      });
    });

    it('should handle different routes separately', async () => {
      const batcher = new RequestBatcher(50);
      const usersExecutor = jest.fn().mockResolvedValue({ data: 'users' });
      const postsExecutor = jest.fn().mockResolvedValue({ data: 'posts' });

      await Promise.all([
        batcher.add('users', usersExecutor),
        batcher.add('posts', postsExecutor),
      ]);

      expect(usersExecutor).toHaveBeenCalledTimes(1);
      expect(postsExecutor).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in batched requests', async () => {
      const batcher = new RequestBatcher(50);
      const executor = jest.fn(() => Promise.reject(new Error('API Error')));

      const promises = [
        batcher.add('users', executor),
        batcher.add('users', executor),
      ];

      await expect(Promise.all(promises)).rejects.toThrow('API Error');
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should clear pending requests', () => {
      const batcher = new RequestBatcher(100);
      const executor = jest.fn().mockResolvedValue({});

      batcher.add('users', executor);
      batcher.clear();

      // After clear, executor should not be called
      expect(executor).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Request Deduplication
  // ============================================================================
  
  describe('RequestDeduplicator', () => {
    it('should deduplicate identical concurrent requests', async () => {
      const deduplicator = new RequestDeduplicator();
      const executor = jest.fn().mockResolvedValue({ data: 'result' });

      const promises = [
        deduplicator.deduplicate('users', executor),
        deduplicator.deduplicate('users', executor),
        deduplicator.deduplicate('users', executor),
      ];

      const results = await Promise.all(promises);

      // Should only call executor once
      expect(executor).toHaveBeenCalledTimes(1);
      
      // All should get same result
      results.forEach(result => {
        expect(result).toEqual({ data: 'result' });
      });
    });

    it('should not deduplicate different keys', async () => {
      const deduplicator = new RequestDeduplicator();
      const executor1 = jest.fn().mockResolvedValue('result1');
      const executor2 = jest.fn().mockResolvedValue('result2');

      await Promise.all([
        deduplicator.deduplicate('users', executor1),
        deduplicator.deduplicate('posts', executor2),
      ]);

      expect(executor1).toHaveBeenCalledTimes(1);
      expect(executor2).toHaveBeenCalledTimes(1);
    });

    it('should allow new requests after max age', async () => {
      const deduplicator = new RequestDeduplicator(100); // 100ms max age
      const executor = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const first = await deduplicator.deduplicate('users', executor);
      expect(first).toBe('result1');
      
      // Wait for max age to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const second = await deduplicator.deduplicate('users', executor);
      expect(second).toBe('result2');

      // Should call executor twice
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should clear pending requests', () => {
      const deduplicator = new RequestDeduplicator();
      deduplicator.clear();
      
      // Should be able to make new requests after clear
      expect(() => deduplicator.clear()).not.toThrow();
    });
  });

  // ============================================================================
  // Performance Monitoring
  // ============================================================================
  
  describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
      monitor = new PerformanceMonitor();
    });

    it('should record request latency', () => {
      monitor.recordLatency('users', 100);
      monitor.recordLatency('users', 150);
      monitor.recordLatency('posts', 200);

      const metrics = monitor.getMetrics();

      expect(metrics.requestCount).toBe(3);
      expect(metrics.averageLatency).toBe(150); // (100 + 150 + 200) / 3
    });

    it('should calculate cache hit rate', () => {
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheMiss();

      const metrics = monitor.getMetrics();

      expect(metrics.cacheHitRate).toBe(75); // 3 hits out of 4 total
    });

    it('should calculate error rate', () => {
      monitor.recordLatency('users', 100);
      monitor.recordLatency('posts', 150);
      monitor.recordError();

      const metrics = monitor.getMetrics();

      expect(metrics.errorRate).toBe(50); // 1 error out of 2 requests
    });

    it('should track slowest requests', () => {
      monitor.recordLatency('users', 100);
      monitor.recordLatency('posts', 500);
      monitor.recordLatency('comments', 200);

      const metrics = monitor.getMetrics();

      expect(metrics.slowestRequests[0].route).toBe('posts');
      expect(metrics.slowestRequests[0].duration).toBe(500);
    });

    it('should reset metrics', () => {
      monitor.recordLatency('users', 100);
      monitor.recordCacheHit();
      monitor.recordError();

      monitor.reset();

      const metrics = monitor.getMetrics();

      expect(metrics.requestCount).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = monitor.getMetrics();

      expect(metrics.requestCount).toBe(0);
      expect(metrics.averageLatency).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });
  });

  // ============================================================================
  // Bundle Size Analysis
  // ============================================================================
  
  describe('getBundleSizeImpact', () => {
    it('should estimate bundle size for features', () => {
      const result = getBundleSizeImpact(['crud', 'auth', 'cache']);

      expect(result.estimatedSize).toBeGreaterThan(0);
      expect(result.estimatedSize).toBe(33); // 15 + 10 + 8
    });

    it('should provide recommendations for large bundles', () => {
      const result = getBundleSizeImpact([
        'crud',
        'auth',
        'cache',
        'websocket',
        'upload',
        'redux',
        'tanstack-query',
      ]);

      expect(result.estimatedSize).toBeGreaterThan(90);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should recommend against using multiple state managers', () => {
      const result = getBundleSizeImpact(['redux', 'tanstack-query']);

      expect(result.recommendations).toContain(
        'Consider using only one state management solution'
      );
    });

    it('should handle empty features array', () => {
      const result = getBundleSizeImpact([]);

      expect(result.estimatedSize).toBe(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should handle unknown features', () => {
      const result = getBundleSizeImpact(['unknown-feature']);

      expect(result.estimatedSize).toBe(0);
    });
  });
});
