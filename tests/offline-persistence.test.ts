/**
 * Tests for Offline Queue Persistence
 * Issue #8: Persist offline queue to localStorage/AsyncStorage across refreshes
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OfflineManager } from '../src/platform/offline/OfflineManager';
import type { StorageAdapter } from '../src/platform/adapters/storage/StorageAdapter';

// Mock storage adapter
class MockStorageAdapter implements StorageAdapter {
  private storage = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async hasItem(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async getSize(): Promise<number> {
    let size = 0;
    for (const [key, value] of this.storage.entries()) {
      size += key.length + value.length;
    }
    return size;
  }

  // Helper to get all data (for testing)
  getData() {
    return new Map(this.storage);
  }
}

describe('Offline Queue Persistence', () => {
  let storage: MockStorageAdapter;
  let manager: OfflineManager;

  beforeEach(() => {
    storage = new MockStorageAdapter();
  });

  describe('OfflineManager with Storage', () => {
    it('should save queue to storage when adding requests', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'test_queue',
      });

      await manager.initialize();

      // Add a request
      await manager.addToQueue('POST', '/api/posts', {
        body: { title: 'Test Post' },
        priority: 1,
      });

      // Check storage
      const saved = await storage.getItem('test_queue');
      expect(saved).toBeDefined();
      expect(saved).not.toBeNull();

      const queue = JSON.parse(saved!);
      expect(queue).toHaveLength(1);
      expect(queue[0].url).toBe('/api/posts');
      expect(queue[0].method).toBe('POST');
    });

    it('should load queue from storage on initialization', async () => {
      // Prepare storage with existing queue
      const existingQueue = [
        {
          id: '1',
          method: 'POST',
          url: '/api/posts/1',
          body: { title: 'Post 1' },
          priority: 0,
          queuedAt: Date.now(),
          retries: 0,
        },
        {
          id: '2',
          method: 'PUT',
          url: '/api/posts/2',
          body: { title: 'Post 2' },
          priority: 0,
          queuedAt: Date.now(),
          retries: 0,
        },
      ];

      await storage.setItem('test_queue', JSON.stringify(existingQueue));

      // Create manager
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'test_queue',
      });

      await manager.initialize();

      // Check queue was loaded
      const queue = manager.getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe('1');
      expect(queue[1].id).toBe('2');
    });

    it('should persist queue after removing items', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'test_queue',
      });

      await manager.initialize();

      // Add requests
      const id1 = await manager.addToQueue('POST', '/api/posts/1');
      const id2 = await manager.addToQueue('POST', '/api/posts/2');

      // Remove one
      await manager.removeFromQueue(id1);

      // Check storage
      const saved = await storage.getItem('test_queue');
      const queue = JSON.parse(saved!);
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(id2);
    });

    it('should persist queue after clearing', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'test_queue',
      });

      await manager.initialize();

      // Add requests
      await manager.addToQueue('POST', '/api/posts/1');
      await manager.addToQueue('POST', '/api/posts/2');

      // Clear queue
      await manager.clearQueue();

      // Check storage
      const saved = await storage.getItem('test_queue');
      const queue = JSON.parse(saved!);
      expect(queue).toHaveLength(0);
    });

    it('should handle storage errors gracefully', async () => {
      // Create storage that throws errors
      const failingStorage: StorageAdapter = {
        getItem: async () => {
          throw new Error('Storage read error');
        },
        setItem: async () => {
          throw new Error('Storage write error');
        },
        removeItem: async () => {},
        clear: async () => {},
        getAllKeys: async () => [],
        hasItem: async () => false,
        getSize: async () => 0,
      };

      manager = new OfflineManager({
        enabled: true,
        storage: failingStorage,
        storageKey: 'test_queue',
      });

      // Should not throw
      await expect(manager.initialize()).resolves.not.toThrow();

      // Should still work in memory
      const id = await manager.addToQueue('POST', '/api/posts');
      expect(id).toBeDefined();
      expect(manager.getQueueSize()).toBe(1);
    });

    it('should work without storage adapter', async () => {
      manager = new OfflineManager({
        enabled: true,
        // No storage provided
      });

      await manager.initialize();

      // Should work in memory only
      await manager.addToQueue('POST', '/api/posts');

      expect(manager.getQueueSize()).toBe(1);
    });

    it('should persist complex request data', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'test_queue',
      });

      await manager.initialize();

      const complexRequest = {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
        body: {
          title: 'Complex Post',
          content: 'This has nested data',
          tags: ['tag1', 'tag2'],
          metadata: {
            author: 'John Doe',
            publishedAt: new Date().toISOString(),
          },
        },
        priority: 5,
        metadata: {
          customField: 'value',
        },
      };

      await manager.addToQueue('POST', '/api/posts', complexRequest);

      // Reload from storage
      const saved = await storage.getItem('test_queue');
      const queue = JSON.parse(saved!);

      expect(queue[0].headers).toEqual(complexRequest.headers);
      expect(queue[0].body).toEqual(complexRequest.body);
      expect(queue[0].priority).toBe(5);
      expect(queue[0].metadata).toEqual({ customField: 'value' });
    });
  });

  describe('Edge Cases', () => {
    it('should persist queue across manager instances', async () => {
      // Create first manager
      const manager1 = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'shared_queue',
      });

      await manager1.initialize();

      // Add requests
      await manager1.addToQueue('POST', '/api/posts/1');
      await manager1.addToQueue('POST', '/api/posts/2');
      await manager1.addToQueue('POST', '/api/posts/3');

      expect(manager1.getQueueSize()).toBe(3);

      // Destroy first manager (simulates app restart)
      await manager1.destroy();

      // Create second manager with same storage
      const manager2 = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'shared_queue',
      });

      await manager2.initialize();

      // Queue should be restored
      expect(manager2.getQueueSize()).toBe(3);
      const queue = manager2.getQueue();
      expect(queue[0].url).toBe('/api/posts/1');
      expect(queue[1].url).toBe('/api/posts/2');
      expect(queue[2].url).toBe('/api/posts/3');
    });

    it('should maintain queue state through multiple operations', async () => {
      const manager1 = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'persist_queue',
      });

      await manager1.initialize();

      // Add some requests
      const id1 = await manager1.addToQueue('POST', '/api/1');
      const id2 = await manager1.addToQueue('POST', '/api/2');
      await manager1.addToQueue('POST', '/api/3');

      // Remove one
      await manager1.removeFromQueue(id2);

      // Destroy and recreate
      await manager1.destroy();

      const manager2 = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'persist_queue',
      });

      await manager2.initialize();

      // Should have 2 items (3 added, 1 removed)
      expect(manager2.getQueueSize()).toBe(2);

      const queue = manager2.getQueue();
      expect(queue.find(r => r.id === id1)).toBeDefined();
      expect(queue.find(r => r.id === id2)).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty storage on initialization', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'empty_queue',
      });

      await manager.initialize();

      expect(manager.getQueueSize()).toBe(0);
    });

    it('should handle corrupted storage data', async () => {
      // Put invalid JSON in storage
      await storage.setItem('corrupted_queue', 'not valid json{{{');

      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'corrupted_queue',
      });

      // Should not throw, should start with empty queue
      await manager.initialize();
      expect(manager.getQueueSize()).toBe(0);
    });

    it('should handle large queues', async () => {
      manager = new OfflineManager({
        enabled: true,
        storage,
        storageKey: 'large_queue',
        maxQueueSize: 1000,
      });

      await manager.initialize();

      // Add many requests
      for (let i = 0; i < 100; i++) {
        await manager.addToQueue('POST', `/api/posts/${i}`, {
          body: { index: i },
        });
      }

      // Verify persistence
      const saved = await storage.getItem('large_queue');
      const queue = JSON.parse(saved!);
      expect(queue).toHaveLength(100);
    });
  });
});
