/**
 * Expo Storage Adapter
 * Uses expo-secure-store for secure, encrypted storage
 * 
 * Note: This is a conditional import. expo-secure-store is a peer dependency.
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { BaseStorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';

const logger = /*#__PURE__*/ new Logger('ExpoStorageAdapter', { level: LogLevel.ERROR });

export class ExpoStorageAdapter extends BaseStorageAdapter {
  private SecureStore: any;
  private keysKey: string;

  /**
   * fix-b-transport-storage-websocket (BLOCKER 4, DATA-LOSS — see
   * CHANGELOG.md): expo-secure-store's REAL key constraint — verified
   * directly against the installed package's own source
   * (expo-secure-store/build/SecureStore.js: `isValidKey`) — is
   * `/^[\w.-]+$/` (letters, digits, underscore, `.`, `-` ONLY; checked
   * synchronously by `ensureValidKey()` BEFORE the call ever reaches the
   * native module). `BaseStorageAdapter.getPrefixedKey()` (the shared
   * default every OTHER adapter here uses unmodified) joins `namespace`
   * and `key` with a COLON — `${namespace}:${key}` — a character
   * SecureStore rejects outright. Every `setItemAsync`/`getItemAsync`/
   * `deleteItemAsync` call below already catches and logs (never
   * rethrows), so this failure was never surfaced: `setToken()` "resolved
   * successfully" (`GlobalAuthManager.persistItem` also swallows its own
   * error), and a SEPARATE `GlobalAuthManager` instance with the SAME
   * `tokenKey` — i.e. the next app launch, since SecureStore is a real OS
   * keychain that persists across process restarts while a JS instance's
   * own in-memory `this.token` field does not — read back `null`. This is
   * not an edge case: `getPrefixedKey`'s default `namespace` is
   * `'minder'`, so this was the DEFAULT, out-of-the-box behavior for
   * every Expo consumer of this package, not something a caller had to
   * opt into.
   *
   * FIX: override the shared prefix builder with one whose output can
   * never violate `/^[\w.-]+$/` — `.` (itself an allowed character)
   * replaces `:` as the namespace/key separator, and any OTHER character
   * outside the allowed set (in either the namespace or a caller-supplied
   * key — a space, `/`, `@`, ... would fail identically) is replaced with
   * `_` defensively. Deliberately scoped to THIS adapter alone —
   * `BaseStorageAdapter`'s `:`-joined default is unchanged for
   * Web/Native/Electron/Memory, none of which impose this restriction, so
   * this is not a cross-platform behavior change.
   */
  private static readonly UNSAFE_SECURE_STORE_KEY_CHARS = /[^\w.-]/g;

  private sanitizeForSecureStore(segment: string): string {
    return segment.replace(ExpoStorageAdapter.UNSAFE_SECURE_STORE_KEY_CHARS, '_');
  }

  protected getPrefixedKey(key: string): string {
    const safeKey = this.sanitizeForSecureStore(key);
    const namespace = this.options.namespace;
    return namespace ? `${this.sanitizeForSecureStore(namespace)}.${safeKey}` : safeKey;
  }

  protected removePrefixedKey(prefixedKey: string): string {
    const namespace = this.options.namespace;
    if (!namespace) return prefixedKey;

    const prefix = `${this.sanitizeForSecureStore(namespace)}.`;
    return prefixedKey.startsWith(prefix) ? prefixedKey.substring(prefix.length) : prefixedKey;
  }

  constructor(options: StorageAdapterOptions = {}) {
    super(options);
    // Built AFTER `super()` (so `this.options`/`sanitizeForSecureStore` are
    // ready) via the SAME safe-prefixing helper `getPrefixedKey` uses,
    // rather than a hand-rolled `${namespace}:__keys__` — the earlier
    // version's own key-tracking key had the identical `:` defect as every
    // other key here (see the class-level comment above).
    this.keysKey = this.getPrefixedKey('__keys__');

    try {
      // Dynamic import for Expo SecureStore
       
      this.SecureStore = require('expo-secure-store');
    } catch {
       
      logger.warn('expo-secure-store not found. Please install it as a peer dependency.');
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
      logger.error('getItem error:', error);
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
      logger.error('setItem error:', error);
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
      logger.error('removeItem error:', error);
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
      logger.error('clear error:', error);
    }
  }
  
  async getAllKeys(): Promise<string[]> {
    if (!this.SecureStore) return [];
    
    try {
      const keysJson = await this.SecureStore.getItemAsync(this.keysKey);
      
      if (!keysJson) return [];
      
      return JSON.parse(keysJson) as string[];
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
      logger.error('getSize error:', error);
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
      logger.error('addKey error:', error);
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
      logger.error('removeKey error:', error);
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
      logger.error('isAvailable check failed:', error);
      return false;
    }
  }
}
