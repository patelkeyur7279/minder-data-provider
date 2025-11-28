import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { MinderConfig, ApiRoute, ApiError } from './types.js';
import { HttpMethod, DebugLogType } from '../constants/enums.js';
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
import { CorsManager, handleCorsError } from '../utils/corsManager.js';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requestCache: Map<string, Promise<any>> = new Map();
  private csrfManager?: CSRFTokenManager;
  private rateLimiter?: RateLimiter;
  private sanitizer?: XSSSanitizer;
  private requestBatcher?: RequestBatcher;
  private deduplicator?: RequestDeduplicator;
  private performanceMonitor?: PerformanceMonitor;
  private corsManager?: CorsManager;

  // Token refresh state
  private isRefreshing = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

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
      this.rateLimiter = new RateLimiter();
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

    // Initialize CORS manager
    if (config.cors?.enabled) {
      this.corsManager = new CorsManager(config.cors);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processQueue(error: any, token: string | null = null) {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else if (token) {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  private setupInterceptors() {
    // Request interceptor for auth, CORS, and security
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // Debug logging - API Request
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log(DebugLogType.API, `🚀 ${config.method?.toUpperCase()} ${config.url}`, {
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

        // Add CORS headers automatically
        if (this.corsManager) {
          const corsHeaders = this.corsManager.getCorsHeaders(
            config.method as HttpMethod,
            config.headers as Record<string, string>
          );
          Object.assign(config.headers, corsHeaders);
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

          this.debugManager.log(DebugLogType.API, `✅ ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}${duration ? ` (${duration}ms)` : ''}`, {
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
          this.debugManager.log(DebugLogType.API, `❌ ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
            data: error.response?.data
          });
        }

        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          // Check if refresh is configured
          if (this.config.auth?.refreshUrl) {
            if (this.isRefreshing) {
              // If already refreshing, queue this request
              return new Promise((resolve, reject) => {
                this.failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  originalRequest.headers['Authorization'] = `Bearer ${token}`;
                  return this.axiosInstance.request(originalRequest);
                })
                .catch((err) => {
                  return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            this.isRefreshing = true;

            try {
              // Call refresh endpoint
              // Use axios directly to avoid interceptors loop
              const refreshToken = await this.authManager.getRefreshToken();

              // If using cookies, the refresh token might be HttpOnly and not accessible via JS.
              // In that case, we send the request anyway, assuming the browser will send the cookie.
              const isCookieStorage = this.config.auth?.storage === 'cookie'; // Check string value or enum

              if (!refreshToken && !isCookieStorage) {
                // If not using cookies and no token, we can't refresh
                throw new Error('No refresh token available');
              }

              const response = await axios.post(
                `${this.config.apiBaseUrl}${this.config.auth.refreshUrl}`,
                refreshToken ? { refreshToken } : {}, // Only send body if we have the token
                {
                  withCredentials: true, // Important for cookies
                  headers: {
                    'Content-Type': 'application/json',
                    // Add any other necessary headers
                  }
                }
              );

              const { token, refreshToken: newRefreshToken } = response.data;

              if (token) {
                this.authManager.setToken(token);
                if (newRefreshToken) {
                  this.authManager.setRefreshToken(newRefreshToken);
                }

                this.processQueue(null, token);
                this.isRefreshing = false;

                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                return this.axiosInstance.request(originalRequest);
              } else {
                throw new Error('No token returned from refresh endpoint');
              }
            } catch (refreshError) {
              this.processQueue(refreshError, null);
              this.isRefreshing = false;
              this.authManager.clearAuth();
              if (this.config.auth?.onAuthError) {
                this.config.auth.onAuthError();
              }
              return Promise.reject(refreshError);
            }
          } else {
            // No refresh configured, just fail
            this.authManager.clearAuth();
            if (this.config.auth?.onAuthError) {
              this.config.auth.onAuthError();
            }
          }
        } else if (error.response?.status === 401) {
          // Already retried or failed
          this.authManager.clearAuth();
          if (this.config.auth?.onAuthError) {
            this.config.auth.onAuthError();
          }
        }

        // Handle CORS errors automatically
        if (this.corsManager) {
          const corsHandling = await handleCorsError(error, this.corsManager, {
            url: error.config?.url || '',
            method: error.config?.method as HttpMethod || HttpMethod.GET,
            headers: error.config?.headers as Record<string, string> || {},
            data: error.config?.data
          });

          if (corsHandling.shouldRetry) {
            if (corsHandling.modifiedRequest) {
              // Retry with modified request
              return this.axiosInstance.request({
                ...error.config,
                ...corsHandling.modifiedRequest
              });
            } else if (corsHandling.useProxy && this.proxyManager) {
              // Retry through proxy
              const proxyConfig = { ...error.config };
              proxyConfig.url = this.proxyManager.rewriteUrl(error.config?.url || '', {} as ApiRoute);
              proxyConfig.baseURL = '';
              return this.axiosInstance.request(proxyConfig);
            } else if (corsHandling.fallbackUrl) {
              // Retry with fallback URL
              return this.axiosInstance.request({
                ...error.config,
                url: corsHandling.fallbackUrl
              });
            }
          }

          if (corsHandling.error) {
            throw corsHandling.error;
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
    // Check if it's an AxiosError
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      const status = axiosError.response?.status || 0;
      const url = axiosError.config?.url;
      const method = axiosError.config?.method?.toUpperCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseData = axiosError.response?.data as any;
      const responseHeaders = axiosError.response?.headers as Record<string, string> | undefined;

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
          // Check if this is a CORS origin blocked error
          if (responseHeaders?.['access-control-allow-origin'] === 'null') {
            const corsMsg = responseData?.message || 'CORS origin blocked - request origin not allowed';
            throw new MinderNetworkError(corsMsg, 403, responseData, url, method, 'CORS_ORIGIN_BLOCKED');
          }
          throw new MinderAuthorizationError(
            responseData?.message || 'Permission denied'
          );

        case 404: {
          const notFoundMsg = responseData?.message || `Resource not found: ${method} ${url}`;
          throw new MinderNetworkError(notFoundMsg, 404, responseData, url, method);
        }

        case 405: {
          // Check if this is a CORS preflight failed error
          if (method === 'OPTIONS') {
            const corsMsg = responseData?.message || 'CORS preflight request failed - server does not allow OPTIONS method';
            throw new MinderNetworkError(corsMsg, 405, responseData, url, method, 'CORS_PREFLIGHT_FAILED');
          }
          const methodMsg = responseData?.message || `Method not allowed: ${method} ${url}`;
          throw new MinderNetworkError(methodMsg, 405, responseData, url, method);
        }

        case 422: {
          throw new MinderValidationError(
            responseData?.message || 'Validation failed',
            responseData?.errors
          );
        }

        case 429: {
          const rateLimitMsg = responseData?.message || 'Too many requests - rate limit exceeded';
          throw new MinderNetworkError(rateLimitMsg, 429, responseData, url, method);
        }

        case 500:
        case 502:
        case 503:
        case 504: {
          const serverMsg = responseData?.message || 'Server error - please try again later';
          throw new MinderNetworkError(serverMsg, status, responseData, url, method);
        }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(
    routeName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    let requestPromise: Promise<AxiosResponse<T>>;

    // Use deduplication if enabled
    if (this.deduplicator && route.method === 'GET') {
      requestPromise = this.deduplicator.deduplicate(cacheKey, () =>
        this.axiosInstance.request(requestConfig)
      );
    } else {
      requestPromise = this.axiosInstance.request(requestConfig);

      // Simple cache logic (fallback)
      if (route.method === 'GET' && this.config.performance?.deduplication) {
        this.requestCache.set(cacheKey, requestPromise);

        // Clean up cache after request completes
        requestPromise.finally(() => {
          setTimeout(() => this.requestCache.delete(cacheKey), 1000);
        });
      }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return response.data.map((item: any) => new (route.model as any)().fromJSON(item)) as T;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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