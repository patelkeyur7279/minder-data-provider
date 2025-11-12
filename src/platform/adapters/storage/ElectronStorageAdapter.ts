/**
 * Electron Storage Adapter
 * Uses electron-store for persistent storage in Electron apps
 * 
 * Note: This is a conditional import. electron-store is a peer dependency.
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

const logger = new Logger('ElectronStorageAdapter', { level: LogLevel.ERROR });

export class ElectronStorageAdapter extends BaseStorageAdapter {
  private store: any;
  
  constructor(options: StorageAdapterOptions = {}) {
    super(options);
    
    try {
      // Dynamic import for electron-store
       
      const Store = require('electron-store');
      this.store = new Store({
        name: options.namespace || 'minder-cache',
        encryptionKey: options.encrypt ? this.generateEncryptionKey() : undefined
      });
    } catch (error) {
      logger.warn('electron-store not found. Please install it as a peer dependency.');
      this.store = null;
    }
  }
  
  async getItem(key: string): Promise<string | null> {
    if (!this.store) return null;
    
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
    if (!this.store) return;
    
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
    if (!this.store) return;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      this.store.delete(prefixedKey);
    } catch (error) {
      logger.error('removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    if (!this.store) return;
    
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
    if (!this.store) return [];
    
    try {
      // electron-store doesn't have a native keys() method in older versions
      // We get the entire store and extract keys
      const allData = this.store.store || {};
      const allKeys = Object.keys(allData);
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
    if (!this.store) return false;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      return this.store.has(prefixedKey);
    } catch (error) {
      logger.error('hasItem error:', error);
      return false;
    }
  }
  
  async getSize(): Promise<number> {
    if (!this.store) return 0;
    
    try {
      const keys = await this.getAllKeys();
      let totalSize = 0;
      
      for (const key of keys) {
        const prefixedKey = this.getPrefixedKey(key);
        const value = this.store.get(prefixedKey);
        if (value) {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          totalSize += (prefixedKey.length + stringValue.length) * 2;
        }
      }
      
      return totalSize;
    } catch (error) {
      logger.error('getSize error:', error);
      return 0;
    }
  }
  
  /**
   * Get the file path where data is stored
   */
  getStorePath(): string | null {
    if (!this.store) return null;
    
    try {
      return this.store.path;
    } catch (error) {
      logger.error('getStorePath error:', error);
      return null;
    }
  }
  
  /**
   * Watch for changes to a specific key
   */
  watch(key: string, callback: (newValue: any, oldValue: any) => void): (() => void) | null {
    if (!this.store) return null;
    
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const unsubscribe = this.store.onDidChange(prefixedKey, callback);
      return unsubscribe;
    } catch (error) {
      logger.error('watch error:', error);
      return null;
    }
  }
  
  /**
   * Generate encryption key for electron-store
   */
  private generateEncryptionKey(): string {
    // In production, this should be stored securely (e.g., using electron's safeStorage)
    // For now, we'll use a simple obfuscation
    const appName = process.env.npm_package_name || 'minder-app';
     
    const machineId = require('os').hostname();
    
    return `${appName}-${machineId}`;
  }
  
  /**
   * Open the storage file in the default editor (for debugging)
   */
  openInEditor(): void {
    if (!this.store) return;
    
    try {
      this.store.openInEditor();
    } catch (error) {
      logger.error('openInEditor error:', error);
    }
  }
}
