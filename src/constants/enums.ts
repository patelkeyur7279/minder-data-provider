/**
 * Centralized Enums and Constants for Minder Data Provider
 *
 * This file contains all static values that should be type-safe and immutable.
 *
 * SHAPE (v3.0 — Spec 1.3c §3/B1): each "enum" is an `as const` object plus a
 * same-named union type, NOT a TypeScript `enum`. Value access (`HttpMethod.GET`)
 * and type usage (`x: HttpMethod`) are unchanged and the runtime value STRINGS
 * are byte-identical, so `===` comparisons and serialized values are unaffected.
 * The reason for the shape: a non-const `enum` compiles to a runtime IIFE that
 * *mutates* an object at import time — a module side effect that a consumer
 * bundler treating the package as `sideEffects: false` will DROP from a shared
 * chunk, leaving `HttpMethod` undefined in production (dabd92d / MDPD-17). An
 * `as const` object has no import-time mutation: it is a plain value retained by
 * reference wherever it is used, so `sideEffects: false` is honest. This is a
 * BREAKING change only for TS consumers doing `enum`-only operations (e.g. using
 * the name in a `namespace`-merge or relying on nominal `enum` identity); see
 * docs/MIGRATION_GUIDE.md (v2.x → v3.0).
 */

/* eslint-disable @typescript-eslint/no-redeclare --
 * Every `export const X = {...} as const` is deliberately paired with an
 * `export type X = (typeof X)[keyof typeof X]` value+type merge — the whole point
 * of this file's shape (it replaces `enum`, which is itself a value+type merge).
 * The same idiom is suppressed inline at src/index.ts (HttpMethod re-export). A
 * file-level disable is correct here because the merge is intentional for ALL 24
 * declarations, not an accidental redeclaration. */

// ============================================
// HTTP Methods
// ============================================
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

// ============================================
// Query/Request Status
// ============================================
export const QueryStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;
export type QueryStatus = (typeof QueryStatus)[keyof typeof QueryStatus];

// ============================================
// Log Levels
// ============================================
export const LogLevel = {
  NONE: 'none',
  ERROR: 'error',
  WARN: 'warn',
  WARNING: 'warning',
  INFO: 'info',
  DEBUG: 'debug',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

// ============================================
// Storage Types
// ============================================
export const StorageType = {
  MEMORY: 'memory',
  LOCAL_STORAGE: 'localStorage',
  SESSION_STORAGE: 'sessionStorage',
  COOKIE: 'cookie',
  INDEXED_DB: 'indexedDB',
  ASYNC_STORAGE: 'AsyncStorage',
  SECURE_STORE: 'SecureStore',
  ELECTRON_STORE: 'electron-store',
} as const;
export type StorageType = (typeof StorageType)[keyof typeof StorageType];

// ============================================
// Cache Types
// ============================================
export const CacheType = {
  MEMORY: 'memory',
  PERSISTENT: 'persistent',
  HYBRID: 'hybrid',
} as const;
export type CacheType = (typeof CacheType)[keyof typeof CacheType];

export const CacheRequirements = {
  BASIC: 'basic',
  ADVANCED: 'advanced',
} as const;
export type CacheRequirements = (typeof CacheRequirements)[keyof typeof CacheRequirements];

// ============================================
// Security Levels
// ============================================
export const SecurityLevel = {
  NONE: 'none',
  BASIC: 'basic',
  STANDARD: 'standard',
  STRICT: 'strict',
} as const;
export type SecurityLevel = (typeof SecurityLevel)[keyof typeof SecurityLevel];

// ============================================
// Platform Types
// ============================================
export const Platform = {
  WEB: 'web',
  NEXT_JS: 'nextjs',
  REACT_NATIVE: 'react-native',
  NATIVE: 'native',
  EXPO: 'expo',
  ELECTRON: 'electron',
  NODE: 'node',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

// ============================================
// Data Size Estimates
// ============================================
export const DataSize = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
} as const;
export type DataSize = (typeof DataSize)[keyof typeof DataSize];

// ============================================
// Prefetch Strategies
// ============================================
export const PrefetchStrategy = {
  NONE: 'none',
  ESSENTIAL: 'essential',
  AGGRESSIVE: 'aggressive',
} as const;
export type PrefetchStrategy = (typeof PrefetchStrategy)[keyof typeof PrefetchStrategy];

// ============================================
// Config Presets
// ============================================
export const ConfigPreset = {
  MINIMAL: 'minimal',
  STANDARD: 'standard',
  ADVANCED: 'advanced',
  ENTERPRISE: 'enterprise',
  BALANCED: 'balanced',
  COMPREHENSIVE: 'comprehensive',
} as const;
export type ConfigPreset = (typeof ConfigPreset)[keyof typeof ConfigPreset];

// ============================================
// Notification/Alert Types
// ============================================
export const NotificationType = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// ============================================
// Debug Log Types
// ============================================
export const DebugLogType = {
  API: 'api',
  CACHE: 'cache',
  AUTH: 'auth',
  WEBSOCKET: 'websocket',
  UPLOAD: 'upload',
} as const;
export type DebugLogType = (typeof DebugLogType)[keyof typeof DebugLogType];

// ============================================
// Environment Types
// ============================================
export const Environment = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;
export type Environment = (typeof Environment)[keyof typeof Environment];

// ============================================
// WebSocket States
// ============================================
export const WebSocketState = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSING: 'closing',
  CLOSED: 'closed',
} as const;
export type WebSocketState = (typeof WebSocketState)[keyof typeof WebSocketState];

