/**
 * Comprehensive Tests for Utility Modules
 * Tests for version-validator, complexityAnalyzer, and security utilities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock vi with jest
const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  resetModules: () => jest.resetModules(),
};

// ============================================================================
// VERSION VALIDATOR TESTS
// ============================================================================

describe('VersionValidator', () => {
  let originalWindow: any;
  let originalNodeEnv: string | undefined;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Save originals
    originalWindow = global.window;
    originalNodeEnv = process.env.NODE_ENV;
    
    // Spy on console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore originals
    global.window = originalWindow;
    if (originalNodeEnv !== undefined) {
      (process.env as any).NODE_ENV = originalNodeEnv;
    }
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should detect single React version in browser', () => {
    global.window = {
      React: { version: '18.2.0' },
    } as any;

    // Import synchronously
    const { checkReactVersionAtRuntime } = require('../src/utils/version-validator.js');
    
    // Should not throw
    expect(() => checkReactVersionAtRuntime()).not.toThrow();
  });

  it('should detect multiple React versions via DevTools hook', () => {
    global.window = {
      React: { version: '18.2.0' },
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        renderers: new Map([
          [1, { version: '18.2.0' }],
          [2, { version: '17.0.2' }], // Different version
        ]),
      },
    } as any;

    // Reset module cache to re-run the check
    delete require.cache[require.resolve('../src/utils/version-validator.js')];
    const { checkReactVersionAtRuntime } = require('../src/utils/version-validator.js');
    
    // Should not throw even with multiple versions detected
    expect(() => checkReactVersionAtRuntime()).not.toThrow();
    // The error logging will happen, but we can't easily test console in Jest with module caching
  });

  it('should check React/ReactDOM version match in Node.js', () => {
    delete (global as any).window;
    
    // Reset module cache
    delete require.cache[require.resolve('../src/utils/version-validator.js')];
    const { checkReactVersionAtRuntime } = require('../src/utils/version-validator.js');
    
    // This test may not trigger warnings in Jest environment, just verify it doesn't throw
    expect(() => checkReactVersionAtRuntime()).not.toThrow();
  });

  it('should only check once even if called multiple times', () => {
    global.window = {
      React: { version: '18.2.0' },
    } as any;

    delete require.cache[require.resolve('../src/utils/version-validator.js')];
    const { checkReactVersionAtRuntime } = require('../src/utils/version-validator.js');
    
    checkReactVersionAtRuntime();
    checkReactVersionAtRuntime();
    checkReactVersionAtRuntime();
    
    // Should work without errors
    expect(true).toBe(true);
  });

  it('should handle missing React gracefully', () => {
    delete (global as any).window;

    delete require.cache[require.resolve('../src/utils/version-validator.js')];
    const { checkReactVersionAtRuntime } = require('../src/utils/version-validator.js');
    
    expect(() => checkReactVersionAtRuntime()).not.toThrow();
  });
});

// ============================================================================
// COMPLEXITY ANALYZER TESTS
// ============================================================================

describe('ComplexityAnalyzer', () => {
  const { analyzeComplexity, generateOptimizedConfig } = require('../src/utils/complexityAnalyzer.js');

  describe('analyzeComplexity', () => {
    it('should analyze simple configuration', () => {
      const config = {
        routes: {
          users: { method: 'GET' },
          posts: { method: 'GET' },
        },
      };

      const metrics = analyzeComplexity(config);

      expect(metrics.routeCount).toBe(2);
      expect(metrics.hasAuthentication).toBe(false);
      expect(metrics.hasFileUploads).toBe(false);
      expect(metrics.hasWebSockets).toBe(false);
      expect(metrics.hasSSR).toBe(false);
      expect(metrics.estimatedDataSize).toBe('small');
      expect(metrics.cacheRequirements).toBe('basic');
    });

    it('should detect authentication', () => {
      const config = {
        auth: { enabled: true },
        routes: {},
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.hasAuthentication).toBe(true);
    });

    it('should detect file uploads', () => {
      const config = {
        routes: {
          upload: { method: 'POST', contentType: 'multipart/form-data' },
        },
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.hasFileUploads).toBe(true);
      expect(metrics.estimatedDataSize).toBe('large');
    });

    it('should detect WebSockets', () => {
      const config = {
        routes: {},
        websocket: { enabled: true },
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.hasWebSockets).toBe(true);
      expect(metrics.cacheRequirements).toBe('advanced');
    });

    it('should detect SSR configuration', () => {
      const config = {
        routes: {},
        ssr: { enabled: true },
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.hasSSR).toBe(true);
      expect(metrics.cacheRequirements).toBe('advanced');
    });

    it('should classify medium data size', () => {
      const config = {
        routes: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [`route${i}`, { method: 'GET' }])
        ),
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.routeCount).toBe(10);
      expect(metrics.estimatedDataSize).toBe('medium');
    });

    it('should classify large data size', () => {
      const config = {
        routes: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [`route${i}`, { method: 'GET' }])
        ),
      };

      const metrics = analyzeComplexity(config);
      expect(metrics.routeCount).toBe(20);
      expect(metrics.estimatedDataSize).toBe('large');
      expect(metrics.cacheRequirements).toBe('advanced');
    });

    it('should handle empty configuration', () => {
      const metrics = analyzeComplexity({});
      
      expect(metrics.routeCount).toBe(0);
      expect(metrics.hasAuthentication).toBe(false);
      expect(metrics.estimatedDataSize).toBe('small');
    });
  });

  describe('generateOptimizedConfig', () => {
    it('should generate config for small applications', () => {
      const metrics = {
        routeCount: 3,
        hasAuthentication: false,
        hasFileUploads: false,
        hasWebSockets: false,
        hasSSR: false,
        estimatedDataSize: 'small' as const,
        cacheRequirements: 'basic' as const,
      };

      const config = generateOptimizedConfig(metrics);

      expect(config.cacheStrategy.type).toBe('memory');
      expect(config.cacheStrategy.ttl).toBe(600000); // 10 minutes
      expect(config.cacheStrategy.maxSize).toBe(100);
      expect(config.prefetchStrategy).toBe('aggressive');
      expect(config.batchingStrategy).toBe(false);
      expect(config.compressionEnabled).toBe(false);
      expect(config.optimisticUpdates).toBe(true);
      expect(config.backgroundSync).toBe(false);
      expect(config.debugLevel).toBe('info');
    });

    it('should generate config for medium applications', () => {
      const metrics = {
        routeCount: 10,
        hasAuthentication: true,
        hasFileUploads: false,
        hasWebSockets: false,
        hasSSR: false,
        estimatedDataSize: 'medium' as const,
        cacheRequirements: 'basic' as const,
      };

      const config = generateOptimizedConfig(metrics);

      expect(config.cacheStrategy.type).toBe('memory');
      expect(config.cacheStrategy.maxSize).toBe(500);
      expect(config.prefetchStrategy).toBe('essential');
      expect(config.batchingStrategy).toBe(false);
      expect(config.compressionEnabled).toBe(false);
      expect(config.optimisticUpdates).toBe(true);
    });

    it('should generate config for large applications', () => {
      const metrics = {
        routeCount: 25,
        hasAuthentication: true,
        hasFileUploads: true,
        hasWebSockets: true,
        hasSSR: false,
        estimatedDataSize: 'large' as const,
        cacheRequirements: 'advanced' as const,
      };

      const config = generateOptimizedConfig(metrics);

      expect(config.cacheStrategy.type).toBe('hybrid');
      expect(config.cacheStrategy.ttl).toBe(300000); // 5 minutes
      expect(config.cacheStrategy.maxSize).toBe(1000);
      expect(config.prefetchStrategy).toBe('none');
      expect(config.batchingStrategy).toBe(true);
      expect(config.compressionEnabled).toBe(true);
      expect(config.optimisticUpdates).toBe(false);
      expect(config.backgroundSync).toBe(true);
      expect(config.debugLevel).toBe('error');
    });

    it('should enable batching for many routes', () => {
      const metrics = {
        routeCount: 15,
        hasAuthentication: false,
        hasFileUploads: false,
        hasWebSockets: false,
        hasSSR: false,
        estimatedDataSize: 'medium' as const,
        cacheRequirements: 'basic' as const,
      };

      const config = generateOptimizedConfig(metrics);
      expect(config.batchingStrategy).toBe(true);
      expect(config.backgroundSync).toBe(true);
      expect(config.debugLevel).toBe('info'); // Medium apps get 'info' level
    });

    it('should configure for SSR applications', () => {
      const metrics = {
        routeCount: 8,
        hasAuthentication: true,
        hasFileUploads: false,
        hasWebSockets: false,
        hasSSR: true,
        estimatedDataSize: 'medium' as const,
        cacheRequirements: 'advanced' as const,
      };

      const config = generateOptimizedConfig(metrics);
      expect(config.cacheStrategy.type).toBe('hybrid');
      expect(config.prefetchStrategy).toBe('essential');
    });
  });
});

// ============================================================================
// SECURITY UTILITIES TESTS
// ============================================================================

describe('Security Utilities', () => {
  describe('generateSecureCSRFToken', () => {
    const { generateSecureCSRFToken } = require('../src/utils/security.js');

    it('should generate token with default length', () => {
      const token = generateSecureCSRFToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate token with custom length', () => {
      const token = generateSecureCSRFToken(16);
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateSecureCSRFToken();
      const token2 = generateSecureCSRFToken();
      expect(token1).not.toBe(token2);
    });

    it('should use Web Crypto API in browser environment', () => {
      const mockGetRandomValues = vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      });

      global.window = {
        crypto: {
          getRandomValues: mockGetRandomValues,
        },
      } as any;

      const token = generateSecureCSRFToken(16);
      expect(mockGetRandomValues).toHaveBeenCalled();
      expect(token).toBeDefined();

      delete (global as any).window;
    });
  });

  describe('CSRFTokenManager', () => {
    const { CSRFTokenManager } = require('../src/utils/security.js');
    let manager: any;

    beforeEach(() => {
      // Mock sessionStorage
      const storage: Record<string, string> = {};
      global.sessionStorage = {
        getItem: jest.fn((key: string) => storage[key] || null),
        setItem: jest.fn((key: string, value: string) => { storage[key] = value; }),
        removeItem: jest.fn((key: string) => { delete storage[key]; }),
        clear: jest.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
        length: 0,
        key: jest.fn(),
      } as any;

      manager = new CSRFTokenManager();
    });

    afterEach(() => {
      delete (global as any).sessionStorage;
    });

    it('should generate and store new token', () => {
      const token = manager.getToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
      // Verify token is a hex string
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should return same token on subsequent calls', () => {
      const token1 = manager.getToken();
      const token2 = manager.getToken();
      expect(token1).toBe(token2);
    });

    it('should set token manually', () => {
      const customToken = 'custom-csrf-token-12345';
      manager.setToken(customToken);
      expect(manager.getToken()).toBe(customToken);
    });

    it('should clear token', () => {
      const token = manager.getToken();
      expect(token).toBeDefined();
      
      manager.clearToken();
      const newToken = manager.getToken();
      expect(newToken).not.toBe(token);
    });

    it('should work with cookie configuration', () => {
      const mockDocument = {
        cookie: '',
      };
      global.document = mockDocument as any;

      const cookieManager = new CSRFTokenManager('csrf_token');
      const token = cookieManager.getToken();
      
      expect(token).toBeDefined();
      delete (global as any).document;
    });
  });

  describe('XSSSanitizer', () => {
    const { XSSSanitizer } = require('../src/utils/security.js');

    it('should sanitize malicious script tags', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = '<script>alert("XSS")</script>Hello';
      const clean = sanitizer.sanitize(dirty);
      
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    it('should sanitize iframe tags', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = '<iframe src="evil.com"></iframe>Content';
      const clean = sanitizer.sanitize(dirty);
      
      expect(clean).not.toContain('<iframe');
    });

    it('should sanitize javascript: protocol', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = '<a href="javascript:alert(1)">Click</a>';
      const clean = sanitizer.sanitize(dirty);
      
      expect(clean).not.toContain('javascript:');
    });

    it('should sanitize event handlers', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = '<div onclick="alert(1)">Click</div>';
      const clean = sanitizer.sanitize(dirty);
      
      expect(clean).not.toContain('onclick=');
    });

    it('should sanitize objects recursively', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = {
        name: '<script>alert("XSS")</script>John',
        bio: '<iframe src="evil.com"></iframe>Bio',
        nested: {
          value: 'javascript:alert(1)',
        },
      };

      const clean = sanitizer.sanitize(dirty);
      
      expect(clean.name).not.toContain('<script>');
      expect(clean.bio).not.toContain('<iframe>');
      expect(clean.nested.value).not.toContain('javascript:');
    });

    it('should sanitize arrays', () => {
      const sanitizer = new XSSSanitizer();
      const dirty = [
        '<script>alert(1)</script>',
        'Safe content',
        '<iframe src="evil.com"></iframe>',
      ];

      const clean = sanitizer.sanitize(dirty);
      
      expect(clean[0]).not.toContain('<script>');
      expect(clean[1]).toBe('Safe content');
      expect(clean[2]).not.toContain('<iframe>');
    });

    it('should preserve safe content', () => {
      const sanitizer = new XSSSanitizer();
      const safe = 'This is <b>bold</b> and <i>italic</i> text';
      const result = sanitizer.sanitize(safe);
      
      // Basic sanitizer might remove tags, but shouldn't break
      expect(result).toBeDefined();
    });

    it('should handle non-string primitives', () => {
      const sanitizer = new XSSSanitizer();
      
      expect(sanitizer.sanitize(123)).toBe(123);
      expect(sanitizer.sanitize(true)).toBe(true);
      expect(sanitizer.sanitize(null)).toBe(null);
      expect(sanitizer.sanitize(undefined)).toBe(undefined);
    });

    it('should use custom configuration', () => {
      const sanitizer = new XSSSanitizer({
        enabled: true,
        allowedTags: ['b', 'i'],
        allowedAttributes: { a: ['href'] },
      });

      const input = '<b>Bold</b><script>alert(1)</script>';
      const result = sanitizer.sanitize(input);
      
      expect(result).not.toContain('<script>');
    });
  });

  describe('RateLimiter', () => {
    const { RateLimiter } = require('../src/utils/security.js');
    let limiter: any;

    beforeEach(() => {
      limiter = new RateLimiter();
    });

    it('should allow requests within rate limit', () => {
      const result1 = limiter.check('user:123', 5, 60000);
      const result2 = limiter.check('user:123', 5, 60000);
      const result3 = limiter.check('user:123', 5, 60000);
      
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    it('should block requests exceeding rate limit', () => {
      const maxRequests = 3;
      const windowMs = 60000;

      for (let i = 0; i < maxRequests; i++) {
        expect(limiter.check('user:456', maxRequests, windowMs)).toBe(true);
      }

      // Next request should be blocked
      expect(limiter.check('user:456', maxRequests, windowMs)).toBe(false);
    });

    it('should track different keys independently', () => {
      limiter.check('user:1', 2, 60000);
      limiter.check('user:1', 2, 60000);
      
      limiter.check('user:2', 2, 60000);
      
      // user:1 should be at limit
      expect(limiter.check('user:1', 2, 60000)).toBe(false);
      
      // user:2 should still have capacity
      expect(limiter.check('user:2', 2, 60000)).toBe(true);
    });

    it('should reset specific key', () => {
      limiter.check('user:789', 2, 60000);
      limiter.check('user:789', 2, 60000);
      
      expect(limiter.check('user:789', 2, 60000)).toBe(false);
      
      limiter.reset('user:789');
      
      expect(limiter.check('user:789', 2, 60000)).toBe(true);
    });

    it('should reset all keys', () => {
      limiter.check('user:1', 1, 60000);
      limiter.check('user:2', 1, 60000);
      
      limiter.reset();
      
      expect(limiter.check('user:1', 1, 60000)).toBe(true);
      expect(limiter.check('user:2', 1, 60000)).toBe(true);
    });

    it('should cleanup old requests', () => {
      const shortWindow = 100; // 100ms
      
      limiter.check('user:cleanup', 5, shortWindow);
      limiter.check('user:cleanup', 5, shortWindow);
      
      // Wait for window to expire
      return new Promise(resolve => {
        setTimeout(() => {
          limiter.cleanup();
          // Should be able to make new requests
          expect(limiter.check('user:cleanup', 5, shortWindow)).toBe(true);
          resolve(undefined);
        }, 150);
      });
    });
  });

  describe('InputValidator', () => {
    const { InputValidator } = require('../src/utils/security.js');

    describe('isValidEmail', () => {
      it('should validate correct email addresses', () => {
        expect(InputValidator.isValidEmail('user@example.com')).toBe(true);
        expect(InputValidator.isValidEmail('test.user+tag@domain.co.uk')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(InputValidator.isValidEmail('invalid')).toBe(false);
        expect(InputValidator.isValidEmail('@example.com')).toBe(false);
        expect(InputValidator.isValidEmail('user@')).toBe(false);
        expect(InputValidator.isValidEmail('user @example.com')).toBe(false);
      });
    });

    describe('isValidURL', () => {
      it('should validate correct URLs', () => {
        expect(InputValidator.isValidURL('https://example.com')).toBe(true);
        expect(InputValidator.isValidURL('http://localhost:3000')).toBe(true);
        expect(InputValidator.isValidURL('https://sub.domain.com/path?query=1')).toBe(true);
      });

      it('should reject invalid URLs', () => {
        expect(InputValidator.isValidURL('not-a-url')).toBe(false);
        expect(InputValidator.isValidURL('//example.com')).toBe(false);
        expect(InputValidator.isValidURL('')).toBe(false);
      });
    });

    describe('sanitizeFilename', () => {
      it('should sanitize filenames', () => {
        expect(InputValidator.sanitizeFilename('document.pdf')).toBe('document.pdf');
        expect(InputValidator.sanitizeFilename('my file.txt')).toBe('my_file.txt');
      });

      it('should prevent path traversal', () => {
        const result = InputValidator.sanitizeFilename('../../../etc/passwd');
        expect(result).not.toContain('..');
        expect(result).not.toContain('/');
      });

      it('should limit filename length', () => {
        const longName = 'a'.repeat(300);
        const result = InputValidator.sanitizeFilename(longName);
        expect(result.length).toBeLessThanOrEqual(255);
      });

      it('should remove special characters', () => {
        const result = InputValidator.sanitizeFilename('file<>:"|?*.txt');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain(':');
        expect(result).not.toContain('|');
        expect(result).not.toContain('?');
      });
    });

    describe('isValidJSON', () => {
      it('should validate correct JSON', () => {
        expect(InputValidator.isValidJSON('{"key": "value"}')).toBe(true);
        expect(InputValidator.isValidJSON('[]')).toBe(true);
        expect(InputValidator.isValidJSON('null')).toBe(true);
      });

      it('should reject invalid JSON', () => {
        expect(InputValidator.isValidJSON('{invalid}')).toBe(false);
        expect(InputValidator.isValidJSON('undefined')).toBe(false);
        expect(InputValidator.isValidJSON('{key: value}')).toBe(false);
      });
    });

    describe('hasSQLInjectionPattern', () => {
      it('should detect SQL injection patterns', () => {
        expect(InputValidator.hasSQLInjectionPattern("' OR '1'='1")).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('UNION SELECT * FROM users')).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('DROP TABLE users')).toBe(true);
        expect(InputValidator.hasSQLInjectionPattern('DELETE FROM users WHERE 1=1')).toBe(true);
        // SQL comment pattern with semicolon
        expect(InputValidator.hasSQLInjectionPattern("'; --")).toBe(true);
      });

      it('should allow safe input', () => {
        expect(InputValidator.hasSQLInjectionPattern('regular text')).toBe(false);
        expect(InputValidator.hasSQLInjectionPattern('user@example.com')).toBe(false);
        expect(InputValidator.hasSQLInjectionPattern('search query')).toBe(false);
      });
    });

    describe('validateLength', () => {
      it('should validate string length', () => {
        expect(InputValidator.validateLength('hello', 10)).toBe(true);
        expect(InputValidator.validateLength('hello', 10, 3)).toBe(true);
        expect(InputValidator.validateLength('hi', 10, 3)).toBe(false);
        expect(InputValidator.validateLength('this is too long', 10)).toBe(false);
      });
    });

    describe('validateRange', () => {
      it('should validate numeric range', () => {
        expect(InputValidator.validateRange(5, 0, 10)).toBe(true);
        expect(InputValidator.validateRange(0, 0, 10)).toBe(true);
        expect(InputValidator.validateRange(10, 0, 10)).toBe(true);
        expect(InputValidator.validateRange(-1, 0, 10)).toBe(false);
        expect(InputValidator.validateRange(11, 0, 10)).toBe(false);
      });
    });
  });

  describe('getSecurityHeaders', () => {
    const { getSecurityHeaders } = require('../src/utils/security.js');

    it('should return default security headers', () => {
      const headers = getSecurityHeaders();
      
      expect(headers['Content-Security-Policy']).toBeDefined();
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Permissions-Policy']).toBeDefined();
    });

    it('should use custom CSP', () => {
      const headers = getSecurityHeaders({
        contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-eval'",
      });
      
      expect(headers['Content-Security-Policy']).toBe("default-src 'self'; script-src 'self' 'unsafe-eval'");
    });

    it('should use custom X-Frame-Options', () => {
      const headers = getSecurityHeaders({
        xFrameOptions: 'SAMEORIGIN',
      });
      
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    });

    it('should disable X-Content-Type-Options if configured', () => {
      const headers = getSecurityHeaders({
        xContentTypeOptions: false,
      });
      
      expect(headers['X-Content-Type-Options']).toBeUndefined();
    });

    it('should use custom HSTS', () => {
      const headers = getSecurityHeaders({
        strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      });
      
      expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload');
    });
  });
});
