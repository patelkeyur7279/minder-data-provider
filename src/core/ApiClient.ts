import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { MinderConfig, ApiRoute, ApiError } from './types.js';
import { HttpMethod, DebugLogType } from '../constants/enums.js';
import { AuthManager } from './AuthManager.js';
import { ProxyManager } from './ProxyManager.js';
import { OfflineManager } from './OfflineManager.js';
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
  RateLimiter
} from '../utils/security.js';
import { CorsManager, handleCorsError } from '../utils/corsManager.js';
import {
  RequestBatcher,
  RequestDeduplicator,
  PerformanceMonitor,
} from '../utils/performance.js';
import { AnalyticsManager } from '../utils/analytics.js';
import { telemetry } from '../utils/TelemetryTracker.js';
import { TelemetryManager } from '../utils/telemetry.js';
import type { DebugManager } from '../debug/DebugManager.js';
import { PluginManager, pluginManager as globalPluginManager } from '../plugins/PluginSystem.js';
import { redactSecrets } from '../security/secrets.js';

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
  private analyticsManager?: AnalyticsManager;
  private telemetryManager?: TelemetryManager;
  private corsManager?: CorsManager;
  private offlineManager?: OfflineManager;

  // Background timers — stored so destroy() can clear them (otherwise they leak
  // and keep firing after the owning provider unmounts / on HMR).
  private analyticsTimer?: ReturnType<typeof setInterval>;
  private telemetryTimer?: ReturnType<typeof setInterval>;

  // Plugin bus. Per-instance when `config.plugins` is supplied, else the global
  // singleton (so `registerPlugins(...)` keeps working). `ownsPluginManager`
  // means destroy() should tear it down.
  private pluginManager: PluginManager;
  private ownsPluginManager = false;

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

      // Validate configuration immediately
      const validation = this.corsManager.validateConfig();

      // Log errors (critical)
      if (!validation.isValid) {
        validation.errors.forEach(error => {
          console.error(`[Minder] CORS Configuration Error: ${error}`);
        });
      }

      // Log warnings (development only)
      if (process.env.NODE_ENV === 'development') {
        validation.warnings.forEach(warning => {
          console.warn(`[Minder] CORS Warning: ${warning}`);
        });
      }
    }

    // Initialize Analytics
    if (config.analytics?.enabled) {
      this.analyticsManager = new AnalyticsManager(config.analytics);

      // Auto-track performance if enabled
      if (config.analytics.autoTrackPerformance && this.performanceMonitor) {
        this.analyticsTimer = setInterval(() => {
          const metrics = this.performanceMonitor?.getMetrics();
          if (metrics) {
            this.analyticsManager?.trackPerformance(metrics);
          }
        }, 60000); // Send every minute
      }
    }

    // Initialize Telemetry (Framework Phone Home)
    if (config.telemetry?.enabled) {
      this.telemetryManager = new TelemetryManager(config.telemetry);

      // Send performance stats to HQ
      if (this.performanceMonitor) {
        this.telemetryTimer = setInterval(() => {
          const metrics = this.performanceMonitor?.getMetrics();
          if (metrics) {
            this.telemetryManager?.trackPerformance(metrics);
          }
        }, 300000); // Send every 5 minutes (less frequent than analytics)
      }
    }

    // Initialize Offline Manager
    if (config.offline?.enabled) {
      this.offlineManager = new OfflineManager(config.offline);
      this.offlineManager.setProcessQueueCallback(async (request) => {
        // Replay request
        await this.axiosInstance.request({
          method: request.method,
          url: request.url,
          data: request.body,
          headers: request.headers
        });
      });
    }

    // Initialize plugin bus — per-instance if plugins are supplied, else the
    // shared global manager (so registerPlugins(...) keeps working).
    if (config.plugins && config.plugins.length > 0) {
      this.pluginManager = new PluginManager({ debug: config.debug?.enabled });
      this.ownsPluginManager = true;
      config.plugins.forEach((p) => this.pluginManager.register(p));
    } else {
      this.pluginManager = globalPluginManager;
    }
    if (this.pluginManager.size > 0) {
      // onInit is isolated per-plugin inside the manager; don't block construction.
      void this.pluginManager.init(config).catch(() => { /* isolated */ });
    }

    // Use proxy baseURL if enabled, otherwise use original
    const baseURL = proxyManager?.isEnabled() ? proxyManager.config.baseUrl : config.apiBaseUrl;

    // Create axios instance with CORS support.
    //
    // IMPORTANT: default request headers here must stay within the CORS
    // "safelisted" set (Content-Type: application/json is safelisted;
    // Accept always is). Response-type security headers (CSP, X-Frame-Options,
    // etc. — see getSecurityHeaders() in utils/security.ts) must NEVER be
    // spread onto the request here: they are non-safelisted, so their mere
    // presence forces the browser to perform a CORS preflight OPTIONS request
    // before every single call, roughly doubling latency cross-origin.
    //
    // withCredentials defaults to false (opt-in via config.cors.credentials)
    // for the same reason: sending credentials on cross-origin requests
    // changes preflight requirements and requires the server to echo back a
    // non-wildcard Access-Control-Allow-Origin, so it should be an explicit
    // choice rather than a silent default.
    this.axiosInstance = axios.create({
      baseURL,
      timeout: config.performance?.timeout || 30000,
      withCredentials: config.cors?.credentials === true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Release all resources held by this client.
   *
   * Clears the background analytics/telemetry timers, drops the in-flight
   * request cache and any queued refresh waiters, and tears down the offline
   * manager if it exposes a destroy(). Call this when the owning provider
   * unmounts so intervals/listeners don't leak (especially under HMR or when
   * multiple clients are created).
   */
  public destroy(): void {
    if (this.analyticsTimer) {
      clearInterval(this.analyticsTimer);
      this.analyticsTimer = undefined;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = undefined;
    }
    this.requestCache.clear();
    this.failedQueue = [];
    if (this.ownsPluginManager) {
      void this.pluginManager.destroy();
    }
    // OfflineManager (core) registers window listeners; release them if it can.
    (this.offlineManager as unknown as { destroy?: () => void })?.destroy?.();
  }

  // ── Plugin bus emitters (observability; fire-and-forget, never block I/O) ──

  private emitPluginRequest(config: AxiosRequestConfig): void {
    if (this.pluginManager.size === 0) return;
    void this.pluginManager.executeRequestHooks({
      method: (config.method || 'GET').toUpperCase(),
      url: config.url || '',
      headers: config.headers as Record<string, string> | undefined,
      body: config.data,
      timestamp: Date.now(),
    });
  }

  private emitPluginResponse(response: AxiosResponse): void {
    if (this.pluginManager.size === 0) return;
    const start = (response.config as { __minderStart?: number }).__minderStart;
    void this.pluginManager.executeResponseHooks({
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, string> | undefined,
      duration: start ? Date.now() - start : 0,
      timestamp: Date.now(),
    });
  }

  private emitPluginError(error: AxiosError): void {
    if (this.pluginManager.size === 0) return;
    const cfg = error.config as (AxiosRequestConfig & { __minderStart?: number }) | undefined;
    void this.pluginManager.executeErrorHooks({
      message: error.message || 'Request error',
      code: error.code || (error.response ? String(error.response.status) : undefined),
      stack: error.stack,
      request: cfg
        ? {
            method: (cfg.method || 'GET').toUpperCase(),
            url: cfg.url || '',
            headers: cfg.headers as Record<string, string> | undefined,
            body: cfg.data,
            timestamp: cfg.__minderStart || Date.now(),
          }
        : undefined,
      timestamp: Date.now(),
    });
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
        // Automatically handle FormData Content-Type
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
          if (config.headers) {
            delete config.headers['Content-Type'];
            delete config.headers['content-type'];
            // Also explicitly delete from common/post/put defaults which axios might merge
            const headers = config.headers as any;
            if (headers.common) delete headers.common['Content-Type'];
            if (headers.post) delete headers.post['Content-Type'];
            if (headers.put) delete headers.put['Content-Type'];
          }
        }

        // Debug logging - API Request (moved below header manipulations)
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log(DebugLogType.API, `🚀 ${config.method?.toUpperCase()} ${config.url}`, {
            method: config.method,
            url: config.url,
            headers: this.sanitizeHeaders(config.headers),
            data: redactSecrets(config.data),
            params: redactSecrets(config.params)
          });
        }

        let token = this.authManager.getToken(); // Add auth token if available
        if (!token && this.pluginManager.size > 0) {
          // Auth-provider plugins (Firebase/Auth0/Clerk…) can supply the token.
          token = await this.pluginManager.collectToken();
        }
        if (token) {
          const authHeader = this.config.auth?.authHeader || 'Authorization';
          const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
          config.headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
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
            telemetry.recordRateLimitHit();
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

        // Stamp start time + fire plugin request hooks (non-blocking observability)
        (config as { __minderStart?: number }).__minderStart = Date.now();
        this.emitPluginRequest(config);

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
            data: redactSecrets(response.data),
            headers: this.sanitizeHeaders(response.headers),
            duration
          });
        }
        this.emitPluginResponse(response);
        return response;
      },
      async (error) => {
        // Debug logging - API Response Error
        if (this.debugManager && this.config.debug?.networkLogs) {
          this.debugManager.log(DebugLogType.API, `❌ ${error.response?.status || 'ERROR'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
            data: redactSecrets(error.response?.data)
          });
        }

        this.emitPluginError(error as AxiosError);

        const originalRequest = error.config;

        // --- Exponential Backoff Retry Logic ---
        const retries = this.config.performance?.retries ?? 0;
        const currentRetryCount = originalRequest._retryCount || 0;
        
        // Retry on Network errors (no response), 5XX server errors, or 429 Too Many Requests
        const isRetryableError = !error.response || 
                               (error.response.status >= 500 && error.response.status < 600) || 
                               error.response.status === 429;
        
        // Allow custom shouldRetry function
        const customShouldRetry = this.config.performance?.retryConfig?.shouldRetry;
        const shouldRetry = customShouldRetry 
          ? customShouldRetry(error, currentRetryCount) 
          : isRetryableError;

        if (shouldRetry && currentRetryCount < retries) {
          originalRequest._retryCount = currentRetryCount + 1;
          
          const baseDelay = this.config.performance?.retryDelay ?? 1000;
          const factor = this.config.performance?.retryConfig?.factor ?? 2;
          const maxDelay = this.config.performance?.retryConfig?.maxDelay ?? 30000;
          
          // Calculate delay with exponential backoff and jitter
          const exponentialDelay = Math.min(baseDelay * Math.pow(factor, currentRetryCount), maxDelay);
          const jitter = Math.random() * 200; // Add up to 200ms jitter
          const delay = exponentialDelay + jitter;
          
          if (this.debugManager && this.config.debug?.networkLogs) {
            this.debugManager.log(DebugLogType.API, `⚠️ Retrying request (${originalRequest._retryCount}/${retries}) in ${Math.round(delay)}ms: ${originalRequest.method?.toUpperCase()} ${originalRequest.url}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.axiosInstance.request(originalRequest);
        }
        // --- End Retry Logic ---

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          telemetry.recordAuthFailure();
          originalRequest._retry = true;
          // Check if refresh is configured
          if (this.config.auth?.refreshUrl) {
            if (this.isRefreshing) {
              // If already refreshing, queue this request
              return new Promise((resolve, reject) => {
                this.failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  const authHeader = this.config.auth?.authHeader || 'Authorization';
                  const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                  originalRequest.headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
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

              // Construct URL safely
              const baseUrl = this.config.apiBaseUrl.replace(/\/$/, '');
              const refreshUrl = this.config.auth.refreshUrl?.replace(/^\//, '') || '';
              const fullRefreshUrl = `${baseUrl}/${refreshUrl}`;

              // Prepare headers
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };

              // Add Authorization header with expired token if available (some APIs require this)
              // We default to true to maintain backward compatibility, but allow users to disable it
              const sendToken = this.config.auth?.sendTokenOnRefresh !== false;
              const expiredToken = this.authManager.getToken();

              if (sendToken && expiredToken) {
                const authHeader = this.config.auth?.authHeader || 'Authorization';
                const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                headers[authHeader] = authPrefix ? `${authPrefix} ${expiredToken}` : expiredToken;
              }

              // Log refresh attempt (since it bypasses interceptors)
              if (this.debugManager && this.config.debug?.networkLogs) {
                this.debugManager.log(DebugLogType.API, `🚀 POST ${fullRefreshUrl} (Refresh)`, {
                  hasRefreshToken: !!refreshToken,
                  isCookieStorage,
                  headers: this.sanitizeHeaders(headers)
                });
              }

              const response = await axios.post(
                fullRefreshUrl,
                this.config.auth?.getRefreshRequestBody
                  ? this.config.auth.getRefreshRequestBody(refreshToken)
                  : (refreshToken ? { refreshToken } : {}),
                {
                  // Follow the same opt-in flag as the main axios instance —
                  // defaulting to true here would silently send credentials
                  // cross-origin even when the app never asked for it.
                  withCredentials: this.config.cors?.credentials === true,
                  headers
                }
              );

              // Flexible token extraction
              let responseData = response.data;

              // Use custom model if configured
              if (this.config.auth?.refreshModel) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseData = new (this.config.auth.refreshModel as any)().fromJSON(response.data);
              }

              const tokenKey = this.config.auth?.tokenKey || 'accessToken';

              // Try to find token in various common properties
              const token = responseData.token || responseData.accessToken || responseData[tokenKey];
              const newRefreshToken = responseData.refreshToken || responseData.refresh_token;

              if (token) {
                this.authManager.setToken(token);
                if (newRefreshToken) {
                  this.authManager.setRefreshToken(newRefreshToken);
                }

                // Notify plugins of the token rotation (non-blocking)
                if (this.pluginManager.size > 0) {
                  void this.pluginManager.executeAuthRefreshHooks({
                    accessToken: token,
                    refreshToken: newRefreshToken,
                  });
                }

                this.processQueue(null, token);
                this.isRefreshing = false;

                const authHeader = this.config.auth?.authHeader || 'Authorization';
                const authPrefix = this.config.auth?.authTokenPrefix !== undefined ? this.config.auth.authTokenPrefix : 'Bearer';
                originalRequest.headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;
                return this.axiosInstance.request(originalRequest);
              } else {
                throw new Error(`No token returned from refresh endpoint. Response keys: ${Object.keys(responseData || {}).join(', ')}. Data: ${JSON.stringify(responseData)}`);
              }
            } catch (refreshError) {
              // Log refresh failure
              if (this.debugManager && this.config.debug?.networkLogs) {
                this.debugManager.log(DebugLogType.API, `❌ REFRESH FAILED`, {
                  error: redactSecrets(refreshError instanceof Error ? refreshError.message : refreshError)
                });
              }

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
            method: (error.config?.method as HttpMethod) || HttpMethod.GET,
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

        // Track error in analytics
        if (this.analyticsManager) {
          this.analyticsManager.trackError(apiError, `${error.config?.method?.toUpperCase()} ${error.config?.url}`);
        }

        // Report error to Framework HQ (Telemetry)
        if (this.telemetryManager) {
          this.telemetryManager.trackError(apiError, 'API_REQUEST_FAILURE');
        }

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
          telemetry.recordAuthFailure();
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
          telemetry.recordRateLimitHit();
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
        // Queue request if offline manager is enabled
        if (this.offlineManager && networkError.config?.url && networkError.config?.method) {
          this.offlineManager.queueRequest({
            url: networkError.config.url,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            method: networkError.config.method as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: (networkError.config as any).data,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            headers: (networkError.config as any).headers
          });
        }
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

    // Skip sanitization for binary types and FormData
    if (typeof FormData !== 'undefined' && data instanceof FormData) return data;
    if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
    if (typeof File !== 'undefined' && data instanceof File) return data;

    return this.sanitizer.sanitize(data);
  }

  private sanitizeHeaders(headers: any): any {
    if (!headers) return headers;
    const sanitized = { ...headers };
    const sensitiveHeaders = ['Authorization', 'Cookie', 'Set-Cookie', 'X-CSRF-Token', 'x-csrf-token'];

    Object.keys(sanitized).forEach(key => {
      if (sensitiveHeaders.some(h => h.toLowerCase() === key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(
    routeName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any,
    params?: Record<string, unknown>,
    // `rawUrl` is a Minder-only escape-hatch flag (not an axios option); it is
    // stripped before the config reaches axios.
    options?: AxiosRequestConfig & { rawUrl?: boolean }
  ): Promise<T> {
    // ── Ad-hoc / third-party escape hatch (mirrors useMinder's route-validation
    //    exemption and minder()'s standalone behavior) ─────────────────────────
    // An absolute URL or an explicit `rawUrl:true` option skips the registry
    // entirely and builds the request directly. Auth/interceptors/plugins still
    // apply because we go through the shared axiosInstance.
    const isAbsoluteUrl = /^https?:\/\//i.test(routeName);
    if (isAbsoluteUrl || options?.rawUrl === true) {
      return this.requestRaw<T>(routeName, data, params, options, isAbsoluteUrl);
    }

    const route = this.config.routes?.[routeName];
    if (!route) {
      // An ad-hoc relative PATH (leading "/") that is not a registered route
      // NAME is treated as a raw path resolved against baseURL. This lets
      // provider-mode `useMinder('/ad-hoc')` work without the hook having to
      // thread the rawUrl flag. BARE unknown names (no leading slash) still
      // throw the helpful ROUTE_NOT_FOUND below.
      if (routeName.startsWith('/')) {
        return this.requestRaw<T>(routeName, data, params, options, false);
      }

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
    // let url = `${ this.config.apiBaseUrl }${ route.url }`;

    // Replace URL parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, String(value));
      });
    }

    // Extract headers from options to prevent overwriting during spread
    const { headers: customHeaders, ...otherOptions } = options || {};

    const requestConfig: AxiosRequestConfig = {
      method: route.method,
      url,
      headers: {
        ...route.headers,
        ...(this.proxyManager?.getProxyHeaders() || {}),
        ...(customHeaders || {})
      },
      timeout: route.timeout || this.proxyManager?.getTimeout() || this.config.performance?.timeout,
      ...otherOptions,
    };

    // Apply proxy rewriting if enabled
    if (this.proxyManager?.isEnabled()) {
      requestConfig.url = this.proxyManager.rewriteUrl(url, route);
      requestConfig.baseURL = '';
    }

    // Request deduplication for GET requests
    const cacheKey = `${route.method}: ${url}: ${JSON.stringify(data || {})}`;
    if (route.method === 'GET' && this.config.performance?.deduplication) {
      const cachedRequest = this.requestCache.get(cacheKey);
      if (cachedRequest) {
        return cachedRequest;
      }
    }

    // Handle different content types with sanitization
    if (data) {
      const sanitizedData = this.sanitizeData(data);

      if (typeof FormData !== 'undefined' && sanitizedData instanceof FormData) {
        requestConfig.data = sanitizedData;
        // Remove Content-Type to let browser/axios set it with boundary
        // We set it to undefined to ensure it's not merged with defaults
        if (requestConfig.headers) {
          delete requestConfig.headers['Content-Type'];
          delete requestConfig.headers['content-type'];
          // Also set to undefined in case some parts of the system re-add it
          (requestConfig.headers as any)['Content-Type'] = undefined;
        }
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

  /**
   * Build and dispatch a request for an ad-hoc URL that bypasses the route
   * registry — either an absolute `https?://` URL or a `rawUrl`/leading-slash
   * path. Goes through the shared axiosInstance so auth, interceptors and
   * plugins apply exactly as they do for registered routes.
   *
   * Method resolution: an explicit `options.method` wins; otherwise a request
   * carrying a body defaults to POST and a bodyless one to GET.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requestRaw<T = any>(
    routeName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    params: Record<string, unknown> | undefined,
    options: (AxiosRequestConfig & { rawUrl?: boolean }) | undefined,
    isAbsoluteUrl: boolean
  ): Promise<T> {
    // Strip the Minder-only `rawUrl` flag so it never leaks into axios config.
    const {
      headers: customHeaders,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rawUrl: _rawUrl,
      method: optionMethod,
      ...otherOptions
    } = (options || {}) as AxiosRequestConfig & { rawUrl?: boolean };

    // Resolve the URL: absolute is used verbatim; relative resolves against the
    // instance baseURL. Support trivial `:param` substitution for parity with
    // registered routes.
    let url = routeName;
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, String(value));
      });
    }

    const method = optionMethod || (data === null || data === undefined ? HttpMethod.GET : HttpMethod.POST);

    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      headers: {
        ...(this.proxyManager?.getProxyHeaders() || {}),
        ...(customHeaders || {})
      },
      timeout: this.proxyManager?.getTimeout() || this.config.performance?.timeout,
      ...otherOptions,
    };

    // Absolute URLs are used verbatim: clear baseURL so the instance's
    // apiBaseUrl is never prefixed.
    if (isAbsoluteUrl) {
      requestConfig.baseURL = '';
    }

    // Body handling with sanitization, mirroring the registered-route path.
    if (data) {
      const sanitizedData = this.sanitizeData(data);

      if (typeof FormData !== 'undefined' && sanitizedData instanceof FormData) {
        requestConfig.data = sanitizedData;
        if (requestConfig.headers) {
          delete (requestConfig.headers as Record<string, unknown>)['Content-Type'];
          delete (requestConfig.headers as Record<string, unknown>)['content-type'];
          (requestConfig.headers as Record<string, unknown>)['Content-Type'] = undefined;
        }
      } else if (typeof sanitizedData === 'string' && sanitizedData.startsWith('<?xml')) {
        requestConfig.data = sanitizedData;
        requestConfig.headers!['Content-Type'] = 'application/xml';
      } else {
        requestConfig.data = sanitizedData;
      }
    }

    const response: AxiosResponse<T> = await this.axiosInstance.request(requestConfig);
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