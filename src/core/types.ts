import { BaseModel } from '../models/BaseModel.js';
import {
  HttpMethod,
  StorageType,
  LogLevel,
  CacheType,
  SecurityLevel,
  NotificationType
} from '../constants/enums.js';
import type { OfflineConfig } from '../platform/offline/types.js';

// Core configuration types
export interface MinderConfig {
  apiBaseUrl: string;
  routes: Record<string, ApiRoute>;
  /**
   * Optional dynamic import function (e.g., Next.js dynamic())
   * Used for code-splitting React Query Devtools in development
   * @example
   * import dynamic from 'next/dynamic';
   * const config = { dynamic, ... };
   */
  dynamic?: (
    loader: () => Promise<any>,
    options?: { ssr?: boolean }
  ) => any;
  auth?: AuthConfig;
  cache?: CacheConfig;
  /**
   * @deprecated Use `corsHelper` instead. Will be removed in v3.0.
   * This field name was misleading - it doesn't configure server CORS.
   */
  cors?: CorsConfig;
  /** CORS helper configuration - Does NOT bypass CORS, only adds helpful client-side features */
  corsHelper?: CorsHelperConfig;
  websocket?: WebSocketConfig;
  redux?: ReduxConfig;
  performance?: PerformanceConfig;
  debug?: DebugConfig;
  security?: SecurityConfig;
  ssr?: SSRConfig;
  offline?: OfflineConfig;
  environments?: Record<string, EnvironmentOverride>;
  defaultEnvironment?: string;
  autoDetectEnvironment?: boolean;
  onError?: (error: ApiError) => void;
  /** HTTP client instance (Axios or LightHttpClient) */
  httpClient?: any;
}

export interface EnvironmentOverride {
  apiBaseUrl?: string;
  /**
   * @deprecated Use `corsHelper` instead
   */
  cors?: CorsConfig;
  corsHelper?: CorsHelperConfig;
  auth?: Partial<AuthConfig>;
  cache?: Partial<CacheConfig>;
  debug?: boolean;
}

export interface ApiRoute {
  method: HttpMethod;
  url: string;
  model?: typeof BaseModel;
  headers?: Record<string, string>;
  optimistic?: boolean;
  cache?: boolean;
  timeout?: number;
}

export interface AuthConfig {
  tokenKey: string;
  storage: StorageType;
  tokenStorage?: StorageType; // For light config
  refreshUrl?: string;
  onAuthError?: () => void;
}

export interface CacheConfig {
  type?: CacheType; // For light config
  staleTime?: number;
  gcTime?: number;
  ttl?: number; // For light config
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  maxSize?: number; // For light config
}

export interface CorsConfig {
  enabled?: boolean;
  proxy?: string;
  credentials?: boolean;
  origin?: string | string[];
  methods?: HttpMethod[];
  headers?: string[];
}

/**
 * CORS Helper Configuration
 * 
 * ⚠️ IMPORTANT: This configuration does NOT bypass CORS restrictions!
 * 
 * CORS (Cross-Origin Resource Sharing) is a browser security feature
 * that MUST be configured on your API server, not in the client.
 * 
 * What this configuration DOES:
 * - ✅ Adds helpful headers (Origin, credentials)
 * - ✅ Provides better CORS error messages
 * - ✅ Can route requests through a proxy server
 * 
 * What this configuration CANNOT do:
 * - ❌ Cannot bypass CORS policy
 * - ❌ Cannot configure server CORS headers
 * - ❌ Cannot fix CORS errors (server must fix them)
 * 
 * To fix CORS errors:
 * 1. Configure CORS on your API server
 * 2. Add Access-Control-Allow-Origin header on server
 * 3. Use a proxy server if you can't modify the API
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */
export interface CorsHelperConfig {
  /**
   * Enable CORS helper features
   * @default false
   */
  enabled?: boolean;

  /**
   * Proxy server URL to route requests through
   * Useful when you can't modify the target API's CORS headers
   * @example 'https://your-proxy.com/api'
   */
  proxy?: string;

  /**
   * Include credentials (cookies, authorization headers) in requests
   * @default false
   */
  credentials?: boolean;

  /**
   * Expected origin(s) - for validation only
   * This does NOT set server CORS headers
   */
  origin?: string | string[];

