/**
 * Centralized Enums and Constants for Minder Data Provider
 * 
 * This file contains all static values that should be type-safe and immutable.
 * Using enums provides better IDE autocomplete, prevents typos, and makes refactoring easier.
 */

// ============================================
// HTTP Methods
// ============================================
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

// ============================================
// Query/Request Status
// ============================================
export enum QueryStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
}

// ============================================
// Log Levels
// ============================================
export enum LogLevel {
  NONE = 'none',
  ERROR = 'error',
  WARN = 'warn',
  WARNING = 'warning',
  INFO = 'info',
  DEBUG = 'debug',
}

// ============================================
// Storage Types
// ============================================
export enum StorageType {
  MEMORY = 'memory',
  LOCAL_STORAGE = 'localStorage',
  SESSION_STORAGE = 'sessionStorage',
  INDEXED_DB = 'indexedDB',
  ASYNC_STORAGE = 'AsyncStorage',
  SECURE_STORE = 'SecureStore',
  ELECTRON_STORE = 'electron-store',
}

// ============================================
// Cache Types
// ============================================
export enum CacheType {
  MEMORY = 'memory',
  PERSISTENT = 'persistent',
  HYBRID = 'hybrid',
}

export enum CacheRequirements {
  BASIC = 'basic',
  ADVANCED = 'advanced',
}

// ============================================
// Security Levels
// ============================================
export enum SecurityLevel {
  NONE = 'none',
  BASIC = 'basic',
  STANDARD = 'standard',
  STRICT = 'strict',
}

// ============================================
// Platform Types
// ============================================
export enum Platform {
  WEB = 'web',
  NEXT_JS = 'nextjs',
  REACT_NATIVE = 'react-native',
  NATIVE = 'native',
  EXPO = 'expo',
  ELECTRON = 'electron',
  NODE = 'node',
}

// ============================================
// Data Size Estimates
// ============================================
export enum DataSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

// ============================================
// Prefetch Strategies
// ============================================
export enum PrefetchStrategy {
  NONE = 'none',
  ESSENTIAL = 'essential',
  AGGRESSIVE = 'aggressive',
}

// ============================================
// Config Presets
// ============================================
export enum ConfigPreset {
  MINIMAL = 'minimal',
  STANDARD = 'standard',
  ADVANCED = 'advanced',
  ENTERPRISE = 'enterprise',
  BALANCED = 'balanced',
  COMPREHENSIVE = 'comprehensive',
}

// ============================================
// Notification/Alert Types
// ============================================
export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

// ============================================
// Environment Types
// ============================================
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test',
}

// ============================================
// WebSocket States
// ============================================
export enum WebSocketState {
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

// ============================================
// Upload States
// ============================================
export enum UploadState {
  IDLE = 'idle',
  PREPARING = 'preparing',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ============================================
// Network States
// ============================================
export enum NetworkState {
  ONLINE = 'online',
  OFFLINE = 'offline',
  SLOW = 'slow',
  UNKNOWN = 'unknown',
}

// ============================================
// CRUD Operations
// ============================================
export enum CrudOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  SEARCH = 'search',
}

// ============================================
// Authentication States
// ============================================
export enum AuthState {
  UNAUTHENTICATED = 'unauthenticated',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error',
  REFRESHING = 'refreshing',
}

// ============================================
// Token Types
// ============================================
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  ID = 'id',
  CSRF = 'csrf',
}

// ============================================
// Retry Strategies
// ============================================
export enum RetryStrategy {
  NONE = 'none',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  CUSTOM = 'custom',
}

// ============================================
// Sort Orders
// ============================================
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
  ASCENDING = 'ascending',
  DESCENDING = 'descending',
}

// ============================================
// Pagination Types
// ============================================
export enum PaginationType {
  OFFSET = 'offset',
  CURSOR = 'cursor',
  PAGE = 'page',
}

// ============================================
// Error Codes
// ============================================
export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

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
 * @template T - The enum type
 * @param enumObj - The enum object
 * @returns Type guard function that checks if value is valid enum member
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
 * Type guard for HttpMethod enum
 * @param value - String value to check
 * @returns True if value is a valid HttpMethod
 */
export const isHttpMethod = createEnumTypeGuard(HttpMethod);

/**
 * Type guard for QueryStatus enum
 * @param value - String value to check
 * @returns True if value is a valid QueryStatus
 */
export const isQueryStatus = createEnumTypeGuard(QueryStatus);

/**
 * Type guard for LogLevel enum
 * @param value - String value to check
 * @returns True if value is a valid LogLevel
 */
export const isLogLevel = createEnumTypeGuard(LogLevel);

/**
 * Type guard for Platform enum
 * @param value - String value to check
 * @returns True if value is a valid Platform
 */
export const isPlatform = createEnumTypeGuard(Platform);

/**
 * Type guard for StorageType enum
 * @param value - String value to check
 * @returns True if value is a valid StorageType
 */
export const isStorageType = createEnumTypeGuard(StorageType);

/**
 * Type guard for SecurityLevel enum
 * @param value - String value to check
 * @returns True if value is a valid SecurityLevel
 */
export const isSecurityLevel = createEnumTypeGuard(SecurityLevel);

/**
 * Type guard for DataSize enum
 * @param value - String value to check
 * @returns True if value is a valid DataSize
 */
export const isDataSize = createEnumTypeGuard(DataSize);

/**
 * Type guard for ConfigPreset enum
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
export type NotificationTypeType = `${NotificationType}`;

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
