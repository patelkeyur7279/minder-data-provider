/**
 * Critical Bug #5: JWT Parsing Crashes on Malformed Tokens
 * 
 * Simplified unit tests focusing on the JWT parsing bug without
 * requiring React component rendering (which causes issues with dynamic imports in Jest).
 * 
 * Issue: JWT decoding uses token.split('.')[1] without validation
 *        Crashes if token has < 3 parts or is malformed
 * Fix: Validate JWT has exactly 3 parts before parsing
 * Files changed: 
 *   - src/hooks/useMinder.ts (line 1003)
 *   - src/hooks/index.ts (line 200)
 *   - src/core/AuthManager.ts (line 120)
 *   - src/auth/SecureAuthManager.ts (line 240)
 */

import { AuthManager } from '../src/core/AuthManager';
import type { MinderConfig } from '../src/core/types';

describe('Bug #5: JWT Parsing with Malformed Tokens', () => {
  const malformedTokens = [
    { token: 'not-a-jwt', description: 'single string without dots' },
    { token: 'only.two', description: 'only 2 parts' },
    { token: '.', description: 'single dot' },
    { token: '', description: 'empty string' },
    { token: 'a.b.c.d.e', description: 'too many parts (5)' },
    { token: 'header..signature', description: 'empty payload part' },
    { token: '..', description: 'only dots' },
    { token: 'a.', description: 'missing parts after dot' },
    { token: '.b', description: 'missing header' },
  ];

  const mockConfig: MinderConfig = {
    apiBaseUrl: 'https://api.example.com',
    routes: {},
  };

  describe('AuthManager.isAuthenticated() with malformed tokens', () => {
    malformedTokens.forEach(({ token, description }) => {
      it(`should not crash with ${description}: "${token}"`, () => {
        const authManager = new AuthManager(mockConfig);
        authManager.setToken(token);

        // ✅ FIXED: Should NOT crash
        expect(() => authManager.isAuthenticated()).not.toThrow();
        
        // Should still check authentication (handles as non-JWT token)
        const isAuth = authManager.isAuthenticated();
        expect(typeof isAuth).toBe('boolean');
      });
    });
  });

  it('should parse valid JWT tokens correctly', () => {
    // Create a valid JWT token (header.payload.signature)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ 
      sub: '123', 
      name: 'Test User',
      exp: Math.floor(Date.now() / 1000) + 3600  // Expires in 1 hour
    }));
    const signature = 'fake-signature';
    const validToken = `${header}.${payload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(validToken);

    // ✅ Should parse valid tokens successfully
    expect(() => authManager.isAuthenticated()).not.toThrow();
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('should handle tokens with base64url encoding (- and _ characters)', () => {
    // JWT tokens use base64url which replaces + with - and / with _
    // This is a real JWT token from jwt.io
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const payload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
    const signature = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const base64urlToken = `${header}.${payload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(base64urlToken);

    // ✅ Should handle base64url encoding (- and _ characters)
    expect(() => authManager.isAuthenticated()).not.toThrow();
  });

  it('should handle expired JWT tokens without crashing', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ 
      sub: '123', 
      name: 'Test User',
      exp: Math.floor(Date.now() / 1000) - 3600  // Expired 1 hour ago
    }));
    const signature = 'fake-signature';
    const expiredToken = `${header}.${payload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(expiredToken);

    // ✅ Should handle expired tokens gracefully
    expect(() => authManager.isAuthenticated()).not.toThrow();
    expect(authManager.isAuthenticated()).toBe(false);
  });

  it('should handle tokens without expiration claim', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ 
      sub: '123', 
      name: 'Test User'
      // No exp claim
    }));
    const signature = 'fake-signature';
    const noExpToken = `${header}.${payload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(noExpToken);

    // ✅ Should treat as valid if no exp claim
    expect(() => authManager.isAuthenticated()).not.toThrow();
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('should handle tokens with invalid JSON in payload', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const invalidPayload = btoa('{invalid json');
    const signature = 'fake-signature';
    const invalidJsonToken = `${header}.${invalidPayload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(invalidJsonToken);

    // ✅ Should handle JSON parse errors gracefully
    expect(() => authManager.isAuthenticated()).not.toThrow();
    // Should treat as non-JWT token (valid)
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('should handle tokens with non-base64 payload', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const nonBase64Payload = '!!!not-base64!!!';
    const signature = 'fake-signature';
    const nonBase64Token = `${header}.${nonBase64Payload}.${signature}`;

    const authManager = new AuthManager(mockConfig);
    authManager.setToken(nonBase64Token);

    // ✅ Should handle base64 decode errors gracefully
    expect(() => authManager.isAuthenticated()).not.toThrow();
    // Should treat as non-JWT token (valid)
    expect(authManager.isAuthenticated()).toBe(true);
  });
});