  /**
   * HTTP methods to include in preflight requests
   */
  methods?: HttpMethod[];

  /**
   * Headers to include in preflight requests
   */
  headers?: string[];
}

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  reconnect?: boolean;
  heartbeat?: number;
}

export interface ReduxConfig {
  devTools?: boolean;
  middleware?: any[];
  preloadedState?: any;
}

export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * HTTP status codes that should trigger a retry
   * @default [408, 429, 500, 502, 503, 504]
   */
  retryableStatusCodes?: number[];

  /**
   * Backoff strategy for retry delays
   * - 'exponential': delay increases exponentially (1s, 2s, 4s, 8s...)
   * - 'linear': delay increases linearly (1s, 2s, 3s, 4s...)
   * - Function: custom delay calculation based on attempt number
   * @default 'exponential'
   */
  backoff?: 'exponential' | 'linear' | ((attempt: number) => number);

  /**
   * Base delay in milliseconds for retry backoff
   * @default 1000
   */
  baseDelay?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Custom function to determine if a request should be retried
   * @param error - The error that occurred
   * @param attempt - The current attempt number (0-indexed)
   * @returns true to retry, false to stop
   */
  shouldRetry?: (error: any, attempt: number) => boolean;
}

export interface PerformanceConfig {
  deduplication?: boolean;
  batching?: boolean;
  batchDelay?: number;
  monitoring?: boolean;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  compression?: boolean;
  bundleAnalysis?: boolean;
  lazyLoading?: boolean;
  /**
   * Enhanced retry configuration with custom strategies
   */
  retryConfig?: RetryConfig;
}

export interface DebugConfig {
  enabled?: boolean;
  logLevel?: LogLevel;
  performance?: boolean;
  devTools?: boolean;
  networkLogs?: boolean;
  cacheLogs?: boolean;
  authLogs?: boolean;
  websocketLogs?: boolean;
}

export interface SecurityConfig {
  encryption?: boolean;
  sanitization?: boolean | {
    enabled: boolean;
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
  };
  csrfProtection?: boolean | {
    enabled: boolean;
    tokenLength?: number;
    headerName?: string;
    cookieName?: string;
  };
  rateLimiting?: {
    requests: number;
    window: number; // in milliseconds
    storage?: StorageType;
  };
  headers?: {
    contentSecurityPolicy?: string;
    xFrameOptions?: string;
    xContentTypeOptions?: boolean;
    strictTransportSecurity?: string;
  };
  inputValidation?: boolean;
  httpsOnly?: boolean; // Enforce HTTPS in production
  developmentWarnings?: boolean; // Show security warnings in dev mode
}

export interface SSRConfig {
  enabled?: boolean;
  prefetch?: string[];
  hydrate?: boolean;
  fallback?: any;
}

// State management types
export interface UIState {
  loading: Record<string, boolean>;
  errors: Record<string, ApiError | null>;
  modals: Record<string, boolean>;
  notifications: Notification[];
}

export interface ServerState {
  data: Record<string, unknown>;
  cache: Record<string, CacheEntry>;
  queries: Record<string, QueryState>;
}

export interface UserState {
  profile: any;
  preferences: Record<string, unknown>;
  permissions: string[];
  session: SessionData;
}

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export interface QueryState {
  data: any;
  isLoading: boolean;
  error: ApiError | null;
  lastFetched: number;
}

export interface SessionData {
  token: string | null;
  refreshToken: string | null;
  expiresAt: number;
  user: any;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}

// Hook return types
export interface CrudOperations<T = any> {
  data: T[];  // ✅ Changed from T to T[] - always returns array of items
  loading: {
    fetch: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  errors: {
    current: ApiError | null;
    hasError: boolean;
    message: string;
  };
  operations: {
    fetch: () => Promise<T[]>;  // ✅ Changed from Promise<T> to Promise<T[]>
    create: (item: Partial<T>) => Promise<T>;
    update: (id: string | number, item: Partial<T>) => Promise<T>;
    delete: (id: string | number) => Promise<void>;
    refresh: () => void;
    clear: () => void;
  };
}

export interface MediaUploadResult {
  url: string;
  filename: string;
  size: number;
  type: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}