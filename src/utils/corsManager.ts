import type { CorsConfig } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';
import { MinderNetworkError } from '../errors/index.js';

/**
 * Simplified CORS manager that handles common CORS issues automatically
 * Most users don't need to understand preflight requests - this handles it for them
 */
export class CorsManager {
  private config: CorsConfig;

  constructor(config: CorsConfig = {}) {
    this.config = {
      enabled: config.enabled ?? this.shouldEnableCors(),
      credentials: config.credentials ?? true,
      methods: config.methods ?? [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE],
      headers: config.headers ?? ['Content-Type', 'Authorization'],
      ...config
    };
  }

  /**
   * Automatically determine if CORS should be enabled based on environment
   */
  private shouldEnableCors(): boolean {
    // Disable CORS for server-side rendering and native apps
    if (typeof window === 'undefined') return false;

    // Check if we're in a native app context
    const win = window as any;
    if (win.ReactNativeWebView ||
      win.expo ||
      win.ExpoModules ||
      navigator.product === 'ReactNative') {
      return false;
    }

    // Enable CORS for web browsers
    return true;
  }

  /**
   * Get CORS headers for a request - simplified version
   */
  getCorsHeaders(method: HttpMethod, customHeaders: Record<string, string> = {}): Record<string, string> {
    if (!this.config.enabled) return customHeaders;

    const headers: Record<string, string> = { ...customHeaders };

    // Add Origin header for browser requests
    if (typeof window !== 'undefined' && !headers['Origin']) {
      headers['Origin'] = window.location.origin;
    }

    // Add credentials if enabled
    if (this.config.credentials) {
      headers['Credentials'] = 'include';
    }

    return headers;
  }

  /**
   * Handle CORS errors with user-friendly messages and automatic fixes
   */
  async handleCorsError(
    error: any,
    url: string,
    method: string,
    headers: Record<string, string>
  ): Promise<{
    shouldRetry: boolean;
    modifiedHeaders?: Record<string, string>;
    useProxy?: boolean;
    userFriendlyMessage: string;
  }> {
    // Not a CORS error
    if (!this.isCorsError(error)) {
      return { shouldRetry: false, userFriendlyMessage: '' };
    }

    // Try automatic fixes
    const fixes = await this.tryAutomaticFixes(error, url, method, headers);
    if (fixes.shouldRetry) {
      return {
        shouldRetry: true,
        modifiedHeaders: fixes.modifiedHeaders,
        useProxy: fixes.useProxy,
        userFriendlyMessage: fixes.message
      };
    }

    // Provide user-friendly error message
    return {
      shouldRetry: false,
      userFriendlyMessage: this.getUserFriendlyCorsMessage(error, url)
    };
  }

  /**
   * Try automatic CORS fixes
   */
  private async tryAutomaticFixes(
    error: any,
    url: string,
    method: string,
    headers: Record<string, string>
  ): Promise<{
    shouldRetry: boolean;
    modifiedHeaders?: Record<string, string>;
    useProxy?: boolean;
    message: string;
  }> {
    // Fix 1: Try without credentials first
    if (this.config.credentials && this.hasCredentialsError(error)) {
      return {
        shouldRetry: true,
        modifiedHeaders: { ...headers, 'Credentials': 'omit' },
        message: 'Retrying request without credentials (this often fixes CORS issues)'
      };
    }

    // Fix 2: Try with simplified headers
    if (this.hasHeadersError(error)) {
      const simplifiedHeaders = this.simplifyHeaders(headers);
      return {
        shouldRetry: true,
        modifiedHeaders: simplifiedHeaders,
        message: 'Retrying with simplified headers'
      };
    }

    // Fix 3: Suggest proxy for development
    if (process.env.NODE_ENV === 'development' && this.config.proxy) {
      return {
        shouldRetry: true,
        useProxy: true,
        message: 'Using development proxy to bypass CORS'
      };
    }

    return { shouldRetry: false, message: '' };
  }

  /**
   * Check if error is CORS-related
   */
  private isCorsError(error: any): boolean {
    if (!error) return false;

    const message = error.message || error.toString() || '';
    return message.toLowerCase().includes('cors') ||
      message.toLowerCase().includes('cross-origin') ||
      message.toLowerCase().includes('access-control');
  }

