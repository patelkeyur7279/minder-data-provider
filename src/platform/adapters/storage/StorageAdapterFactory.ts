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
      case 'sessionStorage':
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
        // Test if localStorage actually works (not disabled/private browsing)
        const testKey = '__minder_test__';
        window.localStorage.setItem(testKey, 'test');
        window.localStorage.removeItem(testKey);
        
        return new WebStorageAdapter(localStorage, options);
      }
    } catch (error) {
      logger.warn('localStorage not available or disabled:', error);
      
      console.warn(`
⚠️  Minder Storage Warning: localStorage not available

This usually means:
- Private browsing mode is enabled
- Cookies/localStorage are disabled in browser settings
- Storage quota is exceeded
- Running in a restricted environment

Using sessionStorage instead (if available) or falling back to memory storage.
      `.trim());
    }
    
    // Try sessionStorage as fallback
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const testKey = '__minder_test__';
        window.sessionStorage.setItem(testKey, 'test');
        window.sessionStorage.removeItem(testKey);
        
        return new WebStorageAdapter(sessionStorage, options);
      }
    } catch (error) {
      logger.warn('sessionStorage also not available:', error);
    }
    
    console.warn(`
🚨 Minder Storage Error: No persistent web storage available

Both localStorage and sessionStorage are disabled or unavailable.
This usually means you're in private browsing mode or have strict privacy settings.

Falling back to memory storage - data will be lost when the page refreshes!
    `.trim());
    
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
      
      // AsyncStorage not available - warn user and provide guidance
      const error = new Error(
        'AsyncStorage is not available. This usually means @react-native-async-storage/async-storage is not installed or linked properly.'
      );
      logger.error('AsyncStorage initialization failed:', error);
      
      // Provide helpful guidance
      console.warn(`
🚨 Minder Storage Error: AsyncStorage not available

This means your React Native app cannot persist data properly.
To fix this:

1. Install AsyncStorage:
   npm install @react-native-async-storage/async-storage
   # or
   yarn add @react-native-async-storage/async-storage

2. For React Native 0.60+: It's auto-linked
   For older versions: react-native link @react-native-async-storage/async-storage

3. If using Expo: AsyncStorage is built-in, check your setup

Falling back to memory storage - data will be lost on app restart!
      `.trim());
      
      return new MemoryStorageAdapter(options);
    } catch (error) {
      logger.error('AsyncStorage creation failed:', error);
      
      console.warn(`
🚨 Minder Storage Error: Failed to create AsyncStorage adapter

Error: ${error instanceof Error ? error.message : 'Unknown error'}

This usually indicates a configuration issue with your React Native setup.
Falling back to memory storage - data will be lost on app restart!

Check your React Native AsyncStorage installation and linking.
      `.trim());
      
      return new MemoryStorageAdapter(options);
    }
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
      
      // SecureStore not available - warn user and provide guidance
      const error = new Error(
        'Expo SecureStore is not available. This usually means expo-secure-store is not installed.'
      );
      logger.error('SecureStore initialization failed:', error);
      
      console.warn(`
🚨 Minder Storage Error: Expo SecureStore not available

This means your Expo app cannot use encrypted storage.
To fix this:

1. Install SecureStore:
   npx expo install expo-secure-store

2. If not using Expo managed workflow, SecureStore may not be available

Falling back to AsyncStorage (if available) or memory storage.
      `.trim());
      
      // Try to fall back to AsyncStorage for Expo
      try {
        return this.createNativeStorage(options);
      } catch {
        return new MemoryStorageAdapter(options);
      }
    } catch (error) {
      logger.error('SecureStore creation failed:', error);
      
      console.warn(`
🚨 Minder Storage Error: Failed to create Expo SecureStore adapter

Error: ${error instanceof Error ? error.message : 'Unknown error'}

This usually indicates expo-secure-store is not properly installed.
Falling back to AsyncStorage (if available) or memory storage.

Install with: npx expo install expo-secure-store
      `.trim());
      
      // Try to fall back to AsyncStorage for Expo
      try {
        return this.createNativeStorage(options);
      } catch {
        return new MemoryStorageAdapter(options);
      }
    }
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
      
      // electron-store not available - warn user and provide guidance
      const error = new Error(
        'electron-store is not available. This usually means electron-store is not installed.'
      );
      logger.error('electron-store initialization failed:', error);
      
      console.warn(`
🚨 Minder Storage Error: electron-store not available

This means your Electron app cannot persist data to disk.
To fix this:

1. Install electron-store:
   npm install electron-store
   # or
   yarn add electron-store

2. Make sure you're running in the Electron main process context

Falling back to memory storage - data will be lost when the app restarts!
      `.trim());
      
      return new MemoryStorageAdapter(options);
    } catch (error) {
      logger.error('electron-store creation failed:', error);
      
      console.warn(`
🚨 Minder Storage Error: Failed to create electron-store adapter

Error: ${error instanceof Error ? error.message : 'Unknown error'}

This usually indicates electron-store is not properly installed or
you're trying to use it in the renderer process instead of main process.

Falling back to memory storage - data will be lost when the app restarts!

Install with: npm install electron-store
      `.trim());
      
      return new MemoryStorageAdapter(options);
    }
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@react-native-async-storage/async-storage');
      availableAdapters.push('NativeStorageAdapter');
      // eslint-disable-next-line no-empty
    } catch {}
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-secure-store');
      availableAdapters.push('ExpoStorageAdapter');
      // eslint-disable-next-line no-empty
    } catch {}
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('electron-store');
      availableAdapters.push('ElectronStorageAdapter');
      // eslint-disable-next-line no-empty
    } catch {}
    
    return {
      platform,
      recommendedAdapter: capabilities.cache.storageType || 'MemoryStorageAdapter',
      availableAdapters
    };
  }
}
