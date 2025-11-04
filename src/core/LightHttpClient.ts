/**
 * Lightweight HTTP client implementation
 * This replaces Axios for basic HTTP operations
 */

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestConfig {
  method?: RequestMethod;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
}

interface RequestOptions {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

export class LightHttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private defaultOptions: RequestOptions;

  constructor(options: RequestOptions = {}) {
    this.baseURL = options.baseURL || '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.defaultOptions = options;
  }

  private async request<T>(url: string, config: RequestConfig = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutId = this.defaultOptions.timeout
      ? setTimeout(() => controller.abort(), this.defaultOptions.timeout)
      : null;

    try {
      const fullUrl = this.baseURL + url;
      const response = await fetch(fullUrl, {
        method: config.method || 'GET',
        headers: {
          ...this.defaultHeaders,
          ...config.headers,
        },
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: config.signal || controller.signal,
        credentials: config.credentials || this.defaultOptions.credentials,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }
      
      return response.text() as unknown as T;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }

  async get<T>(url: string, config: Omit<RequestConfig, 'method' | 'body'> = {}) {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  async post<T>(url: string, data?: any, config: Omit<RequestConfig, 'method'> = {}) {
    return this.request<T>(url, { ...config, method: 'POST', body: data });
  }

  async put<T>(url: string, data?: any, config: Omit<RequestConfig, 'method'> = {}) {
    return this.request<T>(url, { ...config, method: 'PUT', body: data });
  }

  async delete<T>(url: string, config: Omit<RequestConfig, 'method' | 'body'> = {}) {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }

  async patch<T>(url: string, data?: any, config: Omit<RequestConfig, 'method'> = {}) {
    return this.request<T>(url, { ...config, method: 'PATCH', body: data });
  }

  setBaseURL(url: string) {
    this.baseURL = url;
  }

  setDefaultHeader(name: string, value: string) {
    this.defaultHeaders[name] = value;
  }
}