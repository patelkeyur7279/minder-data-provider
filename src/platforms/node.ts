/**
 * Node.js Platform Entry Point
 * Optimized for server-side Node.js applications
 * Excludes: React hooks, browser APIs, React Native features
 */

// Core functionality (no React hooks)
export { minder, configureMinder } from '../core/minder.js';

// Platform detection
export { PlatformDetector } from '../platform/PlatformDetector.js';
export { PlatformCapabilityDetector } from '../platform/PlatformCapabilities.js';

// Memory storage (no persistent storage in Node.js by default)
export { 
  MemoryStorageAdapter,
  StorageAdapterFactory 
} from '../platform/adapters/storage/index.js';

// Feature loader
export { FeatureLoader, createFeatureLoader } from '../core/FeatureLoader.js';

// Server-compatible features (no hooks)
export { AuthManager } from '../auth/index.js';
export { CacheManager } from '../cache/index.js';

// SSR support
export * from '../ssr/index.js';

// Debug
export { DebugManager } from '../debug/index.js';

// Core types
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
