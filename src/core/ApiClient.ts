import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { MinderConfig, ApiRoute, ApiError } from './types.js';
import { AuthManager } from './AuthManager.js';
import { ProxyManager } from './ProxyManager.js';

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private config: MinderConfig;
  private authManager: AuthManager;
  private proxyManager?: ProxyManager;

  constructor(config: MinderConfig, authManager: AuthManager, proxyManager?: ProxyManager) {
    this.config = config;
    this.authManager = authManager;
    this.proxyManager = proxyManager;

    // Use proxy baseURL if enabled, otherwise use original
    const baseURL = proxyManager?.isEnabled() ? proxyManager.config.baseUrl : config.apiBaseUrl;

    // Create axios instance with CORS support
    this.axiosInstance = axios.create({
      baseURL,
      timeout: config.performance?.timeout || 30000,
      withCredentials: config.cors?.credentials ?? true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth and CORS
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.authManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add CORS preflight handling
        if (this.config.cors) {
          config.headers['Access-Control-Request-Method'] = config.method?.toUpperCase();
          config.headers['Access-Control-Request-Headers'] = 'Content-Type, Authorization';
        }

        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          this.authManager.clearAuth();
          if (this.config.auth?.onAuthError) {
            this.config.auth.onAuthError();
          }
        }

        const apiError = this.handleError(error);
        if (this.config.onError) {
          this.config.onError(apiError);
        }

        return Promise.reject(apiError);
      }
    );
  }

  private handleError(error: any): ApiError {
    if (error.response) {
      return {
        message: error.response.data?.message || error.message,
        status: error.response.status,
        code: error.response.data?.code || 'API_ERROR',
        details: error.response.data,
      };
    } else if (error.request) {
      return {
        message: 'Network error - please check your connection',
        code: 'NETWORK_ERROR',
        details: error.request,
      };
    } else {
      return {
        message: error.message || 'Unknown error occurred',
        code: 'UNKNOWN_ERROR',
        details: error,
      };
    }
  }

  async request<T = any>(
    routeName: string,
    data?: any,
    params?: Record<string, any>,
    options?: AxiosRequestConfig
  ): Promise<T> {
    const route = this.config.routes[routeName];
    if (!route) {
      throw new Error(`Route '${routeName}' not found in configuration`);
    }

    let url = route.url;
    
    // Replace URL parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, String(value));
      });
    }
    
    const requestConfig: AxiosRequestConfig = {
      method: route.method,
      url,
      headers: { 
        ...route.headers,
        ...(this.proxyManager?.getProxyHeaders() || {})
      },
      timeout: route.timeout || this.proxyManager?.getTimeout() || this.config.performance?.timeout,
      ...options,
    };

    // Apply proxy rewriting if enabled
    if (this.proxyManager?.isEnabled()) {
      requestConfig.url = this.proxyManager.rewriteUrl(url, route);
      requestConfig.baseURL = '';
    }

    // Handle different content types
    if (data) {
      if (data instanceof FormData) {
        requestConfig.data = data;
        requestConfig.headers!['Content-Type'] = 'multipart/form-data';
      } else if (typeof data === 'string' && data.startsWith('<?xml')) {
        requestConfig.data = data;
        requestConfig.headers!['Content-Type'] = 'application/xml';
      } else {
        requestConfig.data = data;
      }
    }

    const response: AxiosResponse<T> = await this.axiosInstance.request(requestConfig);
    
    // Transform response using model if specified
    if (route.model && response.data) {
      if (Array.isArray(response.data)) {
        return response.data.map((item: any) => new (route.model as any)().fromJSON(item)) as T;
      } else {
        return new (route.model as any)().fromJSON(response.data) as T;
      }
    }

    return response.data;
  }

  // File upload with progress
  async uploadFile(
    routeName: string,
    file: File,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request(routeName, formData, undefined, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage,
          });
        }
      },
    });
  }

  // WebSocket connection
  createWebSocket(url: string, protocols?: string[]): WebSocket {
    const token = this.authManager.getToken();
    const wsUrl = token ? `${url}?token=${token}` : url;
    return new WebSocket(wsUrl, protocols);
  }
}