/**
 * Storage Adapter Factory
 * Automatically creates the appropriate storage adapter based on platform detection
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { PlatformDetector } from '../../PlatformDetector.js';
import { PlatformCapabilityDetector } from '../../PlatformCapabilities.js';
import type { Platform } from '../../PlatformDetector.js';
import { StorageAdapter, StorageAdapterOptions } from './StorageAdapter.js';
import { WebStorageAdapter } from './WebStorageAdapter.js';
import { MemoryStorageAdapter } from './MemoryStorageAdapter.js';
import { NativeStorageAdapter } from './NativeStorageAdapter.js';
import { ExpoStorageAdapter } from './ExpoStorageAdapter.js';
import { ElectronStorageAdapter } from './ElectronStorageAdapter.js';

const logger = new Logger('StorageAdapterFactory', { level: LogLevel.WARN });

export class StorageAdapterFactory {
  /**
   * Create a storage adapter for the specified platform
   * If no platform is specified, auto-detects the current platform
   */
  static create(
    platform?: Platform,
    options?: StorageAdapterOptions
  ): StorageAdapter {
    const detectedPlatform = platform || PlatformDetector.detect();
    const capabilities = PlatformCapabilityDetector.getCapabilities(detectedPlatform);

    // If persistent storage is not supported, use memory storage
    if (!capabilities.cache.persistent) {
      return new MemoryStorageAdapter(options);
    }

    // Select adapter based on storage type capability
    switch (capabilities.cache.storageType) {
      case 'localStorage':
        return this.createWebStorage(options);
      
      case 'AsyncStorage':
        return this.createNativeStorage(options);
      
      case 'SecureStore':
        return this.createExpoStorage(options);
      
      case 'electron-store':
        return this.createElectronStorage(options);
      
      default:
        // Fallback to memory storage
        logger.warn(`No suitable storage adapter found for platform ${detectedPlatform}, using memory storage`);
        return new MemoryStorageAdapter(options);
    }
  }

  /**
   * Create Web storage adapter (localStorage or sessionStorage)
   */
  private static createWebStorage(options?: StorageAdapterOptions): StorageAdapter {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return new WebStorageAdapter(localStorage, options);
      }
    } catch (error) {
      logger.warn('localStorage not available:', error);
    }
    
    return new MemoryStorageAdapter(options);
  }

  /**
   * Create React Native storage adapter (AsyncStorage)
   */
  private static createNativeStorage(options?: StorageAdapterOptions): StorageAdapter {
    try {
      const adapter = new NativeStorageAdapter(options);
      // Check if AsyncStorage was successfully loaded
      if ((adapter as any).AsyncStorage) {
        return adapter;
      }
    } catch (error) {
      logger.warn('AsyncStorage not available:', error);
    }
    
    return new MemoryStorageAdapter(options);
  }

  /**
   * Create Expo storage adapter (SecureStore)
   */
  private static createExpoStorage(options?: StorageAdapterOptions): StorageAdapter {
    try {
      const adapter = new ExpoStorageAdapter(options);
      // Check if SecureStore was successfully loaded
      if ((adapter as any).SecureStore) {
        return adapter;
      }
    } catch (error) {
      logger.warn('SecureStore not available:', error);
    }
    
    return new MemoryStorageAdapter(options);
  }

  /**
   * Create Electron storage adapter (electron-store)
   */
  private static createElectronStorage(options?: StorageAdapterOptions): StorageAdapter {
    try {
      const adapter = new ElectronStorageAdapter(options);
      // Check if electron-store was successfully loaded
      if ((adapter as any).store) {
        return adapter;
      }
    } catch (error) {
      logger.warn('electron-store not available:', error);
    }
    
    return new MemoryStorageAdapter(options);
  }

  /**
   * Create a storage adapter with auto-retry fallback
   * Tries to create the preferred adapter, falls back to memory if it fails
   */
  static createWithFallback(
    preferredPlatform?: Platform,
    options?: StorageAdapterOptions
  ): StorageAdapter {
    try {
      return this.create(preferredPlatform, options);
    } catch (error) {
      logger.error('Failed to create storage adapter, falling back to memory storage:', error);
      return new MemoryStorageAdapter(options);
    }
  }

  /**
   * Create session storage adapter (non-persistent)
   * Uses sessionStorage on web, memory storage elsewhere
   */
  static createSessionStorage(options?: StorageAdapterOptions): StorageAdapter {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return new WebStorageAdapter(sessionStorage, options);
    }
    
    return new MemoryStorageAdapter(options);
  }

  /**
   * Create memory storage adapter
   * Useful for testing or when persistence is not needed
   */
  static createMemoryStorage(options?: StorageAdapterOptions): StorageAdapter {
    return new MemoryStorageAdapter(options);
  }

  /**
   * Get information about available storage adapters
   */
  static getAvailableAdapters(): {
    platform: Platform;
    recommendedAdapter: string;
    availableAdapters: string[];
  } {
    const platform = PlatformDetector.detect();
    const capabilities = PlatformCapabilityDetector.getCapabilities(platform);
    
    const availableAdapters: string[] = ['MemoryStorageAdapter'];
    
    // Check what's available in current environment
    if (typeof window !== 'undefined') {
      if (window.localStorage) {
        availableAdapters.push('WebStorageAdapter (localStorage)');
      }
      if (window.sessionStorage) {
        availableAdapters.push('WebStorageAdapter (sessionStorage)');
      }
    }
    
    // Try to detect peer dependencies
    try {
      require('@react-native-async-storage/async-storage');
      availableAdapters.push('NativeStorageAdapter');
    } catch {}
    
    try {
      require('expo-secure-store');
      availableAdapters.push('ExpoStorageAdapter');
    } catch {}
    
    try {
      require('electron-store');
      availableAdapters.push('ElectronStorageAdapter');
    } catch {}
    
    return {
      platform,
      recommendedAdapter: capabilities.cache.storageType || 'MemoryStorageAdapter',
      availableAdapters
    };
  }
}
