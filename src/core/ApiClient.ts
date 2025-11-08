import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { MinderConfig, ApiRoute, ApiError } from './types.js';
import { AuthManager } from './AuthManager.js';
import { ProxyManager } from './ProxyManager.js';
import { 
  MinderConfigError, 
  MinderNetworkError, 
  MinderTimeoutError, 
  MinderOfflineError,
  MinderValidationError,
  MinderAuthError,
  MinderAuthorizationError
} from '../errors/index.js';
import { 
  CSRFTokenManager, 
  XSSSanitizer, 
  RateLimiter, 
  getSecurityHeaders 
} from '../utils/security.js';
import {
  RequestBatcher,
  RequestDeduplicator,
  PerformanceMonitor,
} from '../utils/performance.js';
import type { DebugManager } from '../debug/DebugManager.js';

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private config: MinderConfig;
  private authManager: AuthManager;
  private proxyManager?: ProxyManager;
  private debugManager?: DebugManager;
  private requestCache: Map<string, Promise<any>> = new Map();
  private csrfManager?: CSRFTokenManager;
  private rateLimiter?: RateLimiter;
  private sanitizer?: XSSSanitizer;
  private requestBatcher?: RequestBatcher;
  private deduplicator?: RequestDeduplicator;
  private performanceMonitor?: PerformanceMonitor;

  constructor(config: MinderConfig, authManager: AuthManager, proxyManager?: ProxyManager, debugManager?: DebugManager) {
    this.config = config;
    this.authManager = authManager;
    this.proxyManager = proxyManager;
    this.debugManager = debugManager;

    // Initialize security utilities
    if (config.security?.csrfProtection) {
      const csrfConfig = typeof config.security.csrfProtection === 'object' 
        ? config.security.csrfProtection 
        : { enabled: true };
      this.csrfManager = new CSRFTokenManager(csrfConfig.cookieName);
    }

    if (config.security?.rateLimiting) {
      this.rateLimiter = new RateLimiter(config.security.rateLimiting.storage || 'memory');
    }

    if (config.security?.sanitization) {
      this.sanitizer = new XSSSanitizer(config.security.sanitization);
    }

    // Initialize performance utilities
    if (config.performance?.deduplication) {
      this.deduplicator = new RequestDeduplicator();
    }

    if (config.performance?.batching) {
      this.requestBatcher = new RequestBatcher(config.performance.batchDelay || 10);
    }

    if (config.performance?.monitoring) {
      this.performanceMonitor = new PerformanceMonitor();
    }

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
        ...getSecurityHeaders(config.security?.headers),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth, CORS, and security
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Debug logging - API Request
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log('api', `🚀 ${config.method?.toUpperCase()} ${config.url}`, {
            method: config.method,
            url: config.url,
            headers: config.headers,
            data: config.data,
            params: config.params
          });
        }

        const token = this.authManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // CSRF Protection
        if (this.csrfManager) {
          const csrfConfig = typeof this.config.security?.csrfProtection === 'object'
            ? this.config.security.csrfProtection
            : { enabled: true, headerName: 'X-CSRF-Token' };
          const headerName = csrfConfig.headerName || 'X-CSRF-Token';
          config.headers[headerName] = this.csrfManager.getToken();
        }
        
        // Rate limiting check
        if (this.rateLimiter && this.config.security?.rateLimiting) {
          const key = `${config.method}:${config.url}`;
          const { requests, window } = this.config.security.rateLimiting;
          if (!this.rateLimiter.check(key, requests, window)) {
            throw new MinderNetworkError('Rate limit exceeded. Please try again later.', 429, undefined, 'RATE_LIMIT_EXCEEDED');
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
      (response) => {
        // Debug logging - API Response Success
        if (this.debugManager && this.config.debug?.networkLogs) {
          const duration = response.config.headers?.['X-Request-Start-Time'] 
            ? Date.now() - parseInt(response.config.headers['X-Request-Start-Time'] as string)
            : undefined;
          
          this.debugManager.log('api', `✅ ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}${duration ? ` (${duration}ms)` : ''}`, {
            status: response.status,
            statusText: response.statusText,
            data: response.data,
            headers: response.headers,
            duration
          });
        }
        return response;
      },
      async (error) => {
        // Debug logging - API Response Error
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log('api', `❌ ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
            data: error.response?.data
          });
        }

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

  private handleError(error: unknown): ApiError {
    // Type narrowing for axios-like errors with response
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as {
        response?: {
          data?: { message?: string; code?: string; errors?: Record<string, string[]> };
          status?: number;
          statusText?: string;
        };
        config?: {
          url?: string;
          method?: string;
        };
        message?: string;
        code?: string;
      };
      
      const status = axiosError.response?.status || 0;
      const url = axiosError.config?.url;
      const method = axiosError.config?.method?.toUpperCase();
      const responseData = axiosError.response?.data;
      
      // Handle specific HTTP status codes with enhanced errors
      switch (status) {
        case 400:
          return {
            message: responseData?.message || 'Bad Request',
            status,
            code: 'BAD_REQUEST',
            details: responseData,
          };
        
        case 401:
          throw new MinderAuthError(
            responseData?.message || 'Authentication required'
          );
        
        case 403:
          throw new MinderAuthorizationError(
            responseData?.message || 'Permission denied'
          );
        
        case 404:
          const notFoundMsg = responseData?.message || `Resource not found: ${method} ${url}`;
          throw new MinderNetworkError(notFoundMsg, 404, responseData, url, method);
        
        case 422:
          throw new MinderValidationError(
            responseData?.message || 'Validation failed',
            responseData?.errors
          );
        
        case 429:
          const rateLimitMsg = responseData?.message || 'Too many requests - rate limit exceeded';
          throw new MinderNetworkError(rateLimitMsg, 429, responseData, url, method);
        
        case 500:
        case 502:
        case 503:
        case 504:
          const serverMsg = responseData?.message || 'Server error - please try again later';
          throw new MinderNetworkError(serverMsg, status, responseData, url, method);
        
        default:
          throw new MinderNetworkError(
            responseData?.message || axiosError.message || 'API error',
            status,
            responseData,
            url,
            method,
            responseData?.code || 'API_ERROR'
          );
      }
    }
    
    // Network error (has request but no response)
    if (error && typeof error === 'object' && 'request' in error) {
      const networkError = error as { 
        request?: unknown; 
        code?: string;
        config?: { url?: string; method?: string; timeout?: number };
      };
      
      // Check for timeout
      if (networkError.code === 'ECONNABORTED') {
        throw new MinderTimeoutError(
          'Request timeout',
          networkError.config?.timeout || 30000,
          networkError.config?.url
        );
      }
      
      // Check for offline
      if (networkError.code === 'ERR_NETWORK' || typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new MinderOfflineError('No network connection', networkError.config?.url);
      }
      
      // Generic network error
      throw new MinderNetworkError(
        'Network error - please check your connection',
        0,
        undefined,
        networkError.config?.url,
        networkError.config?.method?.toUpperCase(),
        'NETWORK_ERROR'
      );
    }
    
    // Other errors
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error occurred';
      
    return {
      message: errorMessage,
      code: 'UNKNOWN_ERROR',
      details: error,
    };
  }

  private sanitizeData(data: unknown): unknown {
    if (!this.sanitizer) return data;
    return this.sanitizer.sanitize(data);
  }

  async request<T = any>(
    routeName: string,
    data?: any,
    params?: Record<string, unknown>,
    options?: AxiosRequestConfig
  ): Promise<T> {
    const route = this.config.routes?.[routeName];
    if (!route) {
      const availableRoutes = Object.keys(this.config.routes || {});
      const error = new MinderConfigError(
        `Route '${routeName}' not found in configuration`,
        `routes.${routeName}`,
        'ROUTE_NOT_FOUND',
        { requestedRoute: routeName, availableRoutes }
      );
      error.addSuggestion({
        message: `Available routes: ${availableRoutes.join(', ') || 'none configured'}`,
        action: 'Add this route to your configuration or check for typos',
        link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#routes'
      });
      throw error;
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
    const startTime = performance.now();
    
    let requestPromise = this.axiosInstance.request(requestConfig);
    
    // Use deduplication if enabled
    if (this.deduplicator && route.method === 'GET') {
      requestPromise = this.deduplicator.deduplicate(cacheKey, () => 
        this.axiosInstance.request(requestConfig)
      );
    } else if (route.method === 'GET' && this.config.performance?.deduplication) {
      this.requestCache.set(cacheKey, requestPromise);
      
      // Clean up cache after request completes
      requestPromise.finally(() => {
        setTimeout(() => this.requestCache.delete(cacheKey), 1000);
      });
    }
    
    const response: AxiosResponse<T> = await requestPromise;
    
    // Record performance metrics
    if (this.performanceMonitor) {
      const duration = performance.now() - startTime;
      this.performanceMonitor.recordLatency(routeName, duration);
    }
    
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

  // Get performance metrics
  getPerformanceMetrics() {
    return this.performanceMonitor?.getMetrics();
  }

  // Reset performance metrics
  resetPerformanceMetrics() {
    this.performanceMonitor?.reset();
  }
}