/**
 * Expo Secure Storage Adapter
 * Uses SecureStore from expo-secure-store for encrypted storage
 * 
 * Note: This is a conditional import. The actual SecureStore is a peer dependency.
 */

import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

export class ExpoStorageAdapter extends BaseStorageAdapter {
  private SecureStore: any;
  private keysKey: string;
  
  constructor(options: StorageAdapterOptions = {}) {
    super(options);
    this.keysKey = `${this.options.namespace}:__keys__`;
    
    try {
      // Dynamic import for Expo SecureStore
      this.SecureStore = require('expo-secure-store');
    } catch (error) {
      console.warn('ExpoStorageAdapter: expo-secure-store not found. Please install it as a peer dependency.');
      this.SecureStore = null;
    }
  }
  
  async getItem(key: string): Promise<string | null> {
    if (!this.SecureStore) return null;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = await this.SecureStore.getItemAsync(prefixedKey);
      
      if (!wrapped) return null;
      
      const value = this.unwrapValue<string>(wrapped);
      
      // If expired, remove and return null
      if (value === null) {
        await this.removeItem(key);
        return null;
      }
      
      return value;
    } catch (error) {
      console.error('ExpoStorageAdapter getItem error:', error);
      return null;
    }
  }
  
  async setItem(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.SecureStore) return;
    
    try {
      await this.checkMaxSize();
      
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.wrapValue(value, ttl);
      
      // SecureStore automatically encrypts! ✨
      await this.SecureStore.setItemAsync(prefixedKey, wrapped);
      
      // Track keys for getAllKeys() since SecureStore doesn't have a list method
      await this.addKey(key);
    } catch (error) {
      console.error('ExpoStorageAdapter setItem error:', error);
    }
  }
  
  async removeItem(key: string): Promise<void> {
    if (!this.SecureStore) return;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      await this.SecureStore.deleteItemAsync(prefixedKey);
      
      // Remove from keys list
      await this.removeKey(key);
    } catch (error) {
      console.error('ExpoStorageAdapter removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    if (!this.SecureStore) return;
    
    try {
      const keys = await this.getAllKeys();
      
      for (const key of keys) {
        await this.removeItem(key);
      }
      
      // Clear keys list
      await this.SecureStore.deleteItemAsync(this.keysKey);
    } catch (error) {
      console.error('ExpoStorageAdapter clear error:', error);
    }
  }
  
  async getAllKeys(): Promise<string[]> {
    if (!this.SecureStore) return [];
    
    try {
      const keysJson = await this.SecureStore.getItemAsync(this.keysKey);
      
      if (!keysJson) return [];
      
      return JSON.parse(keysJson) as string[];
    } catch (error) {
      console.error('ExpoStorageAdapter getAllKeys error:', error);
      return [];
    }
  }
  
  async hasItem(key: string): Promise<boolean> {
    const value = await this.getItem(key);
    return value !== null;
  }
  
  async getSize(): Promise<number> {
    if (!this.SecureStore) return 0;
    
    try {
      const keys = await this.getAllKeys();
      let totalSize = 0;
      
      for (const key of keys) {
        const prefixedKey = this.getPrefixedKey(key);
        const value = await this.SecureStore.getItemAsync(prefixedKey);
        if (value) {
          totalSize += (prefixedKey.length + value.length) * 2;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('ExpoStorageAdapter getSize error:', error);
      return 0;
    }
  }
  
  /**
   * Add a key to the keys list
   * SecureStore doesn't have a native way to list keys, so we maintain our own list
   */
  private async addKey(key: string): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      
      if (!keys.includes(key)) {
        keys.push(key);
        await this.SecureStore.setItemAsync(this.keysKey, JSON.stringify(keys));
      }
    } catch (error) {
      console.error('ExpoStorageAdapter addKey error:', error);
    }
  }
  
  /**
   * Remove a key from the keys list
   */
  private async removeKey(key: string): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      const filtered = keys.filter(k => k !== key);
      
      await this.SecureStore.setItemAsync(this.keysKey, JSON.stringify(filtered));
    } catch (error) {
      console.error('ExpoStorageAdapter removeKey error:', error);
    }
  }
  
  /**
   * Check if SecureStore is available on current device
   */
  async isAvailable(): Promise<boolean> {
    if (!this.SecureStore) return false;
    
    try {
      // Try to perform a test operation
      await this.SecureStore.setItemAsync('__test__', 'test');
      await this.SecureStore.deleteItemAsync('__test__');
      return true;
    } catch (error) {
      console.error('ExpoStorageAdapter isAvailable check failed:', error);
      return false;
    }
  }
}
