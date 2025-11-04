/**
 * Storage Adapters Module
 * 
 * Provides unified storage interface across all platforms
 * with automatic adapter selection based on platform detection.
 * 
 * @example
 * ```typescript
 * import { StorageAdapterFactory } from 'minder-data-provider/platform/storage';
 * 
 * // Auto-select storage adapter based on platform
 * const storage = StorageAdapterFactory.create();
 * 
 * // Store data
 * await storage.setItem('user', JSON.stringify({ name: 'John' }));
 * 
 * // Retrieve data
 * const user = await storage.getItem('user');
 * ```
 */

export { StorageAdapterFactory } from './StorageAdapterFactory.js';

export type {
  StorageAdapter,
  StorageAdapterOptions,
  StorageItem
} from './StorageAdapter.js';

export { BaseStorageAdapter } from './StorageAdapter.js';
export { WebStorageAdapter } from './WebStorageAdapter.js';
export { MemoryStorageAdapter } from './MemoryStorageAdapter.js';
export { NativeStorageAdapter } from './NativeStorageAdapter.js';
export { ExpoStorageAdapter } from './ExpoStorageAdapter.js';
export { ElectronStorageAdapter } from './ElectronStorageAdapter.js';
