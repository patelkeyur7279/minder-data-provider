/**
 * Security Features Test Suite
 * Tests for CSRF protection, XSS sanitization, rate limiting, and input validation
 */

import {
  generateSecureCSRFToken,
  CSRFTokenManager,
  XSSSanitizer,
  RateLimiter,
  InputValidator,
  getSecurityHeaders,
} from '../src/utils/security';

describe('Security Utilities', () => {
  // ============================================================================
  // CSRF Token Generation
  // ============================================================================
  
  describe('generateSecureCSRFToken', () => {
    it('should generate token of specified length', () => {
      const token = generateSecureCSRFToken(32);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', () => {
      const token1 = generateSecureCSRFToken();
      const token2 = generateSecureCSRFToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate hexadecimal strings', () => {
      const token = generateSecureCSRFToken(16);
      expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
    });
  });

  // ============================================================================
  // CSRF Token Manager
  // ============================================================================
  
  describe('CSRFTokenManager', () => {
    let manager: CSRFTokenManager;

    beforeEach(() => {
      manager = new CSRFTokenManager();
      // Clear sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    });

    it('should generate and store token', () => {
      const token = manager.getToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should return same token on subsequent calls', () => {
      const token1 = manager.getToken();
      const token2 = manager.getToken();
      expect(token1).toBe(token2);
    });

    it('should allow setting custom token', () => {
      const customToken = 'custom-csrf-token-123';
      manager.setToken(customToken);
      expect(manager.getToken()).toBe(customToken);
    });

    it('should clear token', () => {
      const token1 = manager.getToken();
      manager.clearToken();
      const token2 = manager.getToken();
      expect(token1).not.toBe(token2);
    });
  });

  // ============================================================================
  // XSS Sanitization
  // ============================================================================
  
  describe('XSSSanitizer', () => {
    let sanitizer: XSSSanitizer;

    beforeEach(() => {
      sanitizer = new XSSSanitizer();
    });

    it('should sanitize script tags', () => {
      const dirty = '<script>alert("XSS")</script>Hello';
      const clean = sanitizer.sanitize(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    it('should sanitize iframe tags', () => {
      const dirty = '<iframe src="evil.com"></iframe>Content';
      const clean = sanitizer.sanitize(dirty);
      expect(clean).not.toContain('<iframe>');
    });

    it('should sanitize javascript: protocol', () => {
      const dirty = '<a href="javascript:alert(1)">Click</a>';
      const clean = sanitizer.sanitize(dirty);
      expect(clean).not.toContain('javascript:');
    });

    it('should sanitize event handlers', () => {
      const dirty = '<div onclick="alert(1)">Click me</div>';
      const clean = sanitizer.sanitize(dirty);
      expect(clean).not.toContain('onclick=');
    });

    it('should sanitize objects recursively', () => {
      const dirty = {
        name: '<script>alert("XSS")</script>John',
        bio: 'Hello <iframe src="evil.com"></iframe>',
        nested: {
          value: '<script>bad</script>text',
        },
      };
      const clean = sanitizer.sanitize(dirty);
      expect(clean.name).not.toContain('<script>');
      expect(clean.bio).not.toContain('<iframe>');
      expect(clean.nested.value).not.toContain('<script>');
    });

    it('should sanitize arrays', () => {
      const dirty = [
        '<script>alert(1)</script>',
        'Safe text',
        '<iframe src="evil.com"></iframe>',
      ];
      const clean = sanitizer.sanitize(dirty);
      expect(clean[0]).not.toContain('<script>');
      expect(clean[1]).toBe('Safe text');
      expect(clean[2]).not.toContain('<iframe>');
    });

    it('should preserve safe content', () => {
      const safe = 'This is <b>bold</b> and <i>italic</i> text';
      const clean = sanitizer.sanitize(safe);
      expect(clean).toContain('bold');
      expect(clean).toContain('italic');
    });
  });

  // ============================================================================
  // Rate Limiter
  // ============================================================================
  
  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter('memory');
    });

    it('should allow requests within limit', () => {
      const key = 'test-endpoint';
      const maxRequests = 5;
      const windowMs = 1000;

      for (let i = 0; i < maxRequests; i++) {
        expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      const key = 'test-endpoint';
      const maxRequests = 3;
      const windowMs = 1000;

      // Make 3 requests (should all pass)
      for (let i = 0; i < maxRequests; i++) {
        expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);
      }

      // 4th request should be blocked
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(false);
    });

    it('should reset after time window', async () => {
      const key = 'test-endpoint';
      const maxRequests = 2;
      const windowMs = 100; // 100ms window

      // Make 2 requests
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);

      // Should be blocked
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow requests again
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);
    });

    it('should handle different keys independently', () => {
      const maxRequests = 2;
      const windowMs = 1000;

      expect(rateLimiter.check('endpoint1', maxRequests, windowMs)).toBe(true);
      expect(rateLimiter.check('endpoint2', maxRequests, windowMs)).toBe(true);
      expect(rateLimiter.check('endpoint1', maxRequests, windowMs)).toBe(true);
      expect(rateLimiter.check('endpoint2', maxRequests, windowMs)).toBe(true);

      // Both should be blocked independently
      expect(rateLimiter.check('endpoint1', maxRequests, windowMs)).toBe(false);
      expect(rateLimiter.check('endpoint2', maxRequests, windowMs)).toBe(false);
    });

    it('should reset specific key', () => {
      const key = 'test-endpoint';
      const maxRequests = 2;
      const windowMs = 1000;

      // Exhaust limit
      rateLimiter.check(key, maxRequests, windowMs);
      rateLimiter.check(key, maxRequests, windowMs);
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(false);

      // Reset
      rateLimiter.reset(key);

      // Should allow requests again
      expect(rateLimiter.check(key, maxRequests, windowMs)).toBe(true);
    });

    it('should cleanup old entries', () => {
      rateLimiter.check('key1', 10, 1000);
      rateLimiter.check('key2', 10, 1000);
      
      rateLimiter.cleanup();
      
      // Should still work after cleanup
      expect(rateLimiter.check('key1', 10, 1000)).toBe(true);
    });
  });

  // ============================================================================
  // Input Validation
  // ============================================================================
  
  describe('InputValidator', () => {
    describe('isValidEmail', () => {
      it('should validate correct email addresses', () => {
        expect(InputValidator.isValidEmail('user@example.com')).toBe(true);
        expect(InputValidator.isValidEmail('test.user@domain.co.uk')).toBe(true);
        expect(InputValidator.isValidEmail('user+tag@example.com')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(InputValidator.isValidEmail('invalid')).toBe(false);
        expect(InputValidator.isValidEmail('invalid@')).toBe(false);
        expect(InputValidator.isValidEmail('@example.com')).toBe(false);
        expect(InputValidator.isValidEmail('user@')).toBe(false);
      });
    });

    describe('isValidURL', () => {
      it('should validate correct URLs', () => {
        expect(InputValidator.isValidURL('https://example.com')).toBe(true);
        expect(InputValidator.isValidURL('http://localhost:3000')).toBe(true);
        expect(InputValidator.isValidURL('https://sub.domain.com/path')).toBe(true);
      });

      it('should reject invalid URLs', () => {
        expect(InputValidator.isValidURL('not-a-url')).toBe(false);
        expect(InputValidator.isValidURL('//missing-protocol')).toBe(false);
        expect(InputValidator.isValidURL('')).toBe(false);
      });
    });

    describe('sanitizeFilename', () => {
      it('should remove dangerous characters', () => {
        const result = InputValidator.sanitizeFilename('../../../etc/passwd');
        expect(result).not.toContain('..');
        expect(result).not.toContain('/');
      });

      it('should preserve safe characters', () => {
        const result = InputValidator.sanitizeFilename('my-file_name.txt');
        expect(result).toContain('my-file_name.txt');
      });

      it('should limit length', () => {
        const longName = 'a'.repeat(300);
        const result = InputValidator.sanitizeFilename(longName);
        expect(result.length).toBeLessThanOrEqual(255);
      });
    });

    describe('isValidJSON', () => {
      it('should validate correct JSON', () => {
        expect(InputValidator.isValidJSON('{"key": "value"}')).toBe(true);
        expect(InputValidator.isValidJSON('[1, 2, 3]')).toBe(true);
        expect(InputValidator.isValidJSON('null')).toBe(true);
      });

      it('should reject invalid JSON', () => {
        expect(InputValidator.isValidJSON('not json')).toBe(false);
        expect(InputValidator.isValidJSON('{key: value}')).toBe(false);
        expect(InputValidator.isValidJSON("{'invalid': quotes}")).toBe(false);
      });
    });

    describe('hasSQLInjectionPattern', () => {
      it('should detect SQL injection patterns', () => {
        expect(InputValidator.hasSQLInjectionPattern("' OR '1'='1")).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('UNION SELECT * FROM users')).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('DROP TABLE users')).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('DELETE FROM users')).toBe(true);
      });

      it('should not flag safe content', () => {
        expect(InputValidator.hasSQLInjectionPattern('Normal user input')).toBe(false);
        expect(InputValidator.hasSQLInjectionPattern('SELECT is fine')).toBe(false);
      });
    });

    describe('validateLength', () => {
      it('should validate string length', () => {
        expect(InputValidator.validateLength('hello', 10, 2)).toBe(true);
        expect(InputValidator.validateLength('hi', 10, 2)).toBe(true);
        expect(InputValidator.validateLength('a', 10, 2)).toBe(false);
        expect(InputValidator.validateLength('a'.repeat(11), 10, 2)).toBe(false);
      });
    });

    describe('validateRange', () => {
      it('should validate numeric range', () => {
        expect(InputValidator.validateRange(5, 1, 10)).toBe(true);
        expect(InputValidator.validateRange(1, 1, 10)).toBe(true);
        expect(InputValidator.validateRange(10, 1, 10)).toBe(true);
        expect(InputValidator.validateRange(0, 1, 10)).toBe(false);
        expect(InputValidator.validateRange(11, 1, 10)).toBe(false);
      });
    });
  });

  // ============================================================================
  // Security Headers
  // ============================================================================
  
  describe('getSecurityHeaders', () => {
    it('should return default security headers', () => {
      const headers = getSecurityHeaders();
      
      expect(headers['Content-Security-Policy']).toBeDefined();
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Strict-Transport-Security']).toBeDefined();
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should allow custom CSP', () => {
      const headers = getSecurityHeaders({
        contentSecurityPolicy: "default-src 'none'",
      });
      
      expect(headers['Content-Security-Policy']).toBe("default-src 'none'");
    });

    it('should allow custom X-Frame-Options', () => {
      const headers = getSecurityHeaders({
        xFrameOptions: 'SAMEORIGIN',
      });
      
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    });

    it('should allow disabling X-Content-Type-Options', () => {
      const headers = getSecurityHeaders({
        xContentTypeOptions: false,
      });
      
      expect(headers['X-Content-Type-Options']).toBeUndefined();
    });

    it('should allow custom HSTS', () => {
      const headers = getSecurityHeaders({
        strictTransportSecurity: 'max-age=63072000',
      });
      
      expect(headers['Strict-Transport-Security']).toBe('max-age=63072000');
    });
  });
});
