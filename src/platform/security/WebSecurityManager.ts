/**
 * WebSecurityManager - Web and Next.js security implementation
 * 
 * Implements XSS, CSRF, CORS, and CSP protection for web platforms.
 * 
 * @module WebSecurityManager
 */

import {
  SecurityManager,
  SecurityConfig,
  SecurityValidation,
} from './SecurityManager.js';

/**
 * Web Security Manager
 */
export class WebSecurityManager extends SecurityManager {
  private csrfToken: string | null = null;
  private initialized = false;

  constructor(config: SecurityConfig = {}) {
    super(config);
  }

  /**
   * Initialize web security features
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Generate CSRF token
    if (this.config.csrfProtection) {
      this.csrfToken = this.generateCSRFToken();
      this.storeCSRFToken(this.csrfToken);
    }

    // Set up CSP if enabled
    if (this.config.csp) {
      this.setupCSP();
    }

    // Set up XSS protection headers
    if (this.config.xssProtection) {
      this.setupXSSProtection();
    }

    this.initialized = true;
  }

  /**
   * Get security headers for HTTP requests
   */
  getSecurityHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.customHeaders,
    };

    // XSS Protection
    if (this.config.xssProtection) {
      headers['X-XSS-Protection'] = '1; mode=block';
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'DENY';
    }

    // CSP
    if (this.config.csp) {
      headers['Content-Security-Policy'] = this.buildCSPHeader();
    }

    // CSRF Token
    if (this.config.csrfProtection && this.csrfToken) {
      headers[this.config.csrfTokenHeader] = this.csrfToken;
    }

    // CORS
    if (this.config.corsProtection && this.config.allowedOrigins.length > 0) {
      // Note: CORS headers are typically set on the server side
      // This is for client-side reference
      headers['X-Allowed-Origins'] = this.config.allowedOrigins.join(',');
    }

    // HSTS (HTTP Strict Transport Security)
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

    // Referrer Policy
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

    // Permissions Policy
    headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';

    return headers;
  }

  /**
   * Validate request security
   */
  validateRequest(request: {
    method?: string;
    headers?: Record<string, string>;
    origin?: string;
    body?: any;
  }): SecurityValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate CSRF token for state-changing requests
    if (this.config.csrfProtection) {
      const method = request.method?.toUpperCase();
      if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const token = request.headers?.[this.config.csrfTokenHeader];
        if (!token) {
          errors.push('Missing CSRF token');
        } else if (!this.validateCSRFToken(token, this.csrfToken || '')) {
          errors.push('Invalid CSRF token');
        }
      }
    }

    // Validate origin
    if (this.config.corsProtection && request.origin) {
      if (!this.validateOrigin(request.origin)) {
        errors.push(`Origin ${request.origin} is not allowed`);
      }
    }

    // Validate and sanitize body
    if (this.config.sanitizeInput && request.body) {
      const result = this.sanitizeInput(request.body);
      if (result.removedKeys.length > 0) {
        warnings.push(`Removed dangerous keys: ${result.removedKeys.join(', ')}`);
      }
      if (result.modified) {
        warnings.push('Request body was modified during sanitization');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Store CSRF token in session storage
   */
  private storeCSRFToken(token: string): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('csrf-token', token);
    }
  }

  /**
   * Get stored CSRF token
   */
  getCSRFToken(): string | null {
    if (this.csrfToken) {
      return this.csrfToken;
    }

    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('csrf-token');
    }

    return null;
  }

  /**
   * Refresh CSRF token
   */
  refreshCSRFToken(): string {
    this.csrfToken = this.generateCSRFToken();
    this.storeCSRFToken(this.csrfToken);
    return this.csrfToken;
  }

  /**
   * Set up Content Security Policy
   */
  private setupCSP(): void {
    if (typeof document !== 'undefined') {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = this.buildCSPHeader();
      
      const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (existing) {
        existing.replaceWith(meta);
      } else {
        document.head.appendChild(meta);
      }
    }
  }

  /**
   * Set up XSS protection
   */
  private setupXSSProtection(): void {
    // XSS protection is primarily handled via headers
    // This method can be extended for additional client-side protection
  }

  /**
   * Sanitize URL to prevent open redirect attacks
   */
  sanitizeURL(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin);
      
      // Only allow http(s) protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return '/';
      }

      // Check if URL is on allowed origin
      if (this.config.allowedOrigins.length > 0) {
        const origin = `${parsed.protocol}//${parsed.host}`;
        if (!this.validateOrigin(origin)) {
          return '/';
        }
      }

      return url;
    } catch {
      // Invalid URL, return safe default
      return '/';
    }
  }

  /**
   * Create a safe form submission with CSRF protection
   */
  createSecureForm(action: string, method: string = 'POST'): HTMLFormElement {
    const form = document.createElement('form');
    form.action = this.sanitizeURL(action);
    form.method = method;

    // Add CSRF token as hidden input
    if (this.config.csrfProtection && this.csrfToken) {
      const csrfInput = document.createElement('input');
      csrfInput.type = 'hidden';
      csrfInput.name = this.config.csrfTokenHeader;
      csrfInput.value = this.csrfToken;
      form.appendChild(csrfInput);
    }

    return form;
  }

  /**
   * Validate and sanitize HTML content
   */
  sanitizeHTML(html: string): string {
    if (typeof DOMParser === 'undefined') {
      return this.sanitizeString(html);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove script tags
    doc.querySelectorAll('script').forEach(el => el.remove());

    // Remove event handlers
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });

      // Remove javascript: URLs
      ['href', 'src', 'action', 'formaction'].forEach(attrName => {
        const attrValue = el.getAttribute(attrName);
        if (attrValue && attrValue.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attrName);
        }
      });
    });

    return doc.body.innerHTML;
  }
}

/**
 * Create Web security manager
 */
export function createWebSecurity(config: SecurityConfig = {}): WebSecurityManager {
  return new WebSecurityManager(config);
}