  /**
   * Check if error is related to credentials
   */
  private hasCredentialsError(error: any): boolean {
    const message = error.message || '';
    return message.includes('credentials') || message.includes('withCredentials');
  }

  /**
   * Check if error is related to headers
   */
  private hasHeadersError(error: any): boolean {
    const message = error.message || '';
    return message.includes('header') || message.includes('preflight');
  }

  /**
   * Simplify headers to reduce CORS issues
   */
  private simplifyHeaders(headers: Record<string, string>): Record<string, string> {
    const simplified: Record<string, string> = {};

    // Keep only essential headers
    const essentialHeaders = ['Content-Type', 'Authorization', 'Accept'];

    Object.entries(headers).forEach(([key, value]) => {
      if (essentialHeaders.includes(key) || key.toLowerCase().startsWith('x-')) {
        simplified[key] = value;
      }
    });

    return simplified;
  }

  /**
   * Get user-friendly CORS error message
   */
  private getUserFriendlyCorsMessage(error: any, url: string): string {
    const urlObj = this.parseUrl(url);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'your app';

    if (process.env.NODE_ENV === 'development') {
      return `
🚨 CORS Error in Development

Your request to ${urlObj.host} was blocked by CORS policy.

Quick fixes to try:
1. If you control the API server: Add ${origin} to allowed origins
2. For development: Use a proxy or disable CORS checks in browser
3. Check if the API server is running and accessible

Common solutions:
- Add CORS middleware to your API server
- Use a development proxy (like http-proxy-middleware)
- Temporarily disable CORS in browser dev tools (not recommended for production)
      `.trim();
    }

    return `
🚨 Connection Blocked

Unable to connect to ${urlObj.host}. This is usually a server configuration issue.

Please contact the website administrator or try again later.
    `.trim();
  }

  /**
   * Parse URL safely
   */
  private parseUrl(url: string): { host: string; protocol: string } {
    try {
      const urlObj = new URL(url);
      return { host: urlObj.host, protocol: urlObj.protocol };
    } catch {
      return { host: url, protocol: 'unknown' };
    }
  }

  /**
   * Validate CORS configuration
   */
  validateConfig(): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (this.config.enabled) {
      // Check 1: Credentials with wildcard origin
      if (this.config.credentials) {
        const origin = this.config.origin;
        if (!origin || origin === '*') {
          errors.push('Security Risk: Cannot use "credentials: true" with wildcard origin "*". Please specify an exact origin (e.g., "http://localhost:3000").');
        }
      }

      // Check 2: Proxy configuration
      if (!this.config.proxy && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        warnings.push('Development Warning: "corsHelper" is enabled but no "proxy" URL is configured. The library will default to "/api/minder-proxy", but you must ensure this route exists.');
      }

      // Check 3: Methods
      if (this.config.methods && !this.config.methods.includes(HttpMethod.OPTIONS)) {
        warnings.push('Missing OPTIONS method: CORS preflight requests require the OPTIONS method to be allowed.');
      }
    }

    return { isValid: errors.length === 0, warnings, errors };
  }
}

/**
 * Validate CORS configuration helper
 */
export function validateCorsConfig(config: CorsConfig): { isValid: boolean; warnings: string[]; errors: string[] } {
  return new CorsManager(config).validateConfig();
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
  const corsHandling = await corsManager.handleCorsError(
    error,
    originalRequest.url,
    originalRequest.method,
    originalRequest.headers
  );

  if (corsHandling.shouldRetry) {
    if (corsHandling.modifiedHeaders) {
      return {
        shouldRetry: true,
        modifiedRequest: {
          ...originalRequest,
          headers: corsHandling.modifiedHeaders
        }
      };
    }

    if (corsHandling.useProxy) {
      return { shouldRetry: true, useProxy: true };
    }
  }

  // Show user-friendly message if available
  if (corsHandling.userFriendlyMessage) {
    console.warn(corsHandling.userFriendlyMessage);
  }

  // If no automatic fix worked, create a user-friendly error
  const corsError = new MinderNetworkError(
    'Request blocked by CORS policy. Check the browser console for detailed guidance.',
    0,
    error,
    originalRequest.url,
    originalRequest.method,
    'CORS_ERROR'
  );

  return {
    shouldRetry: false,
    error: corsError
  };
}