/**
 * Constants and Enums Module
 * 
 * Centralized location for all static values, enums, and constants used throughout the application.
 * Import from this module to ensure type safety and prevent typos.
 * 
 * @example
 * ```typescript
 * import { HttpMethod, LogLevel, Platform, DEFAULT_VALUES } from 'minder-data-provider/constants';
 * 
 * // Use enums for type-safe values
 * const method = HttpMethod.GET;
 * const level = LogLevel.ERROR;
 * const platform = Platform.WEB;
 * 
 * // Use constants for configuration
 * const pageSize = DEFAULT_VALUES.PAGE_SIZE;
 * ```
 */

export * from './enums';

// Re-export for convenience
export {
  HttpMethod,
  QueryStatus,
  LogLevel,
  StorageType,
  CacheType,
  CacheRequirements,
  SecurityLevel,
  Platform,
  DataSize,
  PrefetchStrategy,
  ConfigPreset,
  NotificationType,
  Environment,
  WebSocketState,
  UploadState,
  NetworkState,
  CrudOperation,
  AuthState,
  TokenType,
  RetryStrategy,
  SortOrder,
  PaginationType,
  ErrorCode,
  DEFAULT_VALUES,
  HTTP_STATUS,
  MIME_TYPES,
  STORAGE_KEYS,
  EVENTS,
  // Type guards
  isHttpMethod,
  isQueryStatus,
  isLogLevel,
  isPlatform,
  isStorageType,
  isSecurityLevel,
  isDataSize,
  isConfigPreset,
} from './enums';
