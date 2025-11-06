/**
 * Web Network Adapter
 * Uses native fetch API for browser environments
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import {
  NetworkAdapter,
  NetworkRequest,
  NetworkResponse,
  NetworkAdapterConfig,
  NetworkError,
} from './NetworkAdapter.js';

const logger = new Logger('WebNetworkAdapter', { level: LogLevel.WARN });

export class WebNetworkAdapter extends NetworkAdapter {
  constructor(config: NetworkAdapterConfig = {}) {
    super(config);
  }

  /**
   * Make HTTP request using fetch
   */
  async request<T = any>(requestConfig: NetworkRequest): Promise<NetworkResponse<T>> {
    // Apply request interceptor
    let config = requestConfig;
    if (this.config.onRequest) {
      config = await this.config.onRequest(config);
    }

    const url = this.buildURL(config.url, config.params);
    const headers = this.mergeHeaders(config.headers);
    const timeout = config.timeout || this.config.timeout || 30000;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Prepare fetch options
      const options: RequestInit = {
        method: config.method,
        headers,
        signal: config.signal || controller.signal,
        credentials: config.withCredentials !== undefined 
          ? (config.withCredentials ? 'include' : 'omit')
          : (this.config.withCredentials ? 'include' : 'same-origin'),
      };

      // Add body for non-GET requests
      if (config.body && config.method !== 'GET' && config.method !== 'HEAD') {
        if (typeof config.body === 'string') {
          options.body = config.body;
        } else if (config.body instanceof FormData) {
          options.body = config.body;
          // Remove Content-Type header for FormData (browser sets it with boundary)
          delete headers['Content-Type'];
        } else {
          options.body = JSON.stringify(config.body);
        }
      }

      // Make request
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // Parse response based on type
      let data: T;
      const contentType = response.headers.get('content-type') || '';
      
      if (config.responseType === 'blob' || contentType.includes('application/octet-stream')) {
        data = await response.blob() as any;
      } else if (config.responseType === 'arraybuffer') {
        data = await response.arrayBuffer() as any;
      } else if (config.responseType === 'text' || contentType.includes('text/')) {
        data = await response.text() as any;
      } else {
        // Default to JSON
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      }

      // Convert headers to object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Create response object
      const networkResponse: NetworkResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        config,
      };

      // Validate status
      const validateStatus = this.config.validateStatus || ((status) => status >= 200 && status < 300);
      if (!validateStatus(response.status)) {
        throw this.createError(
          `Request failed with status ${response.status}`,
          config,
          'ERR_BAD_RESPONSE',
          networkResponse
        );
      }

      // Apply response interceptor
      if (this.config.onResponse) {
        return await this.config.onResponse(networkResponse);
      }

      return networkResponse;

    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = this.createError(
          'Request timeout',
          config,
          'TIMEOUT'
        );
        
        if (this.config.onError) {
          return this.config.onError(timeoutError);
        }
        throw timeoutError;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        const networkError = this.createError(
          'Network error - please check your internet connection',
          config,
          'NETWORK_ERROR'
        );
        networkError.isNetworkError = true;
        
        if (this.config.onError) {
          return this.config.onError(networkError);
        }
        throw networkError;
      }

      // Handle other errors
      const wrappedError = error as NetworkError;
      wrappedError.config = config;
      
      if (this.config.onError) {
        return this.config.onError(wrappedError);
      }
      
      throw wrappedError;
    }
  }

  getName(): string {
    return 'WebNetworkAdapter';
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof fetch !== 'undefined';
  }

  /**
   * Cancel all pending requests (not implemented in fetch - use AbortController per request)
   */
  cancelAll(): void {
    logger.warn('WebNetworkAdapter: cancelAll() is not supported. Use AbortSignal per request.');
  }

  /**
   * Get current configuration
   */
  getConfig(): NetworkAdapterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NetworkAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Factory function
 */
export function createWebNetworkAdapter(config?: NetworkAdapterConfig): WebNetworkAdapter {
  return new WebNetworkAdapter(config);
}