// ============================================
// Upload States
// ============================================
export const UploadState = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type UploadState = (typeof UploadState)[keyof typeof UploadState];

// ============================================
// Network States
// ============================================
export const NetworkState = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SLOW: 'slow',
  UNKNOWN: 'unknown',
} as const;
export type NetworkState = (typeof NetworkState)[keyof typeof NetworkState];

// ============================================
// CRUD Operations
// ============================================
export const CrudOperation = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  SEARCH: 'search',
} as const;
export type CrudOperation = (typeof CrudOperation)[keyof typeof CrudOperation];

// ============================================
// Authentication States
// ============================================
export const AuthState = {
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
  REFRESHING: 'refreshing',
} as const;
export type AuthState = (typeof AuthState)[keyof typeof AuthState];

// ============================================
// Token Types
// ============================================
export const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  ID: 'id',
  CSRF: 'csrf',
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];

// ============================================
// Retry Strategies
// ============================================
export const RetryStrategy = {
  NONE: 'none',
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  CUSTOM: 'custom',
} as const;
export type RetryStrategy = (typeof RetryStrategy)[keyof typeof RetryStrategy];

// ============================================
// Sort Orders
// ============================================
export const SortOrder = {
  ASC: 'asc',
  DESC: 'desc',
  ASCENDING: 'ascending',
  DESCENDING: 'descending',
} as const;
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

// ============================================
// Pagination Types
// ============================================
export const PaginationType = {
  OFFSET: 'offset',
  CURSOR: 'cursor',
  PAGE: 'page',
} as const;
export type PaginationType = (typeof PaginationType)[keyof typeof PaginationType];

// ============================================
// Error Codes
// ============================================
export const ErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================
// Constants (non-enum values)
// ============================================

export const DEFAULT_VALUES = {
  PAGE_SIZE: 10,
  CACHE_TTL: 300000, // 5 minutes
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  DEBOUNCE_DELAY: 300, // 300ms
  THROTTLE_DELAY: 1000, // 1 second
  MAX_CACHE_SIZE: 100,
  MAX_FILE_SIZE: 10485760, // 10MB
  WEBSOCKET_RECONNECT_DELAY: 5000, // 5 seconds
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const MIME_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded',
  TEXT: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
  PDF: 'application/pdf',
  IMAGE_PNG: 'image/png',
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_GIF: 'image/gif',
  IMAGE_SVG: 'image/svg+xml',
} as const;

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'minder_auth_token',
  REFRESH_TOKEN: 'minder_refresh_token',
  USER_DATA: 'minder_user_data',
  SETTINGS: 'minder_settings',
  CACHE_PREFIX: 'minder_cache_',
  OFFLINE_QUEUE: 'minder_offline_queue',
} as const;

