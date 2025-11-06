/**
 * React Native Platform Entry Point
 * Optimized for React Native apps
 * Excludes: SSR, Web-specific APIs, Electron features
 */

// Core functionality
export { minder, configureMinder } from '../core/minder.js';
export { useMinder } from '../hooks/useMinder.js';

// Platform detection
export { PlatformDetector } from '../platform/PlatformDetector.js';
export { PlatformCapabilityDetector } from '../platform/PlatformCapabilities.js';

// React Native storage
export { 
  NativeStorageAdapter,
  MemoryStorageAdapter,
  StorageAdapterFactory 
} from '../platform/adapters/storage/index.js';

// Feature loader
export { FeatureLoader, createFeatureLoader } from '../core/FeatureLoader.js';

// Mobile-compatible features
export * from '../auth/index.js';
export * from '../cache/index.js';
export * from '../websocket/index.js';
export * from '../upload/index.js';

// Debug (production-safe)
export * from '../debug/index.js';

// Advanced features
export * from '../plugins/index.js';
export * from '../query/index.js';

// Legacy support
export { MinderDataProvider, useMinderContext } from '../core/MinderDataProvider.js';
export * from '../core/types.js';

// Types
export type { 
  MinderOptions, 
  MinderResult, 
  MinderError,
  MinderConfig,
  FeatureFlags,
  Platform,
  PlatformCapabilities
} from '../index.js';

// Note: Offline support will be added in Phase 5
// export * from '../platform/offline/index.js';
