/**
 * Type definitions for Minder data provider
 */

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * HTTP methods supported by minder
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Upload progress information
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Minder operation options
 */
export interface MinderOptions<TModel = any> {
  /**
   * HTTP method override
   * If not specified, auto-detected based on data
   */
  method?: HttpMethod;

  /**
   * Model class for encode/decode
   * Your custom model class extending BaseModel
   * @example
   * model: UserModel
   */
  model?: new (...args: any[]) => TModel;

  /**
   * Upload progress callback
   * Called during file uploads
   */
  onProgress?: (progress: UploadProgress) => void;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Custom Axios configuration
   * Allows passing any axios config options (e.g. responseType, transformRequest)
   */
  axiosConfig?: Record<string, any>;

  /**
   * Transport to use for the request.
   * - `'axios'` (default): full-featured and predictable — honors withCredentials,
   *   axiosConfig, and produces consistent error shapes.
   * - `'fetch'`: faster native-fetch fast-path for simple GET/POST requests. Does
   *   not apply axiosConfig or credentials handling — opt in only when you want
   *   the minimal-overhead path.
   * @default 'axios'
   */
  transport?: 'auto' | 'axios' | 'fetch';

  /**
   * Throw on error instead of returning a structured error result. By default
   * `minder()` never throws; set this to opt into try/catch-style error handling.
   * @default false
   */
  throwOnError?: boolean;

  /**
   * Query parameters
   */
  params?: Record<string, unknown>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Opt-in response cache for standalone minder() GET requests. Entries are
   * keyed by method+URL+params+auth-identity (a hash of token/Authorization —
   * never shared across different credentials) and capped at 200 entries.
   * @default false (no caching unless explicitly enabled)
   */
  cache?: boolean;

  /**
   * Cache time to live in milliseconds. Falls back to the global config's
   * cache.staleTime/ttl when unset.
   * @default 60000 (60 seconds)
   */
  cacheTTL?: number;

  /**
   * Enable realtime updates via WebSocket
   * @default false
   */
  realtime?: boolean;

  /**
   * Enable optimistic updates
   * @default false
   */
  optimistic?: boolean;

  /**
   * Retry transiently-failed requests (network error / 5xx / 429; never 4xx)
   * up to this many times with a small backoff. Retries apply only to
   * idempotent methods (GET/HEAD/OPTIONS/PUT/DELETE) unless
   * `retryNonIdempotent` is also set.
   * @default 0 (no retries unless explicitly enabled)
   */
  retries?: number;

  /**
   * DANGER: also retry non-idempotent methods (POST/PATCH) when `retries` is
   * set. A retried POST can duplicate a side-effectful write (double order /
   * double charge) if the server processed the original request but the
   * response was lost. Enable only when the endpoint is idempotent by design
   * (e.g. guarded by an idempotency key).
   * @default false
   */
  retryNonIdempotent?: boolean;

  /**
   * Base URL override
   * If not provided, uses global config
   */
  baseURL?: string;

  /**
   * Authentication token
   * If not provided, uses stored token
   */
  token?: string;

  /**
   * Success callback
   */
  onSuccess?: (data: any) => void;

  /**
   * Error callback
   */
  onError?: (error: MinderError) => void;
}

/**
 * Minder result - NEVER throws errors
 * Always returns success or error in structured format
 */
export interface MinderResult<TData = any> {
  /**
   * Response data (null if error occurred)
   */
  data: TData | null;

  /**
   * Error information (null if successful)
   */
  error: MinderError | null;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Success flag
   */
  success: boolean;

  /**
   * Response headers
   */
  headers?: Record<string, string>;

  /**
   * Request metadata
   */
  metadata?: {
    method: HttpMethod;
    url: string;
    duration: number;
    cached: boolean;
  };
}

/**
 * Structured error - user-friendly error information
 */
export interface MinderError {
  /**
   * Error message (user-friendly)
   */
  message: string;

  /**
   * Error code
   */
  code: string;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Original error details
   */
  details?: any;

  /**
   * Suggested solution
   */
  solution?: string;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * Global minder configuration
 * @internal
 */
export interface MinderConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  token?: string;
}
