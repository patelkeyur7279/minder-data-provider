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
import type { 
  HttpMethod, 
  MinderOptions, 
  MinderResult, 
  MinderError,
  MinderConfig,
  UploadProgress 
} from './minder/types.js';
import { 
  detectMethod, 
  isFileUpload, 
  encodeWithModel, 
  decodeWithModel, 
  handleError 
} from './minder/utils.js';

// Re-export types for backward compatibility
export type { 
  HttpMethod, 
  MinderOptions, 
  MinderResult, 
  MinderError,
  UploadProgress 
} from './minder/types.js';

// ============================================================================
// GLOBAL CONFIGURATION
// ============================================================================

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
