import type { CorsConfig } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';
import { MinderNetworkError } from '../errors/index.js';

/**
 * CORS issue types
 */
export enum CorsIssueType {
  PREFLIGHT_FAILED = 'preflight_failed',
  ORIGIN_BLOCKED = 'origin_blocked',
  METHOD_NOT_ALLOWED = 'method_not_allowed',
  HEADERS_NOT_ALLOWED = 'headers_not_allowed',
  CREDENTIALS_BLOCKED = 'credentials_blocked',
  NETWORK_ERROR = 'network_error'
}

/**
 * CORS handling strategy
 */
export enum CorsStrategy {
  NONE = 'none',
  RETRY = 'retry',
  PROXY = 'proxy',
  FALLBACK = 'fallback',
  DYNAMIC_ORIGIN = 'dynamic_origin'
}

/**
 * CORS detection result
 */
export interface CorsDetectionResult {
  hasCorsIssue: boolean;
  issueType?: CorsIssueType;
  blockedOrigin?: string;
  blockedMethod?: string;
  blockedHeaders?: string[];
  suggestedStrategy?: CorsStrategy;
  errorDetails?: any;
}

/**
 * CORS preflight result
 */
export interface PreflightResult {
  success: boolean;
  allowedMethods?: HttpMethod[];
  allowedHeaders?: string[];
  maxAge?: number;
  error?: string;
}

/**
 * Automatic CORS manager for handling cross-origin requests
 */
export class CorsManager {
  private config: CorsConfig;
  private preflightCache: Map<string, PreflightResult> = new Map();
  private corsIssues: Map<string, CorsDetectionResult> = new Map();
  private retryAttempts: Map<string, number> = new Map();

  constructor(config: CorsConfig) {
    this.config = { ...config };
    // Set defaults
    if (this.config.enabled === undefined) {
      this.config.enabled = true;
    }
    if (this.config.credentials === undefined) {
      this.config.credentials = true;
    }
    if (!this.config.methods) {
      this.config.methods = [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.OPTIONS];
    }
    if (!this.config.headers) {
      this.config.headers = ['Content-Type', 'Authorization', 'X-Requested-With'];
    }
  }

  /**
   * Detect CORS issues from error response
   */
  detectCorsIssue(error: any, url: string, method: string, headers: Record<string, string>): CorsDetectionResult {
    const cacheKey = `${method}:${url}`;
    if (this.corsIssues.has(cacheKey)) {
      return this.corsIssues.get(cacheKey)!;
    }

    const result: CorsDetectionResult = {
      hasCorsIssue: false
    };

    // Check for CORS-related error patterns
    if (error?.response) {
      const { status, headers: responseHeaders } = error.response;

      // CORS preflight failed (405 Method Not Allowed on OPTIONS)
      if (status === 405 && method === 'OPTIONS') {
        result.hasCorsIssue = true;
        result.issueType = CorsIssueType.PREFLIGHT_FAILED;
        result.suggestedStrategy = CorsStrategy.PROXY;
      }
      // CORS origin blocked (403 Forbidden)
      else if (status === 403) {
        result.hasCorsIssue = true;
        result.issueType = CorsIssueType.ORIGIN_BLOCKED;
        result.blockedOrigin = this.getOriginFromUrl(url);
        result.suggestedStrategy = CorsStrategy.DYNAMIC_ORIGIN;
      }
      // Method not allowed
      else if (status === 405) {
        result.hasCorsIssue = true;
        result.issueType = CorsIssueType.METHOD_NOT_ALLOWED;
        result.blockedMethod = method;
        result.suggestedStrategy = CorsStrategy.FALLBACK;
      }
    }
    // Network errors that might be CORS-related
    else if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('CORS')) {
      result.hasCorsIssue = true;
      result.issueType = CorsIssueType.NETWORK_ERROR;
      result.suggestedStrategy = CorsStrategy.PROXY;
    }

    // Check for missing CORS headers in request (only if no CORS issue detected yet)
    if (!result.hasCorsIssue && !headers['Origin'] && typeof window !== 'undefined') {
      // Browser request without Origin header - likely CORS issue
      result.hasCorsIssue = true;
      result.issueType = CorsIssueType.ORIGIN_BLOCKED;
      result.suggestedStrategy = CorsStrategy.DYNAMIC_ORIGIN;
    }

