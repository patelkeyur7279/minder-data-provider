/**
 * Node.js Platform Entry Point
 * Optimized for server-side Node.js applications
 * Excludes: React hooks, browser APIs, React Native features
 */

// Core functionality (no React hooks)
// M3 (fix-2.2.0-blockers, BREAKING): `configureMinder` was sourced from
// `../core/minder.js`, the `@deprecated` baseURL/headers-only configurator
// (src/core/minder.ts:163) that does NOT register routes and whose own
// deprecation warning tells the user to import the very thing they already
// imported. The real implementation lives in `../config/index.js`.
export { minder } from '../core/minder.js';
export { configureMinder } from '../config/index.js';

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

// Route processing (Node.js only)
export { RouteProcessor } from '../utils/routeProcessor.js';

// Generate configuration from Next.js API routes
export async function generateConfigFromApiRoutes(
  apiDir: string,
  options?: {
    framework?: 'nextjs' | 'express' | 'fastify' | 'custom';
    baseUrl?: string;
    includeDynamic?: boolean;
  }
): Promise<any> {
  // Dynamic import to avoid circular dependencies
  let RouteProcessor: any;
  try {
    RouteProcessor = (await import('../utils/routeProcessor.js')).RouteProcessor;
  } catch (error) {
    // In test environments that don't support dynamic imports, try static import
     
    const routeProcessorModule = require('../utils/routeProcessor.js');
    RouteProcessor = routeProcessorModule.RouteProcessor;
  }

  const scanOptions = {
    baseDir: apiDir,
    framework: options?.framework || 'nextjs',
    baseUrl: options?.baseUrl,
    includeDynamic: options?.includeDynamic ?? true,
    extensions: ['.ts', '.js', '.tsx', '.jsx']
  };

  const result = await RouteProcessor.generateFromDirectory(scanOptions);

  if (result.errors.length > 0) {
    console.warn('Route processing errors:', result.errors);
  }

  if (result.warnings.length > 0) {
    console.warn('Route processing warnings:', result.warnings);
  }

  return {
    routes: result.routes,
    processing: {
      errors: result.errors,
      warnings: result.warnings,
      routeCount: Object.keys(result.routes).length
    }
  };
}

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

// HttpMethod re-exported via a concrete value binding (eager enum init under
// tsup splitting + sideEffects:false) — same fix as web.ts, so RN/Expo/Node
// consumers get a defined enum instead of undefined. Guarded by
// tests/dist-entry-exports.test.ts.
import { HttpMethod as _HttpMethod } from '../constants/enums.js';
export const HttpMethod = _HttpMethod;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- legal TS value+type merge keeps the enum eagerly initialized
export type HttpMethod = _HttpMethod;
