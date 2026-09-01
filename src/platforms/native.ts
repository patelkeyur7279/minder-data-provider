/**
 * React Native Platform Entry Point
 * Optimized for React Native apps
 * Excludes: SSR, Web-specific APIs, Electron features
 */

// Core functionality
// M3 (fix-2.2.0-blockers, BREAKING): `configureMinder` was sourced from
// `../core/minder.js`, the `@deprecated` baseURL/headers-only configurator
// (src/core/minder.ts:163) that does NOT register routes and whose own
// deprecation warning tells the user to import the very thing they already
// imported. The real implementation lives in `../config/index.js`.
export { minder } from '../core/minder.js';
export { configureMinder } from '../config/index.js';
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
// M2 (fix-2.2.0-blockers): export the non-throwing `useMinderContextSafe`
// accessor alongside the throwing `useMinderContext` — see src/index.ts.
export { MinderDataProvider, useMinderContext, useMinderContextSafe } from '../core/MinderDataProvider.js';
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

// HttpMethod re-exported via a concrete value binding (eager enum init under
// tsup splitting + sideEffects:false) — same fix as web.ts, so RN/Expo/Node
// consumers get a defined enum instead of undefined. Guarded by
// tests/dist-entry-exports.test.ts.
import { HttpMethod as _HttpMethod } from '../constants/enums.js';
export const HttpMethod = _HttpMethod;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- legal TS value+type merge keeps the enum eagerly initialized
export type HttpMethod = _HttpMethod;
