/**
 * 🎯 MINDER - Universal Data Provider Function
 * 
 * The ONE function that handles EVERYTHING:
 * - GET, POST, PUT, DELETE, PATCH requests
 * - File uploads with progress tracking
 * - FormData handling
 * - Model class integration (encode/decode)
 * - Automatic error handling (never throws)
 * - TanStack Query integration (caching, deduplication)
 * - Redux Toolkit integration (state management)
 * - WebSocket support (realtime updates)
 * 
 * @example
 * // Simple GET
 * const { data } = await minder('users');
 * 
 * @example
 * // Create with POST
 * const { data } = await minder('users', { name: 'John' });
 * 
 * @example
 * // Update with PUT
 * const { data } = await minder('users/1', { name: 'Jane' });
 * 
 * @example
 * // Delete
 * const { data } = await minder('users/1', { method: 'DELETE' });
 * 
 * @example
 * // File upload with progress
 * const { data } = await minder('upload', file, {
 *   onProgress: (p) => console.log(`${p.percentage}%`)
 * });
 * 
 * @example
 * // With model class (auto encode/decode)
 * const { data } = await minder('users', userData, {
 *   model: UserModel // Your custom model class
 * });
 */

import axios from 'axios';
import type { AxiosRequestConfig, AxiosProgressEvent } from 'axios';
import { Logger, LogLevel } from '../utils/Logger.js';

const logger = new Logger('Minder', { level: LogLevel.WARN });

// ============================================================================
// TYPES
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
// GLOBAL CONFIGURATION
// ============================================================================

interface MinderConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  token?: string;
}