    this.corsIssues.set(cacheKey, result);
    return result;
  }

  /**
   * Perform automatic CORS preflight request
   */
  async performPreflight(url: string, method: HttpMethod, headers: string[]): Promise<PreflightResult> {
    const cacheKey = `preflight:${url}`;
    if (this.preflightCache.has(cacheKey)) {
      return this.preflightCache.get(cacheKey)!;
    }

    const result: PreflightResult = {
      success: false
    };

    try {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': method,
          'Access-Control-Request-Headers': headers.join(', '),
          'Origin': this.getOriginFromUrl(url)
        }
      });

      result.success = response.ok;

      if (response.ok) {
        // Parse CORS headers from response
        const allowMethods = response.headers.get('Access-Control-Allow-Methods');
        const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
        const maxAge = response.headers.get('Access-Control-Max-Age');

        if (allowMethods) {
          result.allowedMethods = allowMethods.split(',').map(m => m.trim() as HttpMethod);
        }
        if (allowHeaders) {
          result.allowedHeaders = allowHeaders.split(',').map(h => h.trim());
        }
        if (maxAge) {
          result.maxAge = parseInt(maxAge);
        }
      } else {
        result.error = `Preflight failed with status ${response.status}`;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Preflight request failed';
    }

    // Cache result for future requests (with TTL if maxAge is provided)
    this.preflightCache.set(cacheKey, result);
    if (result.maxAge) {
      setTimeout(() => {
        this.preflightCache.delete(cacheKey);
      }, result.maxAge * 1000);
    }

    return result;
  }

  /**
   * Apply CORS handling strategy
   */
  applyStrategy(
    strategy: CorsStrategy,
    originalRequest: {
      url: string;
      method: HttpMethod;
      headers: Record<string, string>;
      data?: any;
    },
    corsIssue: CorsDetectionResult
  ): {
    modifiedRequest?: typeof originalRequest;
    useProxy?: boolean;
    retry?: boolean;
    fallbackUrl?: string;
  } {
    switch (strategy) {
      case CorsStrategy.PROXY:
        return { useProxy: true };

      case CorsStrategy.RETRY:
        const retryKey = `${originalRequest.method}:${originalRequest.url}`;
        const attempts = this.retryAttempts.get(retryKey) || 0;
        if (attempts < 3) {
          this.retryAttempts.set(retryKey, attempts + 1);
          return { retry: true };
        }
        break;

      case CorsStrategy.DYNAMIC_ORIGIN:
        // Modify origin header to match allowed origins
        const modifiedHeaders = { ...originalRequest.headers };
        if (corsIssue.blockedOrigin) {
          // Try with a more permissive origin or remove origin header
          delete modifiedHeaders['Origin'];
        }
        return {
          modifiedRequest: {
            ...originalRequest,
            headers: modifiedHeaders
          }
        };

      case CorsStrategy.FALLBACK:
        // Provide fallback URL (could be a proxy or different endpoint)
        if (this.config.proxy) {
          return { fallbackUrl: this.config.proxy };
        }
        break;
    }

    return {};
  }

  /**
   * Get appropriate headers for CORS request
   */
  getCorsHeaders(method: HttpMethod, customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...customHeaders };

    if (this.config.enabled) {
      // Add CORS request headers
      headers['Access-Control-Request-Method'] = method;

      if (this.config.headers) {
        headers['Access-Control-Request-Headers'] = this.config.headers.join(', ');
      }

      // Add Origin header if not present (for browser requests)
      if (typeof window !== 'undefined' && !headers['Origin']) {
        headers['Origin'] = window.location.origin;
      }
    }

    return headers;
  }

  /**
   * Check if a request should trigger preflight
   */
  shouldTriggerPreflight(method: HttpMethod, headers: Record<string, string>): boolean {
    if (!this.config.enabled) return false;

    // Simple requests don't need preflight
    const simpleMethods = ['GET', 'POST', 'HEAD'];
    const simpleHeaders = ['accept', 'accept-language', 'content-language', 'content-type'];

    const isSimpleMethod = simpleMethods.includes(method);
    const hasOnlySimpleHeaders = Object.keys(headers).every(header =>
      simpleHeaders.includes(header.toLowerCase()) ||
      header.toLowerCase().startsWith('x-')
    );

    const contentType = headers['Content-Type']?.toLowerCase();
    const isSimpleContentType = !contentType ||
      contentType.includes('text/plain') ||
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded');

    return !(isSimpleMethod && hasOnlySimpleHeaders && isSimpleContentType);
  }

  /**
   * Validate CORS configuration
   */
  validateConfig(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (this.config.enabled) {
      if (!this.config.origin && !this.config.proxy) {
        warnings.push('No origin or proxy specified for CORS configuration');
      }

      if (this.config.origin && Array.isArray(this.config.origin)) {
        const invalidOrigins = this.config.origin.filter(origin => !this.isValidOrigin(origin));
        if (invalidOrigins.length > 0) {
          errors.push(`Invalid CORS origins: ${invalidOrigins.join(', ')}`);
        }
      } else if (this.config.origin && !this.isValidOrigin(this.config.origin)) {
        errors.push(`Invalid CORS origin: ${this.config.origin}`);
      }

      if (this.config.methods) {
        const invalidMethods = this.config.methods.filter(method => !Object.values(HttpMethod).includes(method));
        if (invalidMethods.length > 0) {
          errors.push(`Invalid HTTP methods in CORS config: ${invalidMethods.join(', ')}`);
        }
      }

      if (this.config.credentials && !this.config.origin) {
        warnings.push('Credentials enabled but no specific origin configured - this may cause issues');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clear cached CORS data
   */
  clearCache(): void {
    this.preflightCache.clear();
    this.corsIssues.clear();
    this.retryAttempts.clear();
  }

  /**
   * Get CORS statistics
   */
  getStatistics(): {
    preflightCacheSize: number;
    corsIssuesDetected: number;
    retryAttempts: number;
  } {
    return {
      preflightCacheSize: this.preflightCache.size,
      corsIssuesDetected: this.corsIssues.size,
      retryAttempts: Array.from(this.retryAttempts.values()).reduce((sum, attempts) => sum + attempts, 0)
    };
  }

  /**
   * Helper: Extract origin from URL
   */
  private getOriginFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}`;
    } catch {
      return '';
    }
  }

  /**
   * Helper: Validate origin format
   */
  private isValidOrigin(origin: string): boolean {
    try {
      const url = new URL(origin);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

/**
 * Create CORS manager instance
 */
export function createCorsManager(config: CorsConfig): CorsManager {
  return new CorsManager(config);
}

/**
 * Detect and handle CORS issues automatically
 */
export async function handleCorsError(
  error: any,
  corsManager: CorsManager,
  originalRequest: {
    url: string;
    method: HttpMethod;
    headers: Record<string, string>;
    data?: any;
  }
): Promise<{
  shouldRetry: boolean;
  modifiedRequest?: typeof originalRequest;
  useProxy?: boolean;
  fallbackUrl?: string;
  error?: MinderNetworkError;
}> {
  const corsIssue = corsManager.detectCorsIssue(error, originalRequest.url, originalRequest.method, originalRequest.headers);

  if (!corsIssue.hasCorsIssue) {
    // Not a CORS issue, re-throw original error
    return { shouldRetry: false };
  }

  const strategy = corsIssue.suggestedStrategy || CorsStrategy.RETRY;
  const strategyResult = corsManager.applyStrategy(strategy, originalRequest, corsIssue);

  if (strategyResult.retry) {
    return { shouldRetry: true };
  }

  if (strategyResult.modifiedRequest) {
    return {
      shouldRetry: true,
      modifiedRequest: strategyResult.modifiedRequest
    };
  }

  if (strategyResult.useProxy) {
    return { shouldRetry: true, useProxy: true };
  }

  if (strategyResult.fallbackUrl) {
    return { shouldRetry: true, fallbackUrl: strategyResult.fallbackUrl };
  }

  // If no strategy worked, create a descriptive error
  const corsError = new MinderNetworkError(
    `CORS issue detected: ${corsIssue.issueType}. ${corsIssue.blockedOrigin ? `Blocked origin: ${corsIssue.blockedOrigin}` : ''}`,
    0,
    corsIssue.errorDetails,
    originalRequest.url,
    originalRequest.method,
    'CORS_ERROR'
  );

  return {
    shouldRetry: false,
    error: corsError
  };
}