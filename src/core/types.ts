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
import type { MinderPlugin } from '../plugins/PluginSystem.js';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { RealtimeConfig } from './realtime/types.js';

// Re-export so `RealtimeConfig` is reachable wherever `MinderConfig` is (main
// entry, `./core`, `./realtime`) without a second import (Spec 5.2 §3.1).
export type { RealtimeConfig, RealtimeReconnectConfig } from './realtime/types.js';

// Re-export the vendored Standard Schema interface so route-def / per-call
// response validation (`ApiRoute.schema`, `MinderOptions.schema` — Task 3.1)
// is reachable from the `core` type surface without a second import.
export type { StandardSchemaV1, InferOutput, InferInput } from '../types/standard-schema.js';

// Core configuration types
export interface MinderConfig {
  apiBaseUrl: string;
  routes: Record<string, ApiRoute>;
  /** Provider platform config sections (see contracts/mockRegistry getProviderConfig). */
  providers?: Record<string, unknown>;
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
  /**
   * Enable realtime updates. The legacy boolean form (`true`) is preserved
   * verbatim — it keeps meaning "enable realtime via WebSocket" exactly as
   * before (`FeatureLoader`'s `!!config.realtime` legacy read is unaffected).
   * The object form additionally selects the transport (`'ws' | 'sse'`) — see
   * `RealtimeConfig` (Spec 5.2). WS remains the default; SSE is opt-in.
   */
  realtime?: boolean | RealtimeConfig;
  performance?: PerformanceConfig;
  debug?: DebugConfig;
  security?: SecurityConfig;
  analytics?: AnalyticsConfig;
  telemetry?: TelemetryConfig;
  ssr?: SSRConfig;
  offline?: OfflineConfig;
  /**
   * Plugins to register on this client. Each plugin can observe the request
   * lifecycle (onRequest/onResponse/onError) — the basis for drop-in
   * integrations (crash reporting, analytics, payments, etc.).
   */
  plugins?: MinderPlugin[];
  environments?: Record<string, EnvironmentOverride>;
  defaultEnvironment?: string;
  autoDetectEnvironment?: boolean;
  onError?: (error: ApiError) => void;
  /** HTTP client instance (Axios or LightHttpClient) */
  httpClient?: any;
  /**
   * P2 (fix-2.2.0-blockers): request transport for the PROVIDER's `ApiClient`.
   * Mirrors `minder()`'s own `MinderOptions.transport` (core/minder/types.ts) —
   * see `ApiClient`'s constructor for the full rationale. `'axios'` (default
   * behavior, same as leaving this unset outside an edge runtime) always uses
   * axios. `'fetch'` forces the native `fetch()` transport, which never
   * constructs or dispatches through axios — the documented escape hatch for
   * runtimes where axios's Node-oriented HTTP adapter can't run (bare
   * Cloudflare Workerd and similar). `'auto'` (and unset) pick native fetch
   * ONLY when an edge runtime is detected (global `fetch`, no Node
   * `process`, no `XMLHttpRequest`); Node and browser keep the axios default
   * unchanged.
   */
  transport?: 'auto' | 'axios' | 'fetch';
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
  /**
   * Opt-in runtime validation of the response body against any Standard
   * Schema validator (Zod >=3.24, Valibot, ArkType, Effect Schema, or any
   * object implementing the `~standard` interface). Fail-closed: a mismatch
   * (or a validator that itself throws) never passes as a valid response — it
   * surfaces as a `RESPONSE_VALIDATION_FAILED` error instead. A per-call
   * `MinderOptions.schema` overrides this when both are set.
   */
  schema?: StandardSchemaV1;
}

export interface AuthConfig {
  tokenKey: string;
  storage: StorageType;
  tokenStorage?: StorageType; // For light config
  refreshUrl?: string;
  refreshModel?: typeof BaseModel; // Optional custom model for refresh response
  onAuthError?: () => void;
  secureCookie?: boolean; // If true, forces Secure flag. If false, forces no Secure. If undefined, auto-detects based on protocol.
  sendTokenOnRefresh?: boolean; // If true, sends the expired access token in the Authorization header during refresh. Defaults to true.
  authHeader?: string; // Custom header name (default: 'Authorization')
  authTokenPrefix?: string; // Custom token prefix (default: 'Bearer')
  getRefreshRequestBody?: (refreshToken: string | null) => any; // Custom body generator for refresh request
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
  maxAge?: number;
}

export interface AnalyticsConfig {
  enabled?: boolean;
  googleAnalyticsId?: string; // GA Measurement ID (G-XXXXXXXXXX)
  debug?: boolean; // Log events to console
  autoTrackPageView?: boolean; // Automatically track page views (if using router integration)
  autoTrackErrors?: boolean; // Automatically track API errors
  autoTrackPerformance?: boolean; // Automatically track performance metrics
  customDimensions?: Record<string, string>; // Custom dimensions to send with every event
  /**
   * Security Hook: Sanitize data before sending to GA
   * Return null to drop the event, or return modified params
   * @example
   * beforeSend: (event, params) => {
   *   // Remove email from error messages
   *   if (params.message) params.message = params.message.replace(/email/g, '[REDACTED]');
   *   return params;
   * }
   */
  beforeSend?: (eventName: string, params: Record<string, any>) => Record<string, any> | null;
}

export interface TelemetryConfig {
  enabled?: boolean;
  mode?: 'custom' | 'ga4'; // 'custom' sends to endpoint, 'ga4' sends to Google Analytics
  endpoint?: string; // URL for custom collector
  measurementId?: string; // GA4 Measurement ID (required for 'ga4' mode)
  apiSecret?: string; // GA4 API Secret (optional, for server-side events)
  debug?: boolean;
  sampleRate?: number; // 0.0 to 1.0
}

export interface WebSocketConfig {
  url?: string;
  protocols?: string[];
  reconnect?: boolean;
  heartbeat?: number;
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
   * Exponential backoff factor
   * @default 2
   */
  factor?: number;

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
    secureCookie?: boolean;
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
  strictCSP?: boolean; // If true, removes 'unsafe-inline' from default CSP
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