/**
 * Network Adapter Interface
 * Platform-agnostic HTTP client abstraction
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface NetworkRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, unknown>;
  timeout?: number;
  signal?: AbortSignal;
  withCredentials?: boolean;
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
}

export interface NetworkResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: NetworkRequest;
}

export interface NetworkError extends Error {
  config?: NetworkRequest;
  code?: string;
  request?: unknown;
  response?: NetworkResponse;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isCancelled?: boolean;
}

export interface NetworkAdapterConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  validateStatus?: (status: number) => boolean;
  onRequest?: (config: NetworkRequest) => NetworkRequest | Promise<NetworkRequest>;
  onResponse?: (response: NetworkResponse) => NetworkResponse | Promise<NetworkResponse>;
  onError?: (error: NetworkError) => any;
}

/**
 * Base Network Adapter
 * All platform-specific adapters must implement this interface
 */
export abstract class NetworkAdapter {
  protected config: NetworkAdapterConfig;

  constructor(config: NetworkAdapterConfig = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      validateStatus: (status) => status >= 200 && status < 300,
      ...config,
    };
  }

  /**
   * Make HTTP request
   */
  abstract request<T = any>(config: NetworkRequest): Promise<NetworkResponse<T>>;

  /**
   * GET request
   */
  async get<T = any>(url: string, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: unknown, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body: data });
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: unknown, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', body: data });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(url: string, data?: unknown, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', body: data });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  /**
   * Build full URL with base URL and params
   */
  protected buildURL(url: string, params?: Record<string, unknown>): string {
    let fullURL = this.config.baseURL ? `${this.config.baseURL}${url}` : url;

    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      fullURL += (fullURL.includes('?') ? '&' : '?') + queryString;
    }

    return fullURL;
  }

  /**
   * Merge headers with defaults
   */
  protected mergeHeaders(headers?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...headers,
    };
  }

  /**
   * Create network error
   */
  protected createError(
    message: string,
    config?: NetworkRequest,
    code?: string,
    response?: NetworkResponse
  ): NetworkError {
    const error = new Error(message) as NetworkError;
    error.config = config;
    error.code = code;
    error.response = response;
    error.isNetworkError = true;
    error.isTimeout = code === 'ETIMEDOUT' || code === 'TIMEOUT';
    error.isCancelled = code === 'ECONNABORTED' || code === 'CANCELLED';
    return error;
  }

  /**
   * Retry logic with exponential backoff
   */
  protected async retryRequest<T>(
    config: NetworkRequest,
    attempt: number = 0
  ): Promise<NetworkResponse<T>> {
    try {
      return await this.request<T>(config);
    } catch (error: unknown) {
      const maxRetries = this.config.maxRetries || 3;
      
      // Type narrowing: error must be NetworkError for shouldRetry
      const networkError = error as NetworkError;
      if (attempt < maxRetries && this.shouldRetry(networkError)) {
        const delay = this.config.retryDelay! * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryRequest<T>(config, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Determine if request should be retried
   */
  protected shouldRetry(error: NetworkError): boolean {
    // Retry on network errors and 5xx server errors
    if (error.isNetworkError && !error.isCancelled) {
      return true;
    }
    
    if (error.response) {
      const status = error.response.status;
      return status >= 500 && status < 600;
    }
    
    return false;
  }

  /**
   * Get adapter name for debugging
   */
  abstract getName(): string;

  /**
   * Check if adapter is available on current platform
   */
  abstract isAvailable(): boolean;
}

/**
 * Helper to create network error
 */
export function createNetworkError(
  message: string,
  config?: NetworkRequest,
  code?: string,
  response?: NetworkResponse
): NetworkError {
  const error = new Error(message) as NetworkError;
  error.config = config;
  error.code = code;
  error.response = response;
  error.isNetworkError = true;
  return error;
}
