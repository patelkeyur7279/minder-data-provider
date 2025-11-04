/**
 * Offline Support Tests
 * 
 * Tests for offline queue management and network detection.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  OfflineManager,
  createOfflineManager,
  type QueuedRequest,
  type NetworkState,
} from '../src/platform/offline/OfflineManager';

// Mock StorageAdapter
const createMockStorage = () => ({
  getItem: jest.fn().mockResolvedValue(null) as any,
  setItem: jest.fn().mockResolvedValue(undefined) as any,
  removeItem: jest.fn().mockResolvedValue(undefined) as any,
  clear: jest.fn().mockResolvedValue(undefined) as any,
  getAllKeys: jest.fn().mockResolvedValue([]) as any,
  hasItem: jest.fn().mockResolvedValue(false) as any,
  getSize: jest.fn().mockResolvedValue(0) as any,
});

// Mock fetch
global.fetch = jest.fn() as any;

describe('OfflineManager', () => {
  let offlineManager: OfflineManager;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = createMockStorage();
    
    offlineManager = createOfflineManager({
      enabled: true,
      storage: mockStorage as any,
      maxQueueSize: 10,
      maxRetries: 3,
      autoSync: false, // Disable auto-sync for tests
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  describe('Initialization', () => {
    it('should create offline manager with default config', () => {
      const manager = createOfflineManager();
      expect(manager).toBeInstanceOf(OfflineManager);
    });

    it('should create offline manager with custom config', () => {
      const manager = createOfflineManager({
        enabled: false,
        maxQueueSize: 50,
        maxRetries: 5,
      });
      expect(manager).toBeInstanceOf(OfflineManager);
    });

    it('should load queue from storage on initialize', async () => {
      const savedQueue = [
        {
          id: '1',
          method: 'POST',
          url: '/api/test',
          priority: 0,
          queuedAt: Date.now(),
          retries: 0,
        },
      ];

      mockStorage.getItem.mockResolvedValueOnce(JSON.stringify(savedQueue));

      await offlineManager.initialize();

      expect(mockStorage.getItem).toHaveBeenCalledWith('minder_offline_queue');
      expect(offlineManager.getQueueSize()).toBe(1);
    });

    it('should handle storage load errors gracefully', async () => {
      mockStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      await expect(offlineManager.initialize()).resolves.not.toThrow();
      expect(offlineManager.getQueueSize()).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should add request to queue', async () => {
      const id = await offlineManager.addToQueue('POST', '/api/users', {
        body: { name: 'John' },
        priority: 5,
      });

      expect(id).toBeDefined();
      expect(offlineManager.getQueueSize()).toBe(1);

      const queue = offlineManager.getQueue();
      expect(queue[0]).toMatchObject({
        method: 'POST',
        url: '/api/users',
        body: { name: 'John' },
        priority: 5,
        retries: 0,
      });
    });

    it('should save queue to storage when adding request', async () => {
      await offlineManager.addToQueue('GET', '/api/data');

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'minder_offline_queue',
        expect.any(String)
      );
    });

    it('should sort queue by priority', async () => {
      await offlineManager.addToQueue('POST', '/low', { priority: 1 });
      await offlineManager.addToQueue('POST', '/high', { priority: 10 });
      await offlineManager.addToQueue('POST', '/medium', { priority: 5 });

      const queue = offlineManager.getQueue();
      expect(queue[0].priority).toBe(10);
      expect(queue[1].priority).toBe(5);
      expect(queue[2].priority).toBe(1);
    });

    it('should throw error when queue is full', async () => {
      // Fill queue to max
      for (let i = 0; i < 10; i++) {
        await offlineManager.addToQueue('GET', `/api/${i}`);
      }

      await expect(
        offlineManager.addToQueue('GET', '/api/overflow')
      ).rejects.toThrow('Offline queue is full');
    });

    it('should remove request from queue', async () => {
      const id = await offlineManager.addToQueue('GET', '/api/test');

      const removed = await offlineManager.removeFromQueue(id);
      expect(removed).toBe(true);
      expect(offlineManager.getQueueSize()).toBe(0);
    });

    it('should return false when removing non-existent request', async () => {
      const removed = await offlineManager.removeFromQueue('non-existent');
      expect(removed).toBe(false);
    });

    it('should clear entire queue', async () => {
      await offlineManager.addToQueue('GET', '/api/1');
      await offlineManager.addToQueue('GET', '/api/2');
      await offlineManager.addToQueue('GET', '/api/3');

      await offlineManager.clearQueue();

      expect(offlineManager.getQueueSize()).toBe(0);
      expect(mockStorage.setItem).toHaveBeenCalled();
    });

    it('should call onRequestQueued callback', async () => {
      const onRequestQueued = jest.fn();
      const manager = createOfflineManager({
        storage: mockStorage as any,
        onRequestQueued,
      });

      await manager.addToQueue('POST', '/api/test');

      expect(onRequestQueued).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/test',
        })
      );
    });
  });

  describe('Network State', () => {
    it('should return default online state', () => {
      expect(offlineManager.isOnline()).toBe(true);
    });

    it('should get network state', () => {
      const state = offlineManager.getNetworkState();
      expect(state).toHaveProperty('isConnected');
    });

    it('should check network state', async () => {
      const state = await offlineManager.checkNetworkState();
      expect(state).toHaveProperty('isConnected');
    });
  });

  describe('Sync Operations', () => {
    it('should sync queued requests successfully', async () => {
      await offlineManager.addToQueue('POST', 'https://api.test.com/users', {
        body: { name: 'John' },
      });

      const stats = await offlineManager.sync();

      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
      expect(offlineManager.getQueueSize()).toBe(0);
    });

    it('should handle sync errors with retries', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await offlineManager.addToQueue('POST', 'https://api.test.com/users');

      const stats = await offlineManager.sync();

      expect(stats.total).toBe(1);
      expect(stats.failed).toBe(1);
      
      // Request should still be in queue (retry available)
      const queue = offlineManager.getQueue();
      expect(queue[0].retries).toBe(1);
    });

    it('should remove request after max retries', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const manager = createOfflineManager({
        storage: mockStorage as any,
        maxRetries: 2,
        autoSync: false,
      });

      await manager.addToQueue('POST', 'https://api.test.com/users');

      // First sync attempt - retry 1
      await manager.sync();
      expect(manager.getQueueSize()).toBe(1);

      // Second sync attempt - retry 2 (max reached)
      await manager.sync();
      expect(manager.getQueueSize()).toBe(0);
    });

    it('should process requests in batches', async () => {
      const manager = createOfflineManager({
        storage: mockStorage as any,
        syncBatchSize: 2,
        autoSync: false,
      });

      // Add 5 requests
      for (let i = 0; i < 5; i++) {
        await manager.addToQueue('GET', `https://api.test.com/item/${i}`);
      }

      const stats = await manager.sync();

      expect(stats.total).toBe(5);
      expect(stats.successful).toBe(5);
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('should throw error when syncing offline', async () => {
      const manager = createOfflineManager({
        storage: mockStorage as any,
        autoSync: false,
      });

      // Simulate offline state
      (manager as any).networkState = { isConnected: false };

      await expect(manager.sync()).rejects.toThrow('Cannot sync while offline');
    });

    it('should call sync callbacks', async () => {
      const onSyncStart = jest.fn();
      const onSyncComplete = jest.fn();

      const manager = createOfflineManager({
        storage: mockStorage as any,
        onSyncStart,
        onSyncComplete,
        autoSync: false,
      });

      await manager.addToQueue('GET', 'https://api.test.com/test');
      await manager.sync();

      expect(onSyncStart).toHaveBeenCalled();
      expect(onSyncComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          successful: 1,
        })
      );
    });

    it('should call onRequestSuccess callback', async () => {
      const onRequestSuccess = jest.fn();

      const manager = createOfflineManager({
        storage: mockStorage as any,
        onRequestSuccess,
        autoSync: false,
      });

      await manager.addToQueue('GET', 'https://api.test.com/test');
      await manager.sync();

      expect(onRequestSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.test.com/test',
        }),
        { success: true }
      );
    });

    it('should call onRequestError callback on failure', async () => {
      const onRequestError = jest.fn();

      const manager = createOfflineManager({
        storage: mockStorage as any,
        onRequestError,
        maxRetries: 1,
        autoSync: false,
      });

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await manager.addToQueue('GET', 'https://api.test.com/test');
      await manager.sync();

      expect(onRequestError).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
        }),
        expect.any(Error)
      );
    });

    it('should prevent concurrent syncs', async () => {
      await offlineManager.addToQueue('GET', 'https://api.test.com/test');

      const sync1 = offlineManager.sync();
      const sync2 = offlineManager.sync();

      const [result1, result2] = await Promise.all([sync1, sync2]);

      // Both should return same stats (same sync operation)
      expect(result1).toBe(result2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Request Metadata', () => {
    it('should store and retrieve metadata with requests', async () => {
      await offlineManager.addToQueue('POST', '/api/users', {
        body: { name: 'John' },
        metadata: {
          userId: '123',
          action: 'create',
          timestamp: Date.now(),
        },
      });

      const queue = offlineManager.getQueue();
      expect(queue[0].metadata).toEqual({
        userId: '123',
        action: 'create',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Cleanup', () => {
    it('should save queue on destroy', async () => {
      await offlineManager.addToQueue('GET', '/api/test');
      await offlineManager.destroy();

      expect(mockStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when offline support is disabled', async () => {
      const manager = createOfflineManager({ enabled: false });

      await expect(
        manager.addToQueue('GET', '/api/test')
      ).rejects.toThrow('Offline support is disabled');
    });

    it('should handle fetch errors with proper error messages', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await offlineManager.addToQueue('GET', 'https://api.test.com/missing');

      const stats = await offlineManager.sync();

      expect(stats.failed).toBe(1);
      
      const queue = offlineManager.getQueue();
      expect(queue[0].lastError).toContain('404');
    });

    it('should handle non-JSON responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await offlineManager.addToQueue('GET', 'https://api.test.com/test');

      const stats = await offlineManager.sync();

      expect(stats.failed).toBe(1);
    });
  });
});
