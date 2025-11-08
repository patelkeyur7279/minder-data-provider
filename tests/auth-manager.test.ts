/**
 * AuthManager Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthManager } from '../src/core/AuthManager';
import { DebugManager } from '../src/debug/DebugManager';
import type { AuthConfig } from '../src/core/types';

// Mock console to suppress warnings
const originalWarn = console.warn;
const originalError = console.error;

describe('AuthManager', () => {
  let authManager: AuthManager;
  let debugManager: DebugManager;

  beforeEach(() => {
    debugManager = {
      log: jest.fn(),
    } as any;
    
    // Suppress console warnings/errors during tests
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      authManager = new AuthManager();
      expect(authManager).toBeDefined();
      expect(authManager.getToken()).toBeNull();
    });

    it('should create with custom config', () => {
      const config: AuthConfig = {
        tokenKey: 'customToken',
        storage: 'memory',
      };
      authManager = new AuthManager(config);
      expect(authManager).toBeDefined();
    });

    it('should create with debug manager', () => {
      authManager = new AuthManager(undefined, debugManager, true);
      expect(authManager).toBeDefined();
    });

    it('should create without logging', () => {
      authManager = new AuthManager(undefined, debugManager, false);
      authManager.setToken('test');
      expect(debugManager.log).not.toHaveBeenCalled();
    });
  });

  describe('Memory Storage', () => {
    beforeEach(() => {
      authManager = new AuthManager({ tokenKey: 'accessToken', storage: 'memory' });
    });

    it('should set and get token', () => {
      authManager.setToken('test-token');
      expect(authManager.getToken()).toBe('test-token');
    });

    it('should return null for non-existent token', () => {
      expect(authManager.getToken()).toBeNull();
    });

    it('should set and get refresh token', () => {
      authManager.setRefreshToken('refresh-token');
      expect(authManager.getRefreshToken()).toBe('refresh-token');
    });

    it('should return null for non-existent refresh token', () => {
      expect(authManager.getRefreshToken()).toBeNull();
    });

    it('should clear auth tokens', () => {
      authManager.setToken('test-token');
      authManager.setRefreshToken('refresh-token');
      
      authManager.clearAuth();
      
      expect(authManager.getToken()).toBeNull();
      expect(authManager.getRefreshToken()).toBeNull();
    });

    it('should check if authenticated (with token)', () => {
      authManager.setToken('test-token');
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should check if authenticated (without token)', () => {
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should async get token', async () => {
      authManager.setToken('async-token');
      const token = await authManager.getTokenAsync();
      expect(token).toBe('async-token');
    });

    it('should async get refresh token', async () => {
      authManager.setRefreshToken('async-refresh');
      const token = await authManager.getRefreshTokenAsync();
      expect(token).toBe('async-refresh');
    });
  });

  describe('JWT Token Validation', () => {
    beforeEach(() => {
      authManager = new AuthManager();
    });

    it('should validate non-expired JWT token', () => {
      // Create a JWT with expiration 1 hour from now
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
      const jwt = `header.${payload}.signature`;
      
      authManager.setToken(jwt);
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should reject expired JWT token', () => {
      // Create a JWT with expiration 1 hour ago
      const exp = Math.floor(Date.now() / 1000) - 3600;
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
      const jwt = `header.${payload}.signature`;
      
      authManager.setToken(jwt);
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should validate JWT without expiration', () => {
      const payload = Buffer.from(JSON.stringify({ sub: 'user123' })).toString('base64');
      const jwt = `header.${payload}.signature`;
      
      authManager.setToken(jwt);
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should handle invalid JWT format', () => {
      authManager.setToken('invalid-jwt');
      expect(authManager.isAuthenticated()).toBe(true); // Falls back to treating as valid
    });

    it('should handle malformed JWT payload', () => {
      const jwt = 'header.invalid-base64.signature';
      authManager.setToken(jwt);
      expect(authManager.isAuthenticated()).toBe(true); // Falls back to treating as valid
    });
  });

  describe('SessionStorage', () => {
    beforeEach(() => {
      // Mock sessionStorage
      const storage: Record<string, string> = {};
      (global as any).window = {
        sessionStorage: {
          getItem: (key: string) => storage[key] || null,
          setItem: (key: string, value: string) => { storage[key] = value; },
          removeItem: (key: string) => { delete storage[key]; },
        },
      };
      
      authManager = new AuthManager({ tokenKey: 'accessToken', storage: 'sessionStorage' });
    });

    afterEach(() => {
      delete (global as any).window;
    });

    it('should set and get token from sessionStorage', () => {
      authManager.setToken('session-token');
      expect(authManager.getToken()).toBe('session-token');
    });

    it('should set and get refresh token from sessionStorage', () => {
      authManager.setRefreshToken('session-refresh');
      expect(authManager.getRefreshToken()).toBe('session-refresh');
    });

    it('should clear tokens from sessionStorage', () => {
      authManager.setToken('session-token');
      authManager.clearAuth();
      expect(authManager.getToken()).toBeNull();
    });
  });

  describe('Cookie Storage', () => {
    beforeEach(() => {
      // Mock document.cookie
      let cookieStore = '';
      Object.defineProperty(global, 'document', {
        value: {
          get cookie() {
            return cookieStore;
          },
          set cookie(value: string) {
            if (value.includes('expires=Thu, 01 Jan 1970')) {
              // Remove cookie
              const key = value.split('=')[0];
              cookieStore = cookieStore.split('; ').filter(c => !c.startsWith(key + '=')).join('; ');
            } else {
              // Add cookie
              const existing = cookieStore ? cookieStore.split('; ') : [];
              const newCookie = value.split(';')[0];
              const key = newCookie.split('=')[0];
              const filtered = existing.filter(c => !c.startsWith(key + '='));
              filtered.push(newCookie);
              cookieStore = filtered.join('; ');
            }
          },
        },
        configurable: true,
      });
      
      authManager = new AuthManager({ tokenKey: 'accessToken', storage: 'cookie' });
    });

    afterEach(() => {
      delete (global as any).document;
    });

    it('should set and get token from cookie', () => {
      authManager.setToken('cookie-token');
      expect(authManager.getToken()).toBe('cookie-token');
    });

    it('should set and get refresh token from cookie', () => {
      authManager.setRefreshToken('cookie-refresh');
      expect(authManager.getRefreshToken()).toBe('cookie-refresh');
    });

    it('should clear tokens from cookie', () => {
      authManager.setToken('cookie-token');
      authManager.clearAuth();
      expect(authManager.getToken()).toBeNull();
    });

    it('should return null for non-existent cookie', () => {
      expect(authManager.getToken()).toBeNull();
    });
  });

  describe('AsyncStorage (React Native)', () => {
    let mockAsyncStorage: any;

    beforeEach(() => {
      const storage: Record<string, string> = {};
      mockAsyncStorage = {
        getItem: jest.fn((key: string) => Promise.resolve(storage[key] || null)),
        setItem: jest.fn((key: string, value: string) => {
          storage[key] = value;
          return Promise.resolve();
        }),
        removeItem: jest.fn((key: string) => {
          delete storage[key];
          return Promise.resolve();
        }),
      };
      
      // Mock require for AsyncStorage
      jest.mock('@react-native-async-storage/async-storage', () => ({
        default: mockAsyncStorage,
      }), { virtual: true });
      
      authManager = new AuthManager({ tokenKey: 'accessToken', storage: 'AsyncStorage' });
      // Manually set AsyncStorage since mocking is tricky
      (authManager as any).AsyncStorage = mockAsyncStorage;
    });

    it('should set token to AsyncStorage', async () => {
      authManager.setToken('async-token');
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('accessToken', 'async-token');
    });

    it('should get token async from AsyncStorage', async () => {
      await mockAsyncStorage.setItem('accessToken', 'async-token');
      const token = await authManager.getTokenAsync();
      expect(token).toBe('async-token');
    });

    it('should get refresh token async from AsyncStorage', async () => {
      await mockAsyncStorage.setItem('accessToken_refresh', 'async-refresh');
      const token = await authManager.getRefreshTokenAsync();
      expect(token).toBe('async-refresh');
    });

    it('should remove token from AsyncStorage', async () => {
      // Verify setup
      expect((authManager as any).AsyncStorage).toBeTruthy();
      expect((authManager as any).config.storage).toBe('AsyncStorage');
      
      authManager.clearAuth();
      // Wait for async operations  
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('accessToken');
    });

    it('should handle AsyncStorage setItem error', async () => {
      (authManager as any).AsyncStorage.setItem = jest.fn(() => Promise.reject(new Error('Storage error')));
      
      // Should not throw
      expect(() => authManager.setToken('test')).not.toThrow();
    });

    it('should handle AsyncStorage getItem error', async () => {
      (authManager as any).AsyncStorage.getItem = jest.fn(() => Promise.reject(new Error('Storage error')));
      
      const token = await authManager.getTokenAsync();
      expect(token).toBeNull();
    });

    it('should warn when using synchronous getToken', () => {
      authManager.getToken();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('SecureStore (Expo)', () => {
    let mockSecureStore: any;

    beforeEach(() => {
      const storage: Record<string, string> = {};
      mockSecureStore = {
        getItemAsync: jest.fn((key: string) => Promise.resolve(storage[key] || null)),
        setItemAsync: jest.fn((key: string, value: string) => {
          storage[key] = value;
          return Promise.resolve();
        }),
        deleteItemAsync: jest.fn((key: string) => {
          delete storage[key];
          return Promise.resolve();
        }),
      };
      
      authManager = new AuthManager({ tokenKey: 'accessToken', storage: 'SecureStore' });
      // Manually set SecureStore and override config since mocking require is difficult
      (authManager as any).SecureStore = mockSecureStore;
      (authManager as any).config.storage = 'SecureStore'; // Override fallback
    });

    it('should set token to SecureStore', async () => {
      authManager.setToken('secure-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'secure-token');
    });

    it('should get token async from SecureStore', async () => {
      await mockSecureStore.setItemAsync('accessToken', 'secure-token');
      const token = await authManager.getTokenAsync();
      expect(token).toBe('secure-token');
    });

    it('should get refresh token async from SecureStore', async () => {
      await mockSecureStore.setItemAsync('accessToken_refresh', 'secure-refresh');
      const token = await authManager.getRefreshTokenAsync();
      expect(token).toBe('secure-refresh');
    });

    it('should remove token from SecureStore', async () => {
      authManager.clearAuth();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken');
    });

    it('should handle SecureStore setItemAsync error', async () => {
      (authManager as any).SecureStore.setItemAsync = jest.fn(() => Promise.reject(new Error('Storage error')));
      
      expect(() => authManager.setToken('test')).not.toThrow();
    });

    it('should handle SecureStore getItemAsync error', async () => {
      (authManager as any).SecureStore.getItemAsync = jest.fn(() => Promise.reject(new Error('Storage error')));
      
      const token = await authManager.getTokenAsync();
      expect(token).toBeNull();
    });

    it('should warn when using synchronous getToken', () => {
      authManager.getToken();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('Debug Logging', () => {
    beforeEach(() => {
      authManager = new AuthManager(undefined, debugManager, true);
    });

    it('should log setToken', () => {
      authManager.setToken('test-token');
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '🔐 AUTH SET TOKEN',
        expect.objectContaining({
          tokenKey: 'accessToken',
          storage: 'memory',
          tokenLength: 10,
        })
      );
    });

    it('should log getToken with token', () => {
      authManager.setToken('test-token');
      (debugManager.log as jest.Mock).mockClear();
      
      authManager.getToken();
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '✅ AUTH GET TOKEN',
        expect.objectContaining({
          hasToken: true,
        })
      );
    });

    it('should log getToken without token', () => {
      authManager.getToken();
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '❌ AUTH GET TOKEN',
        expect.objectContaining({
          hasToken: false,
        })
      );
    });

    it('should log setRefreshToken', () => {
      authManager.setRefreshToken('refresh-token');
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '🔄 AUTH SET REFRESH TOKEN',
        expect.any(Object)
      );
    });

    it('should log getRefreshToken', () => {
      authManager.getRefreshToken();
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '❌ AUTH GET REFRESH TOKEN',
        expect.any(Object)
      );
    });

    it('should log clearAuth', () => {
      authManager.clearAuth();
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '🗑️ AUTH CLEAR',
        expect.any(Object)
      );
    });

    it('should log isAuthenticated with no token', () => {
      authManager.isAuthenticated();
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '❌ AUTH CHECK: No token',
        {}
      );
    });

    it('should log isAuthenticated with valid JWT', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
      const jwt = `header.${payload}.signature`;
      authManager.setToken(jwt);
      
      (debugManager.log as jest.Mock).mockClear();
      authManager.isAuthenticated();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '✅ AUTH CHECK: VALID',
        expect.any(Object)
      );
    });

    it('should log isAuthenticated with expired JWT', () => {
      const exp = Math.floor(Date.now() / 1000) - 3600;
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
      const jwt = `header.${payload}.signature`;
      authManager.setToken(jwt);
      
      (debugManager.log as jest.Mock).mockClear();
      authManager.isAuthenticated();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '⏰ AUTH CHECK: EXPIRED',
        expect.any(Object)
      );
    });

    it('should log isAuthenticated with non-JWT token', () => {
      authManager.setToken('simple-token');
      (debugManager.log as jest.Mock).mockClear();
      
      authManager.isAuthenticated();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '✅ AUTH CHECK: Non-JWT token',
        {}
      );
    });

    it('should log async getToken', async () => {
      authManager.setToken('test');
      (debugManager.log as jest.Mock).mockClear();
      
      await authManager.getTokenAsync();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '✅ AUTH GET TOKEN (ASYNC)',
        expect.any(Object)
      );
    });

    it('should log async getRefreshToken', async () => {
      authManager.setRefreshToken('test');
      (debugManager.log as jest.Mock).mockClear();
      
      await authManager.getRefreshTokenAsync();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'auth',
        '✅ AUTH GET REFRESH TOKEN (ASYNC)',
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      authManager = new AuthManager();
    });

    it('should handle empty token', () => {
      authManager.setToken('');
      // Empty string is falsy, so Map.get returns undefined which becomes null
      const result = authManager.getToken();
      expect(result === '' || result === null).toBe(true);
    });

    it('should handle clearing when no tokens exist', () => {
      expect(() => authManager.clearAuth()).not.toThrow();
    });

    it('should handle custom token key', () => {
      authManager = new AuthManager({ tokenKey: 'customKey', storage: 'memory' });
      authManager.setToken('test');
      expect(authManager.getToken()).toBe('test');
    });

    it('should handle multiple auth managers with different configs', () => {
      const auth1 = new AuthManager({ tokenKey: 'token1', storage: 'memory' });
      const auth2 = new AuthManager({ tokenKey: 'token2', storage: 'memory' });
      
      auth1.setToken('value1');
      auth2.setToken('value2');
      
      expect(auth1.getToken()).toBe('value1');
      expect(auth2.getToken()).toBe('value2');
    });
  });
});
