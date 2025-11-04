/**
 * Universal Storage Adapter Interface
 * 
 * Provides a unified API for storage across all platforms
 * with support for TTL, encryption, and namespacing.
 */

export interface StorageAdapterOptions {
  /**
   * Namespace prefix for all keys
   * Useful for isolating storage between different apps/features
   */
  namespace?: string;
  
  /**
   * Enable encryption for stored values
   * Note: Requires platform support (e.g., Expo SecureStore)
   */
  encrypt?: boolean;
  
  /**
   * Default TTL (time-to-live) in milliseconds
   * Items will auto-expire after this duration
   */
  ttl?: number;
  
  /**
   * Maximum number of items to store
   * Useful for preventing storage overflow
   */
  maxSize?: number;
}

export interface StorageItem<T = any> {
  value: T;
  expiresAt?: number;
  createdAt: number;
}

/**
 * Universal Storage Adapter Interface
 * All platform-specific storage implementations must implement this interface
 */
export interface StorageAdapter {
  /**
   * Get an item from storage
   * Returns null if item doesn't exist or has expired
   */
  getItem(key: string): Promise<string | null>;
  
  /**
   * Set an item in storage
   * @param key Storage key
   * @param value Value to store (will be stringified)
   * @param ttl Optional TTL override for this item
   */
  setItem(key: string, value: string, ttl?: number): Promise<void>;
  
  /**
   * Remove an item from storage
   */
  removeItem(key: string): Promise<void>;
  
  /**
   * Clear all items in storage (respects namespace if set)
   */
  clear(): Promise<void>;
  
  /**
   * Get all keys in storage (respects namespace if set)
   */
  getAllKeys(): Promise<string[]>;
  
  /**
   * Check if an item exists and hasn't expired
   */
  hasItem(key: string): Promise<boolean>;
  
  /**
   * Get the size of stored data (in bytes, approximate)
   */
  getSize(): Promise<number>;
}

/**
 * Base Storage Adapter
 * Provides common functionality for all storage adapters
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  protected options: StorageAdapterOptions;
  
  constructor(options: StorageAdapterOptions = {}) {
    this.options = {
      namespace: options.namespace || 'minder',
      encrypt: options.encrypt || false,
      ttl: options.ttl,
      maxSize: options.maxSize || 1000
    };
  }
  
  /**
   * Get the prefixed key (with namespace)
   */
  protected getPrefixedKey(key: string): string {
    return this.options.namespace ? `${this.options.namespace}:${key}` : key;
  }
  
  /**
   * Remove the prefix from a key
   */
  protected removePrefixedKey(prefixedKey: string): string {
    if (!this.options.namespace) return prefixedKey;
    
    const prefix = `${this.options.namespace}:`;
    return prefixedKey.startsWith(prefix) 
      ? prefixedKey.substring(prefix.length) 
      : prefixedKey;
  }
  
  /**
   * Wrap value with metadata (TTL, timestamps)
   */
  protected wrapValue<T>(value: T, ttl?: number): string {
    const effectiveTtl = ttl !== undefined ? ttl : this.options.ttl;
    
    const item: StorageItem<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: effectiveTtl ? Date.now() + effectiveTtl : undefined
    };
    
    return JSON.stringify(item);
  }
  
  /**
   * Unwrap value and check expiration
   */
  protected unwrapValue<T>(wrapped: string): T | null {
    try {
      const item: StorageItem<T> = JSON.parse(wrapped);
      
      // Check if expired
      if (item.expiresAt && Date.now() > item.expiresAt) {
        return null;
      }
      
      return item.value;
    } catch (error) {
      // If parsing fails, try to return raw value (backward compatibility)
      try {
        return JSON.parse(wrapped) as T;
      } catch {
        return wrapped as any;
      }
    }
  }
  
  /**
   * Check if storage has reached max size
   */
  protected async checkMaxSize(): Promise<void> {
    if (!this.options.maxSize) return;
    
    const keys = await this.getAllKeys();
    
    if (keys.length >= this.options.maxSize) {
      // Remove oldest items (FIFO)
      const oldestKey = keys[0];
      if (oldestKey) {
        await this.removeItem(oldestKey);
      }
    }
  }
  
  // Abstract methods that must be implemented by platform-specific adapters
  abstract getItem(key: string): Promise<string | null>;
  abstract setItem(key: string, value: string, ttl?: number): Promise<void>;
  abstract removeItem(key: string): Promise<void>;
  abstract clear(): Promise<void>;
  abstract getAllKeys(): Promise<string[]>;
  abstract hasItem(key: string): Promise<boolean>;
  abstract getSize(): Promise<number>;
}
