/**
 * Security Utilities for minder-data-provider
 * Provides CSRF protection, XSS sanitization, input validation, and rate limiting
 */

import { Logger, LogLevel } from './Logger.js';
import DOMPurify from 'dompurify';
import type { SecurityConfig } from '../core/types.js';

const logger = new Logger('SecurityUtils', { level: LogLevel.WARN });

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

  constructor(private cookieName?: string) {}

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
      document.cookie = `${this.cookieName}=${token}; path=/; SameSite=Strict; Secure`;
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
 * Advanced XSS sanitization using DOMPurify
 */
export class XSSSanitizer {
  private config: any;

  constructor(sanitizationConfig?: SecurityConfig['sanitization']) {
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
  }

  sanitize(dirty: any): any {
    if (typeof dirty === 'string') {
      // Use DOMPurify if available (browser environment)
      if (typeof window !== 'undefined' && DOMPurify) {
        return DOMPurify.sanitize(dirty, this.config);
      }
      
      // Fallback: basic sanitization for Node.js environments
      return this.basicSanitize(dirty);
    }

    if (typeof dirty === 'object' && dirty !== null) {
      const sanitized: any = Array.isArray(dirty) ? [] : {};
      for (const key in dirty) {
        if (Object.prototype.hasOwnProperty.call(dirty, key)) {
          sanitized[key] = this.sanitize(dirty[key]);
        }
      }
      return sanitized;
    }

    return dirty;
  }

  private basicSanitize(str: string): string {
    return str
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/data:text\/html/gi, '')
      .replace(/vbscript:/gi, '');
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
 */
export function getSecurityHeaders(config?: SecurityConfig['headers']): Record<string, string> {
  const headers: Record<string, string> = {};

  // Content Security Policy
  if (config?.contentSecurityPolicy) {
    headers['Content-Security-Policy'] = config.contentSecurityPolicy;
  } else {
    headers['Content-Security-Policy'] = 
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
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

  return headers;
}
