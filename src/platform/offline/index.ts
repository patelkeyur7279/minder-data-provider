/**
 * Offline Support Module
 * 
 * Provides offline capabilities for mobile platforms including
 * request queue management, background sync, and network detection.
 * 
 * @module platform/offline
 */

export * from './types.js';
export * from './OfflineManager.js';
export * from './useOffline.js';
// Note: OfflineQueuePersistence is not exported because it has platform-specific dependencies
// that may not be available in all environments. Use StorageAdapterFactory directly instead.
