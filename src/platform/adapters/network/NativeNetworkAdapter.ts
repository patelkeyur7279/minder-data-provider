/**
 * React Native Network Adapter
 * Enhanced fetch with better timeout handling for mobile
 */

import {
  NetworkAdapter,
  NetworkRequest,
  NetworkResponse,
  NetworkAdapterConfig,
} from './NetworkAdapter.js';

export class NativeNetworkAdapter extends NetworkAdapter {
  constructor(config: NetworkAdapterConfig = {}) {
    super({
      timeout: 60000, // Longer timeout for mobile networks
      ...config,
    });
  }

  /**
   * Make HTTP request with enhanced timeout handling
   */
  async request<T = any>(requestConfig: NetworkRequest): Promise<NetworkResponse<T>> {
    // Apply request interceptor
    let config = requestConfig;
    if (this.config.onRequest) {
      config = await this.config.onRequest(config);
    }

    const url = this.buildURL(config.url, config.params);
    const headers = this.mergeHeaders(config.headers);
    const timeout = config.timeout || this.config.timeout || 60000;

    // Create promise that rejects on timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(this.createError(
          'Request timeout',
          config,
          'TIMEOUT'
        ));
      }, timeout);
    });

    try {
      // Prepare fetch options
      const options: RequestInit = {
        method: config.method,
        headers,
      };

      // Add body for non-GET requests
      if (config.body && config.method !== 'GET' && config.method !== 'HEAD') {
        if (typeof config.body === 'string') {
          options.body = config.body;
        } else if (config.body instanceof FormData) {
          options.body = config.body;
          delete (headers as any)['Content-Type'];
        } else {
          options.body = JSON.stringify(config.body);
        }
      }

      // Race between fetch and timeout
      const response = await Promise.race([
        fetch(url, options),
        timeoutPromise,
      ]) as Response;

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type') || '';
      
      if (config.responseType === 'blob' || contentType.includes('application/octet-stream')) {
        data = await response.blob() as any;
      } else if (config.responseType === 'text' || contentType.includes('text/')) {
        data = await response.text() as any;
      } else {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      }

      // Convert headers to object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

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

    } catch (error: any) {
      // Handle network errors
      if (error.message?.includes('Network request failed')) {
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

      // Re-throw other errors
      const wrappedError = error;
      wrappedError.config = config;
      
      if (this.config.onError) {
        return this.config.onError(wrappedError);
      }
      
      throw wrappedError;
    }
  }

  getName(): string {
    return 'NativeNetworkAdapter';
  }

  isAvailable(): boolean {
    // Check for React Native environment
    return typeof navigator !== 'undefined' && 
           navigator.product === 'ReactNative';
  }

  /**
   * Get network state (requires @react-native-community/netinfo)
   */
  async getNetworkState(): Promise<{ isConnected: boolean; type: string } | null> {
    try {
      // Try to import NetInfo dynamically (optional peer dependency)
      const NetInfo = await import('@react-native-community/netinfo' as any);
      const state = await NetInfo.default.fetch();
      
      return {
        isConnected: state.isConnected ?? false,
        type: state.type,
      };
    } catch (error) {
      // NetInfo not installed - this is optional
      return null;
    }
  }
}

/**
 * Factory function
 */
export function createNativeNetworkAdapter(config?: NetworkAdapterConfig): NativeNetworkAdapter {
  return new NativeNetworkAdapter(config);
}
