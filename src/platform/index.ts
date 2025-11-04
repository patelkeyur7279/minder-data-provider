/**
 * Platform Detection and Capabilities Module
 * 
 * Automatically detects the runtime platform and provides
 * platform-specific capabilities information.
 * 
 * @example
 * ```typescript
 * import { PlatformDetector, PlatformCapabilityDetector } from 'minder-data-provider/platform';
 * 
 * // Detect current platform
 * const platform = PlatformDetector.detect(); // 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node'
 * 
 * // Get platform capabilities
 * const capabilities = PlatformCapabilityDetector.getCurrentCapabilities();
 * 
 * if (capabilities.ssr) {
 *   // Use SSR features
 * }
 * 
 * if (capabilities.offline.supported) {
 *   // Enable offline mode
 * }
 * ```
 */

// Platform Detection
export { PlatformDetector } from './PlatformDetector.js';
export type { Platform } from './PlatformDetector.js';

// Platform Capabilities
export { PlatformCapabilityDetector } from './PlatformCapabilities.js';
export type {
  PlatformCapabilities,
  AuthCapabilities,
  CacheCapabilities,
  WebSocketCapabilities,
  CorsCapabilities,
  FileUploadCapabilities,
  OfflineCapabilities,
  PushNotificationCapabilities,
  SecurityCapabilities,
  DevToolsCapabilities
} from './PlatformCapabilities.js';

// Storage Adapters
export * from './adapters/storage/index.js';

// Network Adapters
export * from './adapters/network/index.js';

// SSR/SSG Support
export * from './ssr/index.js';

// Offline Support
export * from './offline/index.js';
