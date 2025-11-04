/**
 * Web Platform Entry Point
 * Optimized bundle for browser environments
 * Excludes: SSR, React Native, Electron-specific features
 */

// Core functionality
export { minder, configureMinder } from '../core/minder.js';
export { useMinder } from '../hooks/useMinder.js';

// Platform detection
export { PlatformDetector } from '../platform/PlatformDetector.js';
export { PlatformCapabilityDetector } from '../platform/PlatformCapabilities.js';

// Web-compatible storage
export { 
  WebStorageAdapter,
  MemoryStorageAdapter,
  StorageAdapterFactory 
} from '../platform/adapters/storage/index.js';

// Feature loader for optimization
export { FeatureLoader, createFeatureLoader } from '../core/FeatureLoader.js';

// Standard features (lazy-loadable)
export * from '../auth/index.js';
export * from '../cache/index.js';
export * from '../websocket/index.js';
export * from '../upload/index.js';

// Development tools
export * from '../devtools/index.js';
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
  FeatureModules,
  Platform,
  PlatformCapabilities
} from '../index.js';
