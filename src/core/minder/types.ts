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
   * Query parameters
   */
  params?: Record<string, unknown>;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
  
  /**
   * Enable caching
   * @default true
   */
  cache?: boolean;
  
  /**
   * Cache time to live in milliseconds
   * @default 300000 (5 minutes)
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
   * Retry failed requests
   * @default 3
   */
  retries?: number;
  
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
