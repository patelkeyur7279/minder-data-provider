/**
 * React Native Storage Adapter
 * Uses AsyncStorage from @react-native-async-storage/async-storage
 * 
 * Note: This is a conditional import. The actual AsyncStorage is a peer dependency.
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

const logger = new Logger('NativeStorageAdapter', { level: LogLevel.ERROR });

export class NativeStorageAdapter extends BaseStorageAdapter {
  private AsyncStorage: any;
  
  constructor(options: StorageAdapterOptions = {}) {
    super(options);
    
    try {
      // Dynamic import for React Native AsyncStorage
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.AsyncStorage = require('@react-native-async-storage/async-storage').default;
    } catch {
       
      logger.warn('@react-native-async-storage/async-storage not found. Please install it as a peer dependency.');
      this.AsyncStorage = null;
    }
  }
  
  async getItem(key: string): Promise<string | null> {
    if (!this.AsyncStorage) return null;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = await this.AsyncStorage.getItem(prefixedKey);
      
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
    if (!this.AsyncStorage) return;
    
    try {
      await this.checkMaxSize();
      
      const prefixedKey = this.getPrefixedKey(key);
      const wrapped = this.wrapValue(value, ttl);
      
      await this.AsyncStorage.setItem(prefixedKey, wrapped);
    } catch (error) {
      logger.error('setItem error:', error);
    }
  }
  
  async removeItem(key: string): Promise<void> {
    if (!this.AsyncStorage) return;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      await this.AsyncStorage.removeItem(prefixedKey);
    } catch (error) {
      logger.error('removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    if (!this.AsyncStorage) return;
    
    try {
      if (this.options.namespace) {
        // Only clear items with our namespace
        const keys = await this.getAllKeys();
        const prefixedKeys = keys.map(k => this.getPrefixedKey(k));
        await this.AsyncStorage.multiRemove(prefixedKeys);
      } else {
        // Clear everything
        await this.AsyncStorage.clear();
      }
    } catch (error) {
      logger.error('clear error:', error);
    }
  }
  
  async getAllKeys(): Promise<string[]> {
    if (!this.AsyncStorage) return [];
    
    try {
      const allKeys = await this.AsyncStorage.getAllKeys();
      const prefix = this.options.namespace ? `${this.options.namespace}:` : '';
      
      return allKeys
        .filter((key: string) => !prefix || key.startsWith(prefix))
        .map((key: string) => this.removePrefixedKey(key));
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
    if (!this.AsyncStorage) return 0;
    
    try {
      const keys = await this.getAllKeys();
      const prefixedKeys = keys.map(k => this.getPrefixedKey(k));
      const values = await this.AsyncStorage.multiGet(prefixedKeys);
      
      let totalSize = 0;
      for (const [key, value] of values) {
        if (value) {
          totalSize += (key.length + value.length) * 2;
        }
      }
      
      return totalSize;
    } catch (error) {
      logger.error('getSize error:', error);
      return 0;
    }
  }
  
  /**
   * Batch get multiple items
   * Optimized for React Native AsyncStorage
   */
  async multiGet(keys: string[]): Promise<Array<[string, string | null]>> {
    if (!this.AsyncStorage) return [];
    
    try {
      const prefixedKeys = keys.map(k => this.getPrefixedKey(k));
      const results = await this.AsyncStorage.multiGet(prefixedKeys);
      
      return results.map(([key, value]: [string, string | null]) => {
        const unwrappedKey = this.removePrefixedKey(key);
        const unwrappedValue = value ? this.unwrapValue<string>(value) : null;
        return [unwrappedKey, unwrappedValue];
      });
    } catch (error) {
      logger.error('multiGet error:', error);
      return [];
    }
  }
  
  /**
   * Batch set multiple items
   * Optimized for React Native AsyncStorage
   */
  async multiSet(keyValuePairs: Array<[string, string]>, ttl?: number): Promise<void> {
    if (!this.AsyncStorage) return;
    
    try {
      const wrappedPairs = keyValuePairs.map(([key, value]) => [
        this.getPrefixedKey(key),
        this.wrapValue(value, ttl)
      ]);
      
      await this.AsyncStorage.multiSet(wrappedPairs);
    } catch (error) {
      logger.error('multiSet error:', error);
    }
  }
}
