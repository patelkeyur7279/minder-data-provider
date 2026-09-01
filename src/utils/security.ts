/**
 * Security Utilities for minder-data-provider
 * Provides CSRF protection, XSS sanitization, input validation, and rate limiting
 */

import { Logger, LogLevel } from './Logger.js';
import type { SecurityConfig } from '../core/types.js';
import type { DOMPurify as DOMPurifyInstance } from 'dompurify';
import { MinderError } from '../errors/index.js';

const logger = /*#__PURE__*/ new Logger('SecurityUtils', { level: LogLevel.WARN });

// D4: DOMPurify stays a runtime `dependency` (owner decision — NOT a peer),
// but it must not sit in the static import graph of `core`/`hook`, which are
// marketed as minimal entries. Cached module-level promise mirrors the
// `loadAxios` pattern (and its documented `.default` type gap) in
// `src/core/minder.ts`: `Promise<unknown>` here, with the concrete
// `DOMPurifyInstance` cast applied only where the module is actually used.
let domPurifyPromise: Promise<unknown> | undefined;
function loadDOMPurify(): Promise<unknown> {
  domPurifyPromise ??= import('dompurify');
  return domPurifyPromise;
}

/**
 * Generate cryptographically secure CSRF token
 * Uses Web Crypto API for better randomness than Math.random()
 */
export function generateSecureCSRFToken(length: number = 32): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Browser environment with Web Crypto API
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else if (typeof global !== 'undefined' && global.crypto) {
    // Node.js environment

    const { randomBytes } = require('crypto');
    return randomBytes(length).toString('hex');
  } else {
    // Fallback (less secure, but better than Math.random())
    logger.warn('Crypto API not available, using fallback CSRF token generation');
    return Array.from({ length }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

/**
 * Store and retrieve CSRF token
 */
export class CSRFTokenManager {
  private static TOKEN_KEY = 'minder_csrf_token';
  private token: string | null = null;

  constructor(private cookieName?: string) { }

  getToken(): string {
    if (this.token) return this.token;

    // Try to get from cookie first
    if (typeof document !== 'undefined' && this.cookieName) {
      const cookieToken = this.getTokenFromCookie();
      if (cookieToken) {
        this.token = cookieToken;
        return cookieToken;
      }
    }

    // Try sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      const storedToken = sessionStorage.getItem(CSRFTokenManager.TOKEN_KEY);
      if (storedToken) {
        this.token = storedToken;
        return storedToken;
      }
    }

    // Generate new token
    const newToken = generateSecureCSRFToken();
    this.setToken(newToken);
    return newToken;
  }

  setToken(token: string): void {
    this.token = token;

    // Store in sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CSRFTokenManager.TOKEN_KEY, token);
    }

    // Store in cookie if configured
    if (typeof document !== 'undefined' && this.cookieName) {
      let secure = '';
      // We don't have direct access to full config here easily without passing it down, 
      // but we can default to auto-detect which is safe.
      // Ideally CSRFTokenManager should accept a config object.
      // For now, let's use auto-detect as a safe default for development/production parity.
      // For now, let's use auto-detect as a safe default for development/production parity.
      secure = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? '; Secure' : '';

      document.cookie = `${this.cookieName}=${token}; path=/; SameSite=Strict${secure}`;
    }
  }

  private getTokenFromCookie(): string | null {
    if (typeof document === 'undefined' || !this.cookieName) return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === this.cookieName && value) {
        return value;
      }
    }
    return null;
  }

  clearToken(): void {
    this.token = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CSRFTokenManager.TOKEN_KEY);
    }
    if (typeof document !== 'undefined' && this.cookieName) {
      document.cookie = `${this.cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

/**
 * H3 (ratified ADR, see FIX_PLAN.md §3): locally-widened sanitization config
 * — adds an opt-in `fields` allowlist on top of `SecurityConfig['sanitization']`
 * without requiring a change to that exported type. Structurally compatible:
 * every value already typed `SecurityConfig['sanitization']` satisfies this
 * type too, because `fields` is optional.
 */
export interface SanitizationOptions {
  enabled: boolean;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  /**
   * H3: explicit opt-in list of top-level field names to sanitize. Sanitizing
   * every string in a request body by default silently corrupted ordinary
   * user data — DOMPurify HTML-entity-encodes `&` and strips anything that
   * parses as a tag, and there is no DOMPurify configuration that leaves `&`
   * untouched. Without `fields`, `sanitize()` on an object is a no-op
   * pass-through; XSS defence belongs at render time, not on request bodies.
   */
  fields?: string[];
}

/**
 * Advanced XSS sanitization using DOMPurify.
 *
 * D4: DOMPurify loads lazily (see `loadDOMPurify` above). `sanitize()` stays
 * SYNCHRONOUS — its callers (`sanitizeRequestData`/`applyRequestBody` in
 * `apiClient/upload.ts`) are synchronous — so it cannot `await` the import
 * inline. Instead the constructor kicks the load off immediately, exposes
 * `ready()` for callers that can await it (ApiClient does, right before
 * sanitizing a request body), and `sanitize()` consults the already-resolved
 * result.
 *
 * FAIL CLOSED (H2, P2 invariant): `sanitize()` on a string THROWS
 * `SANITIZER_UNAVAILABLE` on every runtime where a usable DOMPurify instance
 * is not present — a browser where the import hasn't resolved yet or failed
 * to load, AND any non-browser runtime (`/node`, `/server`, Next.js SSR).
 * `dompurify` cannot sanitize without a DOM/`window` and this library carries
 * no jsdom dependency to fake one, so a non-browser runtime is *always*
 * "DOMPurify absent" here — construction never even attempts the import
 * outside a browser, matching the "unavailable" branch exactly. The
 * previously shipped weaker regex-based `basicSanitize()` fallback has been
 * removed: a security control that silently degrades instead of failing is
 * strictly worse than one that is visibly absent.
 *
 * OPT-IN PER FIELD (H3, ratified ADR §3): `sanitize()` on an object no longer
 * recursively walks every string field by default. Only fields named in the
 * `fields` allowlist (see `SanitizationOptions`) are sanitized; everything
 * else in the body passes through unchanged. `security.sanitization: true`
 * (or an object without `fields`) constructs a working sanitizer but applies
 * it to nothing automatically — call `sanitize()` on a specific string, or
 * configure `fields`, to actually use it.
 */
export class XSSSanitizer {
  private config: any;
  private domPurify?: DOMPurifyInstance;
  private readonly fields?: string[];
  private readonly readyPromise: Promise<void>;

  constructor(sanitizationConfig?: boolean | SanitizationOptions) {
    if (typeof sanitizationConfig === 'object' && sanitizationConfig.enabled) {
      this.config = {
        ALLOWED_TAGS: sanitizationConfig.allowedTags || [],
        ALLOWED_ATTR: sanitizationConfig.allowedAttributes || {},
      };
    } else {
      // Strict default configuration
      this.config = {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false,
      };
    }

    this.fields = typeof sanitizationConfig === 'object' ? sanitizationConfig.fields : undefined;

    // Only the browser path needs DOMPurify at all — don't trigger the
    // dynamic import from a server-side construction. `this.domPurify` stays
    // `undefined` server-side, which is exactly what makes `sanitize()` fail
    // closed there (see class doc above) instead of storing a non-browser
    // DOMPurify factory that can't actually sanitize anything.
    this.readyPromise = typeof window !== 'undefined'
      ? loadDOMPurify()
          .then((mod) => {
            // See the `Promise<unknown>` note on `loadDOMPurify` above: the
            // resolved module may be `.default`-wrapped (real Node ESM /
            // ts-jest's commonjs downlevel) or, defensively, the raw CJS
            // export value itself.
            this.domPurify =
              (mod as { default?: DOMPurifyInstance }).default ?? (mod as DOMPurifyInstance);
          })
          .catch((err) => {
            logger.error('Failed to load DOMPurify — sanitize() will throw SANITIZER_UNAVAILABLE until this is fixed', err);
          })
      : Promise.resolve();
  }

  /**
   * Resolves once the DOMPurify dynamic import has settled (success or
   * failure). No-op on the server. Callers that construct an XSSSanitizer and
   * can `await` before their first `sanitize()` call — like `ApiClient` —
   * should await this so a slow-but-successful import isn't mistaken for a
   * failed one.
   */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  sanitize(dirty: any): any {
    if (typeof dirty === 'string') {
      return this.sanitizeString(dirty);
    }

    if (typeof dirty === 'object' && dirty !== null) {
      // H3: opt-in per field, not a blanket recursive walk of every string
      // in the body (see class doc above). No `fields` configured => pass
      // the object through unchanged.
      if (!this.fields || this.fields.length === 0) {
        return dirty;
      }

      const sanitized: any = Array.isArray(dirty) ? [...dirty] : { ...dirty };
      for (const field of this.fields) {
        if (Object.prototype.hasOwnProperty.call(dirty, field)) {
          sanitized[field] = this.sanitizeDeep(dirty[field]);
        }
      }
      return sanitized;
    }

    return dirty;
  }

  /** Recursively sanitize every string within an opted-in field's subtree. */
  private sanitizeDeep(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    if (typeof value === 'object' && value !== null) {
      const result: any = Array.isArray(value) ? [] : {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = this.sanitizeDeep(value[key]);
        }
      }
      return result;
    }
    return value;
  }

  private sanitizeString(dirty: string): string {
    if (this.domPurify) {
      // `this.config` is untyped (`any`), so DOMPurify's overloaded
      // `sanitize()` signature can resolve to a `TrustedHTML`-returning
      // overload; this class's contract (and every caller) is plain string
      // output, matching the config actually built above (no
      // RETURN_TRUSTED_TYPE / RETURN_DOM* options are ever set).
      return this.domPurify.sanitize(dirty, this.config) as unknown as string;
    }

    // Fail closed (H2): never silently degrade to a weaker regex sanitizer.
    // `this.domPurify` is unset for one of three reasons, all treated the
    // same — refuse to pass data through unsanitized:
    //  - browser, import hasn't resolved yet (caller didn't await `ready()`)
    //  - browser, import rejected (e.g. blocked by a strict CSP)
    //  - non-browser runtime (`/node`, `/server`, Next.js SSR) — DOMPurify
    //    requires a DOM/`window` this library does not fake with a jsdom
    //    dependency, so it is never even attempted here.
    throw new MinderError(
      'XSS sanitizer unavailable: the DOMPurify dynamic import has not resolved, failed to load, or this ' +
      'runtime has no DOM (dompurify requires a browser window; Node/SSR runtimes are not supported). ' +
      'Await sanitizer.ready() before sanitizing, and check for a CSP or network condition blocking the ' +
      'import of "dompurify" if running in a browser.',
      'SANITIZER_UNAVAILABLE',
      500
    );
  }
}

/**
 * Enhanced Rate Limiter with memory storage only
 * localStorage has been removed for security reasons
 */
export class RateLimiter {
  private memoryStore: Map<string, number[]> = new Map();
  private storageKey = 'minder_rate_limit';

  constructor() {
    this.cleanup();
  }

  check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.getRequests(key);

    // Filter out old requests outside the time window
    const validRequests = requests.filter(time => now - time < windowMs);

    if (validRequests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }

    // Add current request
    validRequests.push(now);
    this.setRequests(key, validRequests);

    return true; // Within rate limit
  }

  private getRequests(key: string): number[] {
    return this.memoryStore.get(key) || [];
  }

  private setRequests(key: string, requests: number[]): void {
    this.memoryStore.set(key, requests);
  }

  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Cleanup memory store
    for (const [key, requests] of this.memoryStore.entries()) {
      const validRequests = requests.filter(time => now - time < maxAge);
      if (validRequests.length === 0) {
        this.memoryStore.delete(key);
      } else {
        this.memoryStore.set(key, validRequests);
      }
    }
  }

  reset(key?: string): void {
    if (key) {
      this.memoryStore.delete(key);
    } else {
      this.memoryStore.clear();
    }
  }
}

/**
 * Input Validation Utilities
 */
export class InputValidator {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize filename to prevent path traversal
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }

  /**
   * Validate JSON structure
   */
  static isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect potential SQL injection patterns
   */
  static hasSQLInjectionPattern(input: string): boolean {
    const sqlPatterns = [
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\bDROP\b.*\bTABLE\b)/i,
      /(\bINSERT\b.*\bINTO\b)/i,
      /(\bDELETE\b.*\bFROM\b)/i,
      /(;.*--)/,
      /('.*OR.*'.*=.*')/i,
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Validate against maximum length
   */
  static validateLength(value: string, max: number, min: number = 0): boolean {
    return value.length >= min && value.length <= max;
  }

  /**
   * Validate numeric range
   */
  static validateRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }
}

/**
 * Security Headers Configuration
 *
 * IMPORTANT: These are HTTP **response** headers (Content-Security-Policy,
 * X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
 * X-XSS-Protection, Referrer-Policy, Permissions-Policy) meant for your
 * *server* to send back on its responses — they tell the browser how to
 * treat the page/response it just received.
 *
 * Do NOT attach the return value of this function to outgoing HTTP
 * *requests* (e.g. as default axios instance headers). Most of these header
 * names are not part of the CORS-safelisted request header set, so if they
 * are present on a request the browser is forced to perform a CORS
 * preflight (OPTIONS) round-trip before every cross-origin call, roughly
 * doubling request latency for no benefit (the server ignores security
 * response-header names sent as request headers).
 *
 * Use this helper only to build the header object your server-side
 * middleware/framework sends on responses.
 */
export function getSecurityHeaders(config?: SecurityConfig['headers'], strictCSP: boolean = false): Record<string, string> {
  const headers: Record<string, string> = {};

  // Content Security Policy
  if (config?.contentSecurityPolicy) {
    headers['Content-Security-Policy'] = config.contentSecurityPolicy;
  } else {
    if (strictCSP) {
      headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'";
    } else {
      headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
    }
  }

  // X-Frame-Options
  if (config?.xFrameOptions) {
    headers['X-Frame-Options'] = config.xFrameOptions;
  } else {
    headers['X-Frame-Options'] = 'DENY';
  }

  // X-Content-Type-Options
  if (config?.xContentTypeOptions !== false) {
    headers['X-Content-Type-Options'] = 'nosniff';
  }

  // Strict-Transport-Security (HSTS)
  if (config?.strictTransportSecurity) {
    headers['Strict-Transport-Security'] = config.strictTransportSecurity;
  } else {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  // Additional security headers
  headers['X-XSS-Protection'] = '1; mode=block';
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';

  // Merge any custom headers from config that weren't handled above
  if (config) {
    Object.entries(config).forEach(([key, value]) => {
      // Skip known configuration keys that are already handled
      if ([
        'contentSecurityPolicy',
        'xFrameOptions',
        'xContentTypeOptions',
        'strictTransportSecurity'
      ].includes(key)) {
        return;
      }

      // Add custom header if not already set
      if (!headers[key] && typeof value === 'string') {
        headers[key] = value;
      }
    });
  }

  return headers;
}
