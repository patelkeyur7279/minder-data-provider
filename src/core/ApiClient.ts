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
  private requestCache: Map<string, Promise<any>> = new Map();
  private rateLimiter: Map<string, number[]> = new Map();

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
    // Request interceptor for auth, CORS, and security
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.authManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Security headers
        if (this.config.security?.csrfProtection) {
          config.headers['X-CSRF-Token'] = this.generateCSRFToken();
        }
        
        // Rate limiting check
        if (this.config.security?.rateLimiting) {
          const key = `${config.method}:${config.url}`;
          if (!this.checkRateLimit(key)) {
            throw new Error('Rate limit exceeded');
          }
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

  private generateCSRFToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private checkRateLimit(key: string): boolean {
    if (!this.config.security?.rateLimiting) return true;
    
    const now = Date.now();
    const window = this.config.security.rateLimiting.window;
    const maxRequests = this.config.security.rateLimiting.requests;
    
    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }
    
    const requests = this.rateLimiter.get(key)!;
    const validRequests = requests.filter(time => now - time < window);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.rateLimiter.set(key, validRequests);
    return true;
  }

  private sanitizeData(data: any): any {
    if (!this.config.security?.sanitization) return data;
    
    if (typeof data === 'string') {
      return data.replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = Array.isArray(data) ? [] : {};
      for (const key in data) {
        sanitized[key] = this.sanitizeData(data[key]);
      }
      return sanitized;
    }
    
    return data;
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
    // let url = `${this.config.apiBaseUrl}${route.url}`;
    
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

    // Request deduplication for GET requests
    const cacheKey = `${route.method}:${url}:${JSON.stringify(data || {})}`;
    if (route.method === 'GET' && this.config.performance?.deduplication) {
      const cachedRequest = this.requestCache.get(cacheKey);
      if (cachedRequest) {
        return cachedRequest;
      }
    }

    // Handle different content types with sanitization
    if (data) {
      const sanitizedData = this.sanitizeData(data);
      
      if (sanitizedData instanceof FormData) {
        requestConfig.data = sanitizedData;
        requestConfig.headers!['Content-Type'] = 'multipart/form-data';
      } else if (typeof sanitizedData === 'string' && sanitizedData.startsWith('<?xml')) {
        requestConfig.data = sanitizedData;
        requestConfig.headers!['Content-Type'] = 'application/xml';
      } else {
        requestConfig.data = sanitizedData;
      }
    }

    // Execute request with caching for GET
    const requestPromise = this.axiosInstance.request(requestConfig);
    
    if (route.method === 'GET' && this.config.performance?.deduplication) {
      this.requestCache.set(cacheKey, requestPromise);
      
      // Clean up cache after request completes
      requestPromise.finally(() => {
        setTimeout(() => this.requestCache.delete(cacheKey), 1000);
      });
    }
    
    const response: AxiosResponse<T> = await requestPromise;
    
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