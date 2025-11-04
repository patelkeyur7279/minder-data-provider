/**
 * Storage Adapters Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WebStorageAdapter } from '../src/platform/adapters/storage/WebStorageAdapter';
import { MemoryStorageAdapter } from '../src/platform/adapters/storage/MemoryStorageAdapter';
import { StorageAdapterFactory } from '../src/platform/adapters/storage/StorageAdapterFactory';
import type { StorageAdapter } from '../src/platform/adapters/storage/StorageAdapter';

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter({ namespace: 'test' });
  });

  afterEach(async () => {
    await storage.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get items', async () => {
      await storage.setItem('key1', 'value1');
      const value = await storage.getItem('key1');
      expect(value).toBe('value1');
    });

    it('should return null for non-existent items', async () => {
      const value = await storage.getItem('nonexistent');
      expect(value).toBeNull();
    });

    it('should remove items', async () => {
      await storage.setItem('key1', 'value1');
      await storage.removeItem('key1');
      const value = await storage.getItem('key1');
      expect(value).toBeNull();
    });

    it('should clear all items', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      await storage.clear();
      
      const value1 = await storage.getItem('key1');
      const value2 = await storage.getItem('key2');
      
      expect(value1).toBeNull();
      expect(value2).toBeNull();
    });

    it('should get all keys', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      
      const keys = await storage.getAllKeys();
      
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should check if item exists', async () => {
      await storage.setItem('key1', 'value1');
      
      const exists = await storage.hasItem('key1');
      const notExists = await storage.hasItem('key2');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('TTL (Time-To-Live)', () => {
    it('should respect TTL and expire items', async () => {
      await storage.setItem('key1', 'value1', 100); // 100ms TTL
      
      let value = await storage.getItem('key1');
      expect(value).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      value = await storage.getItem('key1');
      expect(value).toBeNull();
    });

    it('should not expire items without TTL', async () => {
      await storage.setItem('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const value = await storage.getItem('key1');
      expect(value).toBe('value1');
    });

    it('should use default TTL from options', async () => {
      const storageWithTTL = new MemoryStorageAdapter({
        namespace: 'test',
        ttl: 100
      });
      
      await storageWithTTL.setItem('key1', 'value1');
      
      let value = await storageWithTTL.getItem('key1');
      expect(value).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      value = await storageWithTTL.getItem('key1');
      expect(value).toBeNull();
    });
  });

  describe('Namespace', () => {
    it('should isolate items by namespace', async () => {
      const storage1 = new MemoryStorageAdapter({ namespace: 'app1' });
      const storage2 = new MemoryStorageAdapter({ namespace: 'app2' });
      
      await storage1.setItem('key1', 'value1');
      await storage2.setItem('key1', 'value2');
      
      const value1 = await storage1.getItem('key1');
      const value2 = await storage2.getItem('key1');
      
      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });

    it('should clear only namespaced items', async () => {
      const storage1 = new MemoryStorageAdapter({ namespace: 'app1' });
      const storage2 = new MemoryStorageAdapter({ namespace: 'app2' });
      
      await storage1.setItem('key1', 'value1');
      await storage2.setItem('key1', 'value2');
      
      await storage1.clear();
      
      const value1 = await storage1.getItem('key1');
      const value2 = await storage2.getItem('key1');
      
      expect(value1).toBeNull();
      expect(value2).toBe('value2');
    });
  });

  describe('Size Management', () => {
    it('should calculate storage size', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      
      const size = await storage.getSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should respect max size limit', async () => {
      const limitedStorage = new MemoryStorageAdapter({
        namespace: 'test',
        maxSize: 2
      });
      
      await limitedStorage.setItem('key1', 'value1');
      await limitedStorage.setItem('key2', 'value2');
      await limitedStorage.setItem('key3', 'value3');
      
      const keys = await limitedStorage.getAllKeys();
      expect(keys.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Garbage Collection', () => {
    it('should manually trigger GC', async () => {
      await storage.setItem('key1', 'value1', 50);
      await storage.setItem('key2', 'value2', 50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const removed = await storage.gc();
      expect(removed).toBe(2);
    });
  });
});

describe('WebStorageAdapter', () => {
  let storage: WebStorageAdapter;
  let mockStorage: Storage;

  beforeEach(() => {
    // Mock localStorage for Node.js environment
    const data: Record<string, string> = {};
    mockStorage = {
      get length() {
        return Object.keys(data).length;
      },
      getItem(key: string): string | null {
        return data[key] || null;
      },
      setItem(key: string, value: string): void {
        data[key] = value;
      },
      removeItem(key: string): void {
        delete data[key];
      },
      clear(): void {
        for (const key in data) {
          delete data[key];
        }
      },
      key(index: number): string | null {
        const keys = Object.keys(data);
        return keys[index] || null;
      }
    };

    storage = new WebStorageAdapter(mockStorage, { namespace: 'test' });
  });

  afterEach(async () => {
    await storage.clear();
  });

  it('should set and get items', async () => {
    await storage.setItem('key1', 'value1');
    const value = await storage.getItem('key1');
    expect(value).toBe('value1');
  });

  it('should handle namespace correctly', async () => {
    await storage.setItem('key1', 'value1');
    
    // Check if the key is prefixed in actual storage
    const directValue = mockStorage.getItem('test:key1');
    expect(directValue).toBeTruthy();
  });

  it('should handle quota exceeded gracefully', async () => {
    // Override setItem to throw QuotaExceededError
    const originalSetItem = mockStorage.setItem;
    let callCount = 0;
    
    mockStorage.setItem = function(key: string, value: string) {
      callCount++;
      if (callCount === 1) {
        const error = new DOMException('QuotaExceededError') as any;
        (error as any).name = 'QuotaExceededError';
        throw error;
      }
      originalSetItem.call(this, key, value);
    };

    // Should handle error and retry
    await expect(storage.setItem('key1', 'value1')).resolves.not.toThrow();
  });
});

describe('StorageAdapterFactory', () => {
  it('should create storage adapter', () => {
    const adapter = StorageAdapterFactory.create();
    expect(adapter).toBeDefined();
  });

  it('should create with fallback', () => {
    const adapter = StorageAdapterFactory.createWithFallback();
    expect(adapter).toBeDefined();
  });

  it('should create session storage', () => {
    const adapter = StorageAdapterFactory.createSessionStorage();
    expect(adapter).toBeDefined();
  });

  it('should create memory storage', () => {
    const adapter = StorageAdapterFactory.createMemoryStorage();
    expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
  });

  it('should list available adapters', () => {
    const info = StorageAdapterFactory.getAvailableAdapters();
    
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('recommendedAdapter');
    expect(info).toHaveProperty('availableAdapters');
    expect(Array.isArray(info.availableAdapters)).toBe(true);
    expect(info.availableAdapters).toContain('MemoryStorageAdapter');
  });
});

describe('Storage Adapter Interface Compliance', () => {
  const adapters: Array<{ name: string; adapter: StorageAdapter }> = [
    { name: 'MemoryStorageAdapter', adapter: new MemoryStorageAdapter() }
  ];

  // Test all adapters implement the same interface
  adapters.forEach(({ name, adapter }) => {
    describe(`${name}`, () => {
      afterEach(async () => {
        await adapter.clear();
      });

      it('should implement getItem', async () => {
        await adapter.setItem('test', 'value');
        const value = await adapter.getItem('test');
        expect(value).toBe('value');
      });

      it('should implement setItem', async () => {
        await expect(adapter.setItem('test', 'value')).resolves.not.toThrow();
      });

      it('should implement removeItem', async () => {
        await adapter.setItem('test', 'value');
        await adapter.removeItem('test');
        const value = await adapter.getItem('test');
        expect(value).toBeNull();
      });

      it('should implement clear', async () => {
        await adapter.setItem('test1', 'value1');
        await adapter.setItem('test2', 'value2');
        await adapter.clear();
        
        const keys = await adapter.getAllKeys();
        expect(keys.length).toBe(0);
      });

      it('should implement getAllKeys', async () => {
        await adapter.setItem('test1', 'value1');
        await adapter.setItem('test2', 'value2');
        
        const keys = await adapter.getAllKeys();
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThan(0);
      });

      it('should implement hasItem', async () => {
        await adapter.setItem('test', 'value');
        
        const exists = await adapter.hasItem('test');
        const notExists = await adapter.hasItem('nonexistent');
        
        expect(exists).toBe(true);
        expect(notExists).toBe(false);
      });

      it('should implement getSize', async () => {
        const size = await adapter.getSize();
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
