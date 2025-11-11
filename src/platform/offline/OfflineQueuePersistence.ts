/**
 * Offline Queue Persistence
 * Auto-configures storage for offline queue based on platform
 * 
 * Automatically detects and uses:
 * - localStorage (Web)
 * - AsyncStorage (React Native/Expo)
 * - Memory fallback (SSR/unsupported platforms)
 */

import { StorageAdapterFactory } from '../adapters/storage/StorageAdapterFactory.js';
import { PlatformDetector } from '../PlatformDetector.js';
import type { StorageAdapter } from '../adapters/storage/StorageAdapter.js';
import type { OfflineConfig } from './types.js';
import { Logger, LogLevel } from '../../utils/Logger.js';

const logger = new Logger('OfflineQueuePersistence', { level: LogLevel.INFO });

/**
 * Get storage adapter for offline queue based on platform
 * @returns StorageAdapter instance or undefined if not available
 */
export async function getOfflineQueueStorage(): Promise<StorageAdapter | undefined> {
  const platform = PlatformDetector.detect();
  
  try {
    // Try to create storage adapter for current platform
    const adapter = StorageAdapterFactory.create();
    
    // Verify storage is working
    const testKey = '__minder_offline_test__';
    try {
      await adapter.setItem(testKey, 'test');
      await adapter.removeItem(testKey);
      
      logger.info(`Offline queue persistence enabled using ${adapter.constructor.name}`);
      return adapter;
    } catch (error) {
      logger.warn('Storage adapter created but not functional:', error);
      return undefined;
    }
  } catch (error) {
    logger.warn(`No persistent storage available for platform ${platform}:`, error);
    logger.warn('Offline queue will only persist in memory (lost on page refresh)');
    return undefined;
  }
}

/**
 * Enhanced offline config with auto-configured storage
 * @param userConfig - User-provided offline configuration
 * @returns Enhanced config with storage adapter
 */
export async function createOfflineConfigWithStorage(
  userConfig: OfflineConfig = {}
): Promise<OfflineConfig> {
  // If user already provided storage, use it
  if (userConfig.storage) {
    return userConfig;
  }
  
  // Auto-detect and configure storage
  const storage = await getOfflineQueueStorage();
  
  if (!storage) {
    // Log warning about lack of persistence
    if (userConfig.enabled !== false) {
      console.warn(`
⚠️  Minder Offline Queue: No Persistent Storage

Offline requests will be queued in memory but will be lost on:
- Page refresh (Web)
- App restart (Mobile)
- Tab close (Web)

To enable persistence:

Web:
  - localStorage is used automatically
  - Check browser privacy settings

React Native:
  - Install @react-native-async-storage/async-storage
  - Add to your dependencies

Expo:
  - expo-secure-store or expo-file-system
  - Add to your dependencies

Or provide custom storage:
  configureMinder({
    offline: {
      storage: yourStorageAdapter
    }
  });
      `.trim());
    }
  }
  
  return {
    ...userConfig,
    storage,
  };
}

/**
 * Test if persistent storage is available
 * @returns true if storage is available and working
 */
export async function isPersistentStorageAvailable(): Promise<boolean> {
  const storage = await getOfflineQueueStorage();
  return storage !== undefined;
}

/**
 * Get info about current storage configuration
 */
export async function getStorageInfo(): Promise<{
  available: boolean;
  type: string;
  persistent: boolean;
}> {
  const storage = await getOfflineQueueStorage();
  const platform = PlatformDetector.detect();
  
  if (!storage) {
    return {
      available: false,
      type: 'none',
      persistent: false,
    };
  }
  
  return {
    available: true,
    type: storage.constructor.name,
    persistent: true,
  };
}
