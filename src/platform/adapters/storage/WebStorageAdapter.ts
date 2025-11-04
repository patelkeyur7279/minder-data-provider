/**
 * Web Storage Adapter
 * Uses localStorage or sessionStorage for web browsers
 */

import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

export class WebStorageAdapter extends BaseStorageAdapter {
  private storage: Storage;
  
  constructor(
    storage: Storage = typeof window !== 'undefined' ? localStorage : null as any,
    options: StorageAdapterOptions = {}
  ) {
    super(options);
    this.storage = storage;
    
    if (!this.storage) {
      console.warn('WebStorageAdapter: localStorage not available, using memory fallback');
    }
  }
  
  async getItem(key: string): Promise<string | null> {
    if (!this.storage) return null;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.storage.getItem(prefixedKey);
      
      if (!wrapped) return null;
      
      const value = this.unwrapValue<string>(wrapped);
      
      // If expired, remove and return null
      if (value === null) {
        await this.removeItem(key);
        return null;
      }
      
      return value;
    } catch (error) {
      console.error('WebStorageAdapter getItem error:', error);
      return null;
    }
  }
  
  async setItem(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.storage) return;
    
    try {
      await this.checkMaxSize();
      
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.wrapValue(value, ttl);
      
      this.storage.setItem(prefixedKey, wrapped);
    } catch (error) {
      // Handle quota exceeded error
      if (error instanceof DOMException && 
          (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn('WebStorageAdapter: Storage quota exceeded, clearing old items');
        await this.clearExpired();
        
        // Try again
        try {
          const prefixedKey = this.getPrefixedKey(key);
          const wrapped = this.wrapValue(value, ttl);
          this.storage.setItem(prefixedKey, wrapped);
        } catch (retryError) {
          console.error('WebStorageAdapter setItem retry error:', retryError);
        }
      } else {
        console.error('WebStorageAdapter setItem error:', error);
      }
    }
  }
  
  async removeItem(key: string): Promise<void> {
    if (!this.storage) return;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      this.storage.removeItem(prefixedKey);
    } catch (error) {
      console.error('WebStorageAdapter removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    if (!this.storage) return;
    
    try {
      if (this.options.namespace) {
        // Only clear items with our namespace
        const keys = await this.getAllKeys();
        for (const key of keys) {
          await this.removeItem(key);
        }
      } else {
        // Clear everything
        this.storage.clear();
      }
    } catch (error) {
      console.error('WebStorageAdapter clear error:', error);
    }
  }
  
  async getAllKeys(): Promise<string[]> {
    if (!this.storage) return [];
    
    try {
      const keys: string[] = [];
      const prefix = this.options.namespace ? `${this.options.namespace}:` : '';
      
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && (!prefix || key.startsWith(prefix))) {
          keys.push(this.removePrefixedKey(key));
        }
      }
      
      return keys;
    } catch (error) {
      console.error('WebStorageAdapter getAllKeys error:', error);
      return [];
    }
  }
  
  async hasItem(key: string): Promise<boolean> {
    const value = await this.getItem(key);
    return value !== null;
  }
  
  async getSize(): Promise<number> {
    if (!this.storage) return 0;
    
    try {
      let totalSize = 0;
      const keys = await this.getAllKeys();
      
      for (const key of keys) {
        const prefixedKey = this.getPrefixedKey(key);
        const value = this.storage.getItem(prefixedKey);
        if (value) {
          // Approximate size in bytes (2 bytes per character in JavaScript strings)
          totalSize += (prefixedKey.length + value.length) * 2;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('WebStorageAdapter getSize error:', error);
      return 0;
    }
  }
  
  /**
   * Clear expired items to free up space
   */
  private async clearExpired(): Promise<void> {
    if (!this.storage) return;
    
    const keys = await this.getAllKeys();
    
    for (const key of keys) {
      const value = await this.getItem(key);
      // getItem automatically removes expired items
      if (value === null) {
        await this.removeItem(key);
      }
    }
  }
  
  /**
   * Get available storage quota information (if supported)
   */
  async getQuota(): Promise<{ usage: number; quota: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return null;
    }
    
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    } catch (error) {
      console.error('WebStorageAdapter getQuota error:', error);
      return null;
    }
  }
}