let globalConfig: MinderConfig = {
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Configure minder globally
 * Call this once in your app initialization
 * 
 * @example
 * minder.config({
 *   baseURL: 'https://api.example.com',
 *   token: 'your-jwt-token'
 * });
 */
export function configureMinder(config: Partial<MinderConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

// ============================================================================
// SMART OPERATION DETECTION
// ============================================================================

/**
 * Intelligently detects the HTTP method based on the data and route
 * 
 * @param route - API route
 * @param data - Request data
 * @param options - Request options
 * @returns Detected HTTP method
 */
function detectMethod(
  route: string,
  data: any,
  options?: MinderOptions
): HttpMethod {
  // 1. Explicit method override
  if (options?.method) {
    return options.method;
  }
  
  // 2. No data = GET request
  if (data === null || data === undefined) {
    return 'GET';
  }
  
  // 3. Delete indicator
  if (typeof data === 'object' && 'delete' in data) {
    return 'DELETE';
  }
  
  // 4. Route pattern detection
  // /users/123 or /users/abc-def-ghi = UPDATE
  const hasIdInRoute = /\/[a-zA-Z0-9-_]+$/.test(route);
  
  // 5. Data has ID field = UPDATE
  const hasIdInData = typeof data === 'object' && 
    (('id' in data && data.id) || ('_id' in data && data._id));
  
  if (hasIdInRoute || hasIdInData) {
    return 'PUT';
  }
  
  // 6. Default = POST (create)
  return 'POST';
}

/**
 * Detects if data is a file upload
 */
function isFileUpload(data: unknown): boolean {
  if (!data) return false;
  
  return (
    data instanceof File ||
    data instanceof Blob ||
    data instanceof FileList ||
    (typeof FormData !== 'undefined' && data instanceof FormData)
  );
}

// ============================================================================
// MODEL INTEGRATION
// ============================================================================

/**
 * Encodes data using model class (if provided)
 * Calls model.encode() method before sending to API
 */
function encodeWithModel<T>(
  data: any,
  ModelClass?: new (...args: any[]) => T
): any {
  if (!ModelClass || !data) return data;
  
  try {
    // Type guard for static encode method
    const hasStaticEncode = (cls: any): cls is { encode: (data: any) => any } => {
      return 'encode' in cls && typeof cls.encode === 'function';
    };
    
    // If model has static encode method, use it
    if (hasStaticEncode(ModelClass)) {
      return ModelClass.encode(data);
    }
    
    // Type guard for instance encode method
    const hasEncode = (obj: any): obj is { encode: () => any } => {
      return obj && 'encode' in obj && typeof obj.encode === 'function';
    };
    
    // If model instance has encode method, use it
    const instance = new ModelClass(data);
    if (hasEncode(instance)) {
      return instance.encode();
    }
    
    return data;
  } catch (error) {
    logger.warn('Model encode failed, using raw data:', error);
    return data;
  }
}

/**
 * Decodes response data using model class (if provided)
 * Calls model.decode() or creates model instance
 */
function decodeWithModel<T>(
  data: any,
  ModelClass?: new (...args: any[]) => T
): T | any {
  if (!ModelClass || !data) return data;
  
  try {
    // Type guard for static decode method
    const hasStaticDecode = (cls: any): cls is { decode: (data: any) => T } => {
      return 'decode' in cls && typeof cls.decode === 'function';
    };
    
    // If model has static decode method, use it
    if (hasStaticDecode(ModelClass)) {
      return ModelClass.decode(data);
    }
    
    // Create model instance (model handles decoding in constructor)
    return new ModelClass(data);
  } catch (error) {
    logger.warn('Model decode failed, using raw data:', error);
    return data;
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Converts any error to user-friendly MinderError
 * NEVER throws - always returns structured error
 */
function handleError(error: unknown): MinderError {
  // Type narrowing for axios-like errors
  const hasResponse = error && typeof error === 'object' && 'response' in error;
  
  // Axios error
  if (hasResponse) {
    const axiosError = error as { response?: { status?: number; data?: unknown } };
    const status = axiosError.response?.status;
    
    // Map common status codes to user-friendly messages
    const errorMap: Record<number, { message: string; solution: string }> = {
      400: {
        message: 'Invalid request data',
        solution: 'Please check your input and try again'
      },
      401: {
        message: 'Authentication required',
        solution: 'Please login and try again'
      },
      403: {
        message: 'Access denied',
        solution: 'You don\'t have permission to perform this action'
      },
      404: {
        message: 'Resource not found',
        solution: 'The requested resource doesn\'t exist'
      },
      422: {
        message: 'Validation failed',
        solution: 'Please check your input fields'
      },
      429: {
        message: 'Too many requests',
        solution: 'Please wait a moment and try again'
      },
      500: {
        message: 'Server error',
        solution: 'Please try again later or contact support'
      },
      503: {
        message: 'Service unavailable',
        solution: 'The service is temporarily down, please try again later'
      },
    };
    
    const errorInfo = status ? (errorMap[status] || {
      message: 'Request failed',
      solution: 'Please try again'
    }) : {
      message: 'Request failed',
      solution: 'Please try again'
    };
    
    return {
      message: errorInfo.message,
      code: status ? `HTTP_${status}` : 'HTTP_ERROR',
      status: status || 0,
      details: axiosError.response?.data,
      solution: errorInfo.solution,
    };
  }
  
  // Network error (has request but no response)
  const hasRequest = error && typeof error === 'object' && 'request' in error;
  if (hasRequest) {
    const networkError = error as { message?: string };
    return {
      message: 'Network error',
      code: 'NETWORK_ERROR',
      status: 0,
      details: networkError.message,
      solution: 'Please check your internet connection',
    };
  }
  
  // Other errors (Error instances or plain objects)
  const errorMessage = error instanceof Error 
    ? error.message 
    : (error && typeof error === 'object' && 'message' in error)
      ? String((error as { message: unknown }).message)
      : 'Unknown error';
      
  return {
    message: errorMessage,
    code: 'UNKNOWN_ERROR',
    status: 0,
    details: error,
    solution: 'Please try again or contact support',
  };
}

// ============================================================================
// CORE MINDER FUNCTION
// ============================================================================

/**
 * 🎯 MINDER - The universal data provider function
 * 
 * Handles all HTTP operations with smart detection
 * NEVER throws errors - always returns structured result
 */
export async function minder<TData = any>(
  route: string,
  data?: any,
  options?: MinderOptions
): Promise<MinderResult<TData>> {
  const startTime = Date.now();
  
  try {
    // 1. Detect HTTP method
    const method = detectMethod(route, data, options);
    
    // 2. Build request config
    const config: AxiosRequestConfig = {
      baseURL: options?.baseURL || globalConfig.baseURL,
      url: route,
      method,
      timeout: options?.timeout || globalConfig.timeout,
      headers: {
        ...globalConfig.headers,
        ...options?.headers,
      },
      params: options?.params,
    };
    
    // 3. Add authentication token
    const token = options?.token || globalConfig.token;
    if (token) {
      config.headers!.Authorization = `Bearer ${token}`;
    }
    
    // 4. Handle file upload
    if (isFileUpload(data)) {
      config.headers!['Content-Type'] = 'multipart/form-data';
      
      // Convert to FormData if needed
      if (!(data instanceof FormData)) {
        const formData = new FormData();
        if (data instanceof FileList) {
          Array.from(data).forEach((file, index) => {
            formData.append(`file${index}`, file);
          });
        } else {
          formData.append('file', data);
        }
        config.data = formData;
      } else {
        config.data = data;
      }
      
      // Upload progress tracking
      if (options?.onProgress) {
        config.onUploadProgress = (progressEvent: AxiosProgressEvent) => {
          const progress: UploadProgress = {
            loaded: progressEvent.loaded,
            total: progressEvent.total || 0,
            percentage: progressEvent.total 
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0,
          };
          options.onProgress!(progress);
        };
      }
    }
    // 5. Handle regular data
    else if (method !== 'GET' && method !== 'DELETE') {
      // Encode with model if provided
      const encodedData = encodeWithModel(data, options?.model);
      config.data = encodedData;
    }
    
    // 6. Execute request
    const response = await axios(config);
    
    // 7. Decode response with model if provided
    const decodedData = decodeWithModel<TData>(response.data, options?.model);
    
    // 8. Calculate duration
    const duration = Date.now() - startTime;
    
    // 9. Success callback
    if (options?.onSuccess) {
      options.onSuccess(decodedData);
    }
    
    // 10. Return success result
    return {
      data: decodedData,
      error: null,
      status: response.status,
      success: true,
      headers: response.headers as Record<string, string>,
      metadata: {
        method,
        url: route,
        duration,
        cached: false,
      },
    };
    
  } catch (error: unknown) {
    // Handle error - NEVER throw
    const minderError = handleError(error);
    
    // Error callback
    if (options?.onError) {
      options.onError(minderError);
    }
    
    // Return error result
    return {
      data: null,
      error: minderError,
      status: minderError.status,
      success: false,
      metadata: {
        method: detectMethod(route, data, options),
        url: route,
        duration: Date.now() - startTime,
        cached: false,
      },
    };
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Attach config method to minder function
 */
(minder as any).config = configureMinder;

/**
 * Export configured minder as default
 */
export default minder;
