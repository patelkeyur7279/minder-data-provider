/**
 * Electron Platform Entry Point
 * Optimized for Electron desktop apps
 * Includes: Web features + Electron-specific storage + IPC support
 */

// Everything from web
export * from './web.js';

// Electron-specific storage
export { 
  ElectronStorageAdapter 
} from '../platform/adapters/storage/index.js';

// Additional types for Electron
export type { 
  ElectronStorageAdapter as DesktopStorageAdapter 
} from '../platform/adapters/storage/index.js';

// Note: Electron IPC network adapter will be added in Phase 3
// export * from '../platform/adapters/network/ElectronNetworkAdapter.js';
