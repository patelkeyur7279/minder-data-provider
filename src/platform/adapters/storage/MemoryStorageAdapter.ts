/**
 * Memory Storage Adapter
 * In-memory storage fallback for when persistent storage is not available
 * or when running in environments like Node.js
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

const logger = new Logger('MemoryStorageAdapter', { level: LogLevel.ERROR });

export class MemoryStorageAdapter extends BaseStorageAdapter {
  private store: Map<string, string>;
  
  constructor(options: StorageAdapterOptions = {}) {
    super(options);
    this.store = new Map();
  }
  
  async getItem(key: string): Promise<string | null> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.store.get(prefixedKey);
      
      if (!wrapped) return null;
      
      const value = this.unwrapValue<string>(wrapped);
      
      // If expired, remove and return null
      if (value === null) {
        await this.removeItem(key);
        return null;
      }
      
      return value;
    } catch (error) {
      logger.error('getItem error:', error);
      return null;
    }
  }
  
  async setItem(key: string, value: string, ttl?: number): Promise<void> {
    try {
      await this.checkMaxSize();
      
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.wrapValue(value, ttl);
      
      this.store.set(prefixedKey, wrapped);
    } catch (error) {
      logger.error('setItem error:', error);
    }
  }
  
  async removeItem(key: string): Promise<void> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      this.store.delete(prefixedKey);
    } catch (error) {
      logger.error('removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    try {
      if (this.options.namespace) {
        // Only clear items with our namespace
        const keys = await this.getAllKeys();
        for (const key of keys) {
          await this.removeItem(key);
        }
      } else {
        // Clear everything
        this.store.clear();
      }
    } catch (error) {
      logger.error('clear error:', error);
    }
  }
  
  async getAllKeys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      const prefix = this.options.namespace ? `${this.options.namespace}:` : '';
      
      for (const key of this.store.keys()) {
        if (!prefix || key.startsWith(prefix)) {
          keys.push(this.removePrefixedKey(key));
        }
      }
      
      return keys;
    } catch (error) {
      logger.error('getAllKeys error:', error);
      return [];
    }
  }
  
  async hasItem(key: string): Promise<boolean> {
    const value = await this.getItem(key);
    return value !== null;
  }
  
  async getSize(): Promise<number> {
    try {
      let totalSize = 0;
      
      for (const [key, value] of this.store.entries()) {
        // Approximate size in bytes (2 bytes per character in JavaScript strings)
        totalSize += (key.length + value.length) * 2;
      }
      
      return totalSize;
    } catch (error) {
      logger.error('getSize error:', error);
      return 0;
    }
  }
  
  /**
   * Get number of items in storage
   */
  getItemCount(): number {
    return this.store.size;
  }
  
  /**
   * Manually trigger garbage collection of expired items
   */
  async gc(): Promise<number> {
    let removed = 0;
    const keys = await this.getAllKeys();
    
    for (const key of keys) {
      const value = await this.getItem(key);
      if (value === null) {
        removed++;
      }
    }
    
    return removed;
  }
}
