/**
 * 🎯 MINDER DATA PROVIDER
 * Production-ready hybrid data provider for React & Next.js
 * 
 * ONE function to rule them all!
 * 
 * @example Pure function (best performance)
 * import { minder } from 'minder-data-provider';
 * const { data } = await minder('users');
 * 
 * @example React hook (reactive state)
 * import { useMinder } from 'minder-data-provider';
 * const { data, loading } = useMinder('users');
 */

// ============================================================================
// VERSION VALIDATION - Auto-check for conflicts
// ============================================================================
import { checkReactVersionAtRuntime } from './utils/version-validator.js';

// Auto-check in development mode
if (process.env.NODE_ENV === 'development') {
  checkReactVersionAtRuntime();
}

// ============================================================================
// CORE EXPORTS - NEW ARCHITECTURE
// ============================================================================

// Core universal function
export { minder, configureMinder } from './core/minder.js';
export type {
  MinderOptions,
  MinderResult,
  MinderError as MinderRequestError, // Renamed to avoid conflict with error class
  UploadProgress,
} from './core/minder.js';

// React hook
export { useMinder } from './hooks/useMinder.js';
export type {
  UseMinderOptions,
  UseMinderReturn,
} from './hooks/useMinder.js';

// ============================================================================
// LEGACY EXPORTS - For backward compatibility
// ============================================================================

// Provider component (old architecture - RE-ENABLED for backward compatibility)
export { MinderDataProvider, useMinderContext } from './core/MinderDataProvider.js';
export * from './core/types.js';
export * from './core/EnvironmentManager.js';
export * from './core/ProxyManager.js';
export * from './core/LightConfig.js';

// Base model
export { BaseModel } from './models/BaseModel.js';

// Old hooks (RE-ENABLED for backward compatibility)
export * from './hooks/index.js';
export * from './hooks/useEnvironment.js';
export * from './utils/index.js';

// Modular exports for tree-shaking (RE-ENABLED)
export * from './crud/index.js';
export * from './auth/index.js';
export * from './cache/index.js';
export * from './websocket/index.js';
export * from './upload/index.js';
export * from './debug/index.js';
export * from './config/index.js';
export * from './ssr/index.js';

// ============================================================================
// ADVANCED FEATURES (v2.0)
// ============================================================================

export * from './devtools/index.js';
export * from './plugins/index.js';
export * from './query/index.js';

// Error Boundary Component
export { MinderErrorBoundary, useErrorHandler } from './components/index.js';
export type { ErrorBoundaryProps } from './components/index.js';

// ============================================================================
// PLATFORM SUPPORT (v2.1)
// ============================================================================

// Platform detection and capabilities
export { PlatformDetector, PlatformCapabilityDetector } from './platform/index.js';
export type { PlatformCapabilities } from './platform/index.js';
// Note: Platform enum is exported from constants/enums.js instead

// Note: Platform adapters and factories are exported from './platform/index.js'
// Import from 'minder-data-provider/platform' for platform-specific features
// This avoids type name conflicts between legacy types and new platform types

// FeatureLoader for dynamic bundle optimization
export { FeatureLoader, createFeatureLoader } from './core/FeatureLoader.js';
export type { FeatureFlags, FeatureModules, FeatureLoaderOptions } from './core/FeatureLoader.js';

// ============================================================================
// ERROR CLASSES
// ============================================================================

// Custom error classes for type-safe error handling
export {
  MinderError,
  MinderConfigError,
  MinderNetworkError,
  MinderValidationError,
  MinderAuthError,
  MinderAuthorizationError,
  MinderStorageError,
  MinderPlatformError,
  MinderSecurityError,
  MinderTimeoutError,
  MinderOfflineError,
  MinderPluginError,
  MinderWebSocketError,
  MinderUploadError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from './errors/index.js';

// ============================================================================
// MIDDLEWARE EXPORTS
// ============================================================================

// Rate Limiter
export {
  RateLimiter,
  MemoryRateLimitStore,
  createRateLimiter,
  createNextRateLimiter,
  createExpressRateLimiter,
  RateLimitPresets,
} from './middleware/rate-limiter.js';
export type {
  RateLimitConfig,
} from './middleware/rate-limiter.js';

// ============================================================================
// ENUMS & CONSTANTS - Type-safe values for configuration
// ============================================================================

// Export all enums for type-safe configuration
export {
  // HTTP & Network
  HttpMethod,
  QueryStatus,
  NetworkState,
  RetryStrategy,
  
  // Logging & Debugging
  LogLevel,
  
  // Storage & Caching
  StorageType,
  CacheType,
  CacheRequirements,
  
  // Security
  SecurityLevel,
  TokenType,
  
  // Platform
  Platform,
  Environment,
  
  // Data & Size
  DataSize,
  PrefetchStrategy,
  
  // Configuration
  ConfigPreset,
  
  // UI & Notifications
  NotificationType,
  
  // WebSocket
  WebSocketState,
  
  // Upload
  UploadState,
  
  // CRUD
  CrudOperation,
  
  // Authentication
  AuthState,
  
  // Sorting & Pagination
  SortOrder,
  PaginationType,
  
  // Errors
  ErrorCode,
  
  // Constants
  DEFAULT_VALUES,
  HTTP_STATUS,
  MIME_TYPES,
  STORAGE_KEYS,
  EVENTS,
  
  // Type Guards
  isHttpMethod,
  isQueryStatus,
  isLogLevel,
  isPlatform,
  isStorageType,
  isSecurityLevel,
  isDataSize,
  isConfigPreset,
} from './constants/enums.js';

// Export enum utility types
export type {
  HttpMethodType,
  QueryStatusType,
  LogLevelType,
  StorageTypeType,
  PlatformType,
  SecurityLevelType,
  DataSizeType,
  ConfigPresetType,
  NotificationTypeType,
} from './constants/enums.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { minder as default } from './core/minder.js';
