/**
 * Web Platform Entry Point
 * Optimized bundle for browser environments
 * Excludes: SSR, React Native, Electron-specific features
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

// Capability contract hooks (provider foundation, task F-03) + the registration function apps
// need to wire a provider up. The full contracts barrel (types + getCapabilityProvider etc.) is
// exported from the root entry point only — see src/index.ts.
export { useAuth, useCheckout, useStorage, useLive } from '../hooks/contracts.js';
export { registerCapabilityProvider } from '../contracts/registry.js';
export { registerMockProvider, getProviderConfig } from '../contracts/mockRegistry.js';
export { registerClientSafeProviderKeys } from '../config/validateConfig.js';

// Enums (re-exported directly so platform-entry consumers don't need to
// reach into `constants/enums.js` themselves). Uses a concrete value binding
// so esbuild eagerly runs the lazily-wrapped enum init thunk under
// `splitting` + `sideEffects:false`. See src/index.ts for the full rationale
// and tests/dist-entry-exports.test.ts for the regression guard.
import { HttpMethod as _HttpMethod } from '../constants/enums.js';
export const HttpMethod = _HttpMethod;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- legal TS value+type merge; the pair is what keeps the enum eagerly initialized
export type HttpMethod = _HttpMethod;

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
  FeatureModules,
  Platform,
  PlatformCapabilities
} from '../index.js';