export const EVENTS = {
  AUTH_LOGIN: 'minder:auth:login',
  AUTH_LOGOUT: 'minder:auth:logout',
  AUTH_REFRESH: 'minder:auth:refresh',
  CACHE_INVALIDATE: 'minder:cache:invalidate',
  NETWORK_ONLINE: 'minder:network:online',
  NETWORK_OFFLINE: 'minder:network:offline',
  UPLOAD_START: 'minder:upload:start',
  UPLOAD_PROGRESS: 'minder:upload:progress',
  UPLOAD_COMPLETE: 'minder:upload:complete',
  UPLOAD_ERROR: 'minder:upload:error',
} as const;

// ============================================
// Type Guards (Generic Factory)
// ============================================

/**
 * Generic type guard factory function
 * Creates type guard functions for any enum to avoid code duplication
 *
 * @template T - The `as const` object type
 * @param enumObj - The `as const` object
 * @returns Type guard function that checks if value is valid member
 *
 * @example
 * const isHttpMethod = createEnumTypeGuard(HttpMethod);
 * isHttpMethod('GET') // true
 * isHttpMethod('INVALID') // false
 */
function createEnumTypeGuard<T extends Record<string, string>>(
  enumObj: T
): (value: string) => value is T[keyof T] {
  return (value: string): value is T[keyof T] => {
    return Object.values(enumObj).includes(value as T[keyof T]);
  };
}

/**
 * Type guard for HttpMethod
 * @param value - String value to check
 * @returns True if value is a valid HttpMethod
 */
export const isHttpMethod = createEnumTypeGuard(HttpMethod);

/**
 * Type guard for QueryStatus
 * @param value - String value to check
 * @returns True if value is a valid QueryStatus
 */
export const isQueryStatus = createEnumTypeGuard(QueryStatus);

/**
 * Type guard for LogLevel
 * @param value - String value to check
 * @returns True if value is a valid LogLevel
 */
export const isLogLevel = createEnumTypeGuard(LogLevel);

/**
 * Type guard for Platform
 * @param value - String value to check
 * @returns True if value is a valid Platform
 */
export const isPlatform = createEnumTypeGuard(Platform);

/**
 * Type guard for StorageType
 * @param value - String value to check
 * @returns True if value is a valid StorageType
 */
export const isStorageType = createEnumTypeGuard(StorageType);

/**
 * Type guard for SecurityLevel
 * @param value - String value to check
 * @returns True if value is a valid SecurityLevel
 */
export const isSecurityLevel = createEnumTypeGuard(SecurityLevel);

/**
 * Type guard for DebugLogType
 * @param value - String value to check
 * @returns True if value is a valid DebugLogType
 */
export const isDebugLogType = createEnumTypeGuard(DebugLogType);

/**
 * Type guard for DataSize
 * @param value - String value to check
 * @returns True if value is a valid DataSize
 */
export const isDataSize = createEnumTypeGuard(DataSize);

/**
 * Type guard for ConfigPreset
 * @param value - String value to check
 * @returns True if value is a valid ConfigPreset
 */
export const isConfigPreset = createEnumTypeGuard(ConfigPreset);

// ============================================
// Utility Types
// ============================================

export type HttpMethodType = `${HttpMethod}`;
export type QueryStatusType = `${QueryStatus}`;
export type LogLevelType = `${LogLevel}`;
export type StorageTypeType = `${StorageType}`;
export type PlatformType = `${Platform}`;
export type SecurityLevelType = `${SecurityLevel}`;
export type DataSizeType = `${DataSize}`;
export type ConfigPresetType = `${ConfigPreset}`;
export type DebugLogTypeType = `${DebugLogType}`;

// Export all for easy access
export default {
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
  DebugLogType,
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
};
