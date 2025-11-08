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

    it('should not remove non-expired items during GC', async () => {
      await storage.setItem('key1', 'value1', 50);
      await storage.setItem('key2', 'value2'); // No TTL
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const removed = await storage.gc();
      expect(removed).toBe(1);
      
      const value2 = await storage.getItem('key2');
      expect(value2).toBe('value2');
    });

    it('should return 0 if no items expired', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      
      const removed = await storage.gc();
      expect(removed).toBe(0);
    });
  });

  describe('Item Count', () => {
    it('should track item count accurately', async () => {
      expect(storage.getItemCount()).toBe(0);
      
      await storage.setItem('key1', 'value1');
      expect(storage.getItemCount()).toBe(1);
      
      await storage.setItem('key2', 'value2');
      expect(storage.getItemCount()).toBe(2);
      
      await storage.removeItem('key1');
      expect(storage.getItemCount()).toBe(1);
      
      await storage.clear();
      expect(storage.getItemCount()).toBe(0);
    });

    it('should update count after TTL expiration on access', async () => {
      await storage.setItem('key1', 'value1', 50);
      expect(storage.getItemCount()).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Accessing expired item should remove it and update count
      await storage.getItem('key1');
      const count = storage.getItemCount();
      expect(count).toBe(0); // Removed after accessing expired item
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', async () => {
      await storage.setItem('key1', '');
      const value = await storage.getItem('key1');
      expect(value).toBe('');
    });

    it('should handle special characters in keys', async () => {
      await storage.setItem('key:with:colons', 'value1');
      await storage.setItem('key-with-dashes', 'value2');
      await storage.setItem('key.with.dots', 'value3');
      
      expect(await storage.getItem('key:with:colons')).toBe('value1');
      expect(await storage.getItem('key-with-dashes')).toBe('value2');
      expect(await storage.getItem('key.with.dots')).toBe('value3');
    });

    it('should handle very long values', async () => {
      const longValue = 'a'.repeat(10000);
      await storage.setItem('longkey', longValue);
      const value = await storage.getItem('longkey');
      expect(value).toBe(longValue);
    });

    it('should handle JSON-like strings', async () => {
      const jsonString = JSON.stringify({ foo: 'bar', nested: { value: 123 } });
      await storage.setItem('json', jsonString);
      const value = await storage.getItem('json');
      expect(value).toBe(jsonString);
    });

    it('should handle unicode characters', async () => {
      await storage.setItem('emoji', '🚀🔥💯');
      await storage.setItem('chinese', '你好世界');
      await storage.setItem('arabic', 'مرحبا');
      
      expect(await storage.getItem('emoji')).toBe('🚀🔥💯');
      expect(await storage.getItem('chinese')).toBe('你好世界');
      expect(await storage.getItem('arabic')).toBe('مرحبا');
    });

    it('should overwrite existing keys', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key1', 'value2');
      
      const value = await storage.getItem('key1');
      expect(value).toBe('value2');
    });

    it('should handle remove on non-existent keys', async () => {
      await expect(storage.removeItem('nonexistent')).resolves.not.toThrow();
    });

    it('should handle multiple clears', async () => {
      await storage.setItem('key1', 'value1');
      await storage.clear();
      await storage.clear();
      
      const keys = await storage.getAllKeys();
      expect(keys.length).toBe(0);
    });

    it('should handle hasItem after expiration', async () => {
      await storage.setItem('key1', 'value1', 50);
      
      let exists = await storage.hasItem('key1');
      expect(exists).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      exists = await storage.hasItem('key1');
      expect(exists).toBe(false);
    });

    it('should handle getAllKeys with mixed TTL items', async () => {
      await storage.setItem('key1', 'value1', 50);
      await storage.setItem('key2', 'value2');
      await storage.setItem('key3', 'value3', 50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const keys = await storage.getAllKeys();
      expect(keys).toContain('key2');
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Constructor Options', () => {
    it('should work without options', async () => {
      const defaultStorage = new MemoryStorageAdapter();
      await defaultStorage.setItem('key1', 'value1');
      const value = await defaultStorage.getItem('key1');
      expect(value).toBe('value1');
    });

    it('should apply namespace option', async () => {
      const s1 = new MemoryStorageAdapter({ namespace: 'ns1' });
      const s2 = new MemoryStorageAdapter({ namespace: 'ns2' });
      
      await s1.setItem('shared', 'value1');
      await s2.setItem('shared', 'value2');
      
      expect(await s1.getItem('shared')).toBe('value1');
      expect(await s2.getItem('shared')).toBe('value2');
    });

    it('should apply maxSize option', async () => {
      const limited = new MemoryStorageAdapter({ maxSize: 3 });
      
      await limited.setItem('k1', 'v1');
      await limited.setItem('k2', 'v2');
      await limited.setItem('k3', 'v3');
      await limited.setItem('k4', 'v4');
      
      const count = limited.getItemCount();
      expect(count).toBeLessThanOrEqual(3);
    });

    it('should combine namespace and TTL options', async () => {
      const storage1 = new MemoryStorageAdapter({
        namespace: 'app',
        ttl: 100
      });
      
      await storage1.setItem('key1', 'value1');
      
      let value = await storage1.getItem('key1');
      expect(value).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      value = await storage1.getItem('key1');
      expect(value).toBeNull();
    });
  });

  describe('Size Calculations', () => {
    it('should return 0 for empty storage', async () => {
      const size = await storage.getSize();
      expect(size).toBe(0);
    });

    it('should calculate size correctly', async () => {
      const initialSize = await storage.getSize();
      
      await storage.setItem('key1', 'value1');
      const afterFirstItem = await storage.getSize();
      
      await storage.setItem('key2', 'value2');
      const afterSecondItem = await storage.getSize();
      
      expect(afterFirstItem).toBeGreaterThan(initialSize);
      expect(afterSecondItem).toBeGreaterThan(afterFirstItem);
    });

    it('should decrease size after item removal', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      
      const beforeRemove = await storage.getSize();
      await storage.removeItem('key1');
      const afterRemove = await storage.getSize();
      
      expect(afterRemove).toBeLessThan(beforeRemove);
    });

    it('should reset size after clear', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');
      
      await storage.clear();
      const size = await storage.getSize();
      
      expect(size).toBe(0);
    });
  });

  describe('TTL Override', () => {
    it('should override default TTL with item-specific TTL', async () => {
      const storageWithDefaultTTL = new MemoryStorageAdapter({
        namespace: 'test',
        ttl: 200
      });
      
      await storageWithDefaultTTL.setItem('key1', 'value1', 50); // Override with shorter TTL
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const value = await storageWithDefaultTTL.getItem('key1');
      expect(value).toBeNull(); // Should expire after 50ms, not 200ms
    });

    it('should use default TTL when not specified', async () => {
      const storageWithDefaultTTL = new MemoryStorageAdapter({
        namespace: 'test',
        ttl: 100
      });
      
      await storageWithDefaultTTL.setItem('key1', 'value1'); // No TTL specified
      
      let value = await storageWithDefaultTTL.getItem('key1');
      expect(value).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      value = await storageWithDefaultTTL.getItem('key1');
      expect(value).toBeNull();
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
