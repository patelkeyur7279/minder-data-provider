/**
 * SecurityManager - Base class for platform-specific security implementations
 * 
 * Provides common security utilities and abstract methods for platform-specific security.
 * 
 * @module SecurityManager
 */

/**
 * Security configuration
 */
export interface SecurityConfig {
  /**
   * Enable XSS protection (Web/Next.js)
   */
  xssProtection?: boolean;

  /**
   * Enable CSRF protection (Web/Next.js)
   */
  csrfProtection?: boolean;

  /**
   * CSRF token header name
   */
  csrfTokenHeader?: string;

  /**
   * Enable CORS protection (Web/Next.js)
   */
  corsProtection?: boolean;

  /**
   * Allowed CORS origins
   */
  allowedOrigins?: string[];

  /**
   * Enable Content Security Policy (Web/Next.js/Electron)
   */
  csp?: boolean;

  /**
   * CSP directives
   */
  cspDirectives?: Record<string, string[]>;

  /**
   * Enable secure storage (Native/Expo)
   */
  secureStorage?: boolean;

  /**
   * Enable SSL/TLS certificate pinning (Native/Expo)
   */
  certificatePinning?: boolean;

  /**
   * Pinned certificate hashes
   */
  pinnedCertificates?: string[];

  /**
   * Enable sandboxing (Electron)
   */
  sandboxing?: boolean;

  /**
   * Enable context isolation (Electron)
   */
  contextIsolation?: boolean;

  /**
   * Enable input sanitization
   */
  sanitizeInput?: boolean;

  /**
   * Enable output encoding
   */
  encodeOutput?: boolean;

  /**
   * Custom security headers
   */
  customHeaders?: Record<string, string>;
}

/**
 * Security validation result
 */
export interface SecurityValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Sanitized data result
 */
export interface SanitizedData {
  original: any;
  sanitized: any;
  modified: boolean;
  removedKeys: string[];
}

/**
 * Abstract Security Manager
 */
export abstract class SecurityManager {
  protected config: Required<SecurityConfig>;

  constructor(config: SecurityConfig = {}) {
    this.config = {
      xssProtection: true,
      csrfProtection: true,
      csrfTokenHeader: 'X-CSRF-Token',
      corsProtection: true,
      allowedOrigins: [],
      csp: true,
      cspDirectives: this.getDefaultCSPDirectives(),
      secureStorage: true,
      certificatePinning: false,
      pinnedCertificates: [],
      sandboxing: true,
      contextIsolation: true,
      sanitizeInput: true,
      encodeOutput: true,
      customHeaders: {},
      ...config,
    };
  }

  /**
   * Initialize security features
   */
  abstract initialize(): Promise<void>;

  /**
   * Get security headers for HTTP requests
   */
  abstract getSecurityHeaders(): Record<string, string>;

  /**
   * Validate request security
   */
  abstract validateRequest(request: any): SecurityValidation;

  /**
   * Sanitize input data
   */
  sanitizeInput(data: any): SanitizedData {
    if (typeof data !== 'object' || data === null) {
      return {
        original: data,
        sanitized: this.sanitizeValue(data),
        modified: data !== this.sanitizeValue(data),
        removedKeys: [],
      };
    }

    const sanitized: any = Array.isArray(data) ? [] : {};
    const removedKeys: string[] = [];
    let modified = false;

    for (const [key, value] of Object.entries(data)) {
      // Check for dangerous keys
      if (this.isDangerousKey(key)) {
        removedKeys.push(key);
        modified = true;
        continue;
      }

      const sanitizedValue = this.sanitizeValue(value);
      sanitized[key] = sanitizedValue;

      if (sanitizedValue !== value) {
        modified = true;
      }
    }

    return {
      original: data,
      sanitized,
      modified,
      removedKeys,
    };
  }

  /**
   * Sanitize a single value
   */
  protected sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (typeof value === 'object' && value !== null) {
      return this.sanitizeInput(value).sanitized;
    }

    return value;
  }

  /**
   * Sanitize string value (XSS protection)
   */
  protected sanitizeString(str: string): string {
    if (!this.config.sanitizeInput) {
      return str;
    }

    // Remove HTML tags
    let sanitized = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed[^>]*>/gi, '');
    sanitized = sanitized.replace(/<link[^>]*>/gi, '');

    // Remove javascript: and data: URLs
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:text\/html/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

    return sanitized;
  }

  /**
   * Encode output for safe display (XSS protection)
   */
  encodeOutput(value: any): string {
    if (!this.config.encodeOutput) {
      return String(value);
    }

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Check if a key is potentially dangerous
   */
  protected isDangerousKey(key: string): boolean {
    const dangerousKeys = [
      '__proto__',
      'constructor',
      'prototype',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ];

    return dangerousKeys.includes(key);
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(): string {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(token: string, expectedToken: string): boolean {
    if (!this.config.csrfProtection) {
      return true;
    }

    // Constant-time comparison to prevent timing attacks
    if (token.length !== expectedToken.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < token.length; i++) {
      result |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Get default CSP directives
   */
  protected getDefaultCSPDirectives(): Record<string, string[]> {
    return {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    };
  }

  /**
   * Build CSP header value
   */
  buildCSPHeader(): string {
    const directives = this.config.cspDirectives;
    return Object.entries(directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
  }

  /**
   * Validate origin against allowed origins
   */
  validateOrigin(origin: string): boolean {
    if (!this.config.corsProtection) {
      return true;
    }

    if (this.config.allowedOrigins.length === 0) {
      return true;
    }

    return this.config.allowedOrigins.some(allowed => {
      if (allowed === '*') {
        return true;
      }
      if (allowed.startsWith('*.')) {
        const domain = allowed.slice(2);
        return origin.endsWith(domain);
      }
      return origin === allowed;
    });
  }

  /**
   * Hash string using SHA-256 (for certificate pinning)
   */
  protected async hashString(str: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: simple hash for environments without crypto.subtle
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get security configuration
   */
  getConfig(): Required<SecurityConfig> {
    return { ...this.config };
  }

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
