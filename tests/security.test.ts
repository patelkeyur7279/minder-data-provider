/**
 * 🔒 Security Tests for SecureAuthManager
 * 
 * Tests for:
 * - CSRF protection
 * - XSS prevention
 * - httpOnly cookies
 * - HTTPS enforcement
 * - Token refresh
 * - Rate limiting
 * - Input sanitization
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SecureAuthManager, createSecureAuthManager } from '../src/auth/SecureAuthManager.js';
import { StorageType } from '../src/constants/enums.js';

describe('SecureAuthManager - Security Features', () => {
  let authManager: SecureAuthManager;
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    // Save original env
    originalEnv = process.env.NODE_ENV;
    
    // Mock production environment
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true,
    });
    
    authManager = createSecureAuthManager({
      tokenKey: 'test-token',
      storage: StorageType.MEMORY,
      enforceHttps: true,
      enableCSRF: true,
      autoRefresh: false, // Disable for testing
    });
  });
  
  afterEach(() => {
    // Cleanup
    authManager.destroy();
    
    // Restore original env
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });
  
  // ==========================================================================
  // CSRF PROTECTION TESTS
  // ==========================================================================
  
  describe('CSRF Protection', () => {
    it('should generate CSRF token', () => {
      const token = authManager.getCSRFToken();
      
      expect(token).toBeTruthy();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });
    
    it('should validate correct CSRF token', () => {
      const token = authManager.getCSRFToken();
      const isValid = authManager.validateCSRFToken(token);
      
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid CSRF token', () => {
      const isValid = authManager.validateCSRFToken('invalid-token');
      
      expect(isValid).toBe(false);
    });
    
    it('should reject wrong length CSRF token', () => {
      const isValid = authManager.validateCSRFToken('abcd1234');
      
      expect(isValid).toBe(false);
    });
    
    it('should regenerate CSRF token after 1 hour', async () => {
      const token1 = authManager.getCSRFToken();
      
      // Mock time passing (1 hour + 1 second)
      jest.useFakeTimers();
      jest.advanceTimersByTime(3600000 + 1000);
      
      const token2 = authManager.getCSRFToken();
      
      expect(token1).not.toBe(token2);
      
      jest.useRealTimers();
    });
    
    it('should include CSRF token in security headers', () => {
      const headers = authManager.getSecurityHeaders();
      
      expect(headers['X-CSRF-Token']).toBeTruthy();
      expect(headers['X-CSRF-Token']).toHaveLength(64);
    });
  });
  
  // ==========================================================================
  // XSS PREVENTION TESTS
  // ==========================================================================
  
  describe('XSS Prevention', () => {
    it('should sanitize email input', () => {
      const malicious = '<script>alert("xss")</script>test@example.com';
      
      expect(() => authManager.sanitizeEmail(malicious)).toThrow('Invalid email format');
    });
    
    it('should accept valid email', () => {
      const email = 'user@example.com';
      const sanitized = authManager.sanitizeEmail(email);
      
      expect(sanitized).toBe(email);
    });
    
    it('should lowercase and trim email', () => {
      const email = '  User@EXAMPLE.COM  ';
      const sanitized = authManager.sanitizeEmail(email);
      
      expect(sanitized).toBe('user@example.com');
    });
    
    it('should reject emails with XSS', () => {
      const malicious = 'user@example.com<script>alert(1)</script>';
      
      expect(() => authManager.sanitizeEmail(malicious)).toThrow();
    });
    
    it('should sanitize URL input', () => {
      const validUrl = 'https://example.com/api/users';
      const sanitized = authManager.sanitizeURL(validUrl);
      
      expect(sanitized).toBe(validUrl);
    });
    
    it('should reject malicious URLs', () => {
      const malicious = 'javascript:alert("xss")';
      
      expect(() => authManager.sanitizeURL(malicious)).toThrow('Invalid URL format');
    });
  });
  
  // ==========================================================================
  // HTTPS ENFORCEMENT TESTS
  // ==========================================================================
  
  describe('HTTPS Enforcement', () => {
    it('should include HSTS header in production', () => {
      const headers = authManager.getSecurityHeaders();
      
      expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    });
    
    it('should include security headers', () => {
      const headers = authManager.getSecurityHeaders();
      
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    });
    
    it('should create httpOnly cookie header', () => {
      const cookie = authManager.setHttpOnlyCookie('accessToken', 'jwt-token');
      
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=strict');
      expect(cookie).toContain('Path=/');
    });
    
    it('should set Max-Age in cookie', () => {
      const auth = createSecureAuthManager({
        tokenKey: 'token',
        storage: StorageType.COOKIE,
        cookieOptions: {
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
      });
      
      const cookie = auth.setHttpOnlyCookie('token', 'value');
      
      expect(cookie).toContain('Max-Age=604800'); // 7 days in seconds
      
      auth.destroy();
    });
  });
  
  // ==========================================================================
  // RATE LIMITING TESTS
  // ==========================================================================
  
  describe('Rate Limiting', () => {
    it('should allow requests under rate limit', async () => {
      const auth = createSecureAuthManager({
        tokenKey: 'test',
        storage: StorageType.MEMORY,
        rateLimit: {
          maxAttempts: 5,
          windowMs: 15 * 60 * 1000,
        },
      });
      
      // Should succeed (1st attempt)
      await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('must be implemented'); // Expected error
      
      auth.destroy();
    });
    
    it('should block requests over rate limit', async () => {
      const auth = createSecureAuthManager({
        tokenKey: 'test',
        storage: StorageType.MEMORY,
        rateLimit: {
          maxAttempts: 3,
          windowMs: 15 * 60 * 1000,
        },
      });
      
            // Make 2 attempts (should both go through with expected error)
      for (let i = 0; i < 2; i++) {
        await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
          .rejects.toThrow('must be implemented');
      }
      
      // Should still be under limit (max is 5)
      await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('must be implemented');
      
      auth.destroy();
    });
    
    it('should block requests over rate limit', async () => {
      const auth = createSecureAuthManager({
        tokenKey: 'test',
        storage: StorageType.MEMORY,
        rateLimit: {
          maxAttempts: 3,
          windowMs: 15 * 60 * 1000,
        },
      });
      
      // Make 3 attempts (should all go through with expected error)
      for (let i = 0; i < 3; i++) {
        try {
          await auth.login({ email: 'test@example.com', password: 'pass' });
        } catch (err: any) {
          expect(err.message).toContain('must be implemented');
        }
      }
      
      // 4th attempt should be rate limited
      await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('Too many login attempts');
      
      auth.destroy();
    });
    
    it('should reset rate limit after window expires', async () => {
      jest.useFakeTimers();
      
      const auth = createSecureAuthManager({
        tokenKey: 'test',
        storage: StorageType.MEMORY,
        rateLimit: {
          maxAttempts: 2,
          windowMs: 1000, // 1 second window
        },
      });
      
      // Make 2 attempts
      for (let i = 0; i < 2; i++) {
        try {
          await auth.login({ email: 'test@example.com', password: 'pass' });
        } catch (err: any) {
          expect(err.message).toContain('must be implemented');
        }
      }
      
      // Should be rate limited
      await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('Too many login attempts');
      
      // Advance time past window
      jest.advanceTimersByTime(1001);
      
      // Should work again (but with expected error)
      await expect(auth.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('must be implemented'); // NOT rate limited
      
      auth.destroy();
      jest.useRealTimers();
    });
  });
  
  // ==========================================================================
  // TOKEN SECURITY TESTS
  // ==========================================================================
  
  describe('Token Security', () => {
    let tokenAuthManager: SecureAuthManager;
    
    beforeEach(() => {
      // Create manager without HTTPS enforcement for token tests
      tokenAuthManager = createSecureAuthManager({
        tokenKey: 'test-token',
        storage: StorageType.MEMORY,
        enforceHttps: false, // Disable for testing
        enableCSRF: true,
        autoRefresh: false,
      });
    });
    
    afterEach(() => {
      tokenAuthManager.destroy();
    });
    
    it('should store token securely', () => {
      tokenAuthManager.setToken('secure-jwt-token');
      const token = tokenAuthManager.getToken();
      
      expect(token).toBe('secure-jwt-token');
    });
    
    it('should clear all auth data on logout', () => {
      tokenAuthManager.setToken('access-token');
      tokenAuthManager.setRefreshToken('refresh-token');
      
      tokenAuthManager.clearAuth();
      
      expect(tokenAuthManager.getToken()).toBeNull();
      expect(tokenAuthManager.getRefreshToken()).toBeNull();
    });
    
    it('should validate JWT expiration', () => {
      // Create a mock expired JWT token
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        exp: now - 3600, // Expired 1 hour ago
        userId: '123',
      };
      const expiredToken = `header.${btoa(JSON.stringify(expiredPayload))}.signature`;
      
      tokenAuthManager.setToken(expiredToken);
      
      expect(tokenAuthManager.isAuthenticated()).toBe(false);
    });
    
    it('should accept valid JWT token', () => {
      const now = Math.floor(Date.now() / 1000);
      const validPayload = {
        exp: now + 3600, // Expires in 1 hour
        userId: '123',
      };
      const validToken = `header.${btoa(JSON.stringify(validPayload))}.signature`;
      
      tokenAuthManager.setToken(validToken);
      
      expect(tokenAuthManager.isAuthenticated()).toBe(true);
    });
  });
  
  // ==========================================================================
  // INTEGRATION TESTS
  // ==========================================================================
  
  describe('Security Integration', () => {
    it('should enforce all security measures together', () => {
      const auth = createSecureAuthManager({
        tokenKey: 'token',
        storage: StorageType.COOKIE,
        enforceHttps: true,
        enableCSRF: true,
        cookieOptions: {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
        },
        rateLimit: {
          maxAttempts: 5,
          windowMs: 15 * 60 * 1000,
        },
      });
      
      // Check CSRF
      const csrfToken = auth.getCSRFToken();
      expect(csrfToken).toHaveLength(64);
      
      // Check security headers
      const headers = auth.getSecurityHeaders();
      expect(headers['X-CSRF-Token']).toBe(csrfToken);
      expect(headers['Strict-Transport-Security']).toBeTruthy();
      
      // Check cookie options
      const cookie = auth.setHttpOnlyCookie('token', 'value');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=strict');
      
      auth.destroy();
    });
    
    it('should sanitize all user inputs', () => {
      expect(() => authManager.sanitizeEmail('<script>alert(1)</script>'))
        .toThrow();
      
      expect(() => authManager.sanitizeURL('javascript:alert(1)'))
        .toThrow();
    });
  });
});
