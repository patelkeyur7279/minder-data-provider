/**
 * Token Refresh Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  TokenRefreshManager,
  createTokenRefreshManager,
  type TokenRefreshConfig,
} from '../src/auth/TokenRefreshManager';

// Mock JWT tokens
const createMockJWT = (expiresInSeconds: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'user123',
    iat: now,
    exp: now + expiresInSeconds,
    email: 'test@example.com',
  };

  // Simple JWT structure (not cryptographically secure, just for testing)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadEncoded = btoa(JSON.stringify(payload));
  const signature = 'mock-signature';

  return `${header}.${payloadEncoded}.${signature}`;
};

describe('TokenRefreshManager', () => {
  let refreshFn: jest.Mock<() => Promise<string>>;
  let onRefreshed: jest.Mock<(token: string) => void>;
  let onError: jest.Mock<(error: Error) => void>;
  let manager: TokenRefreshManager;

  beforeEach(() => {
    jest.useFakeTimers();
    refreshFn = jest.fn<() => Promise<string>>();
    onRefreshed = jest.fn();
    onError = jest.fn();
  });

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
    jest.useRealTimers();
  });

  describe('Token Parsing', () => {
    it('should parse valid JWT token', () => {
      const token = createMockJWT(3600); // 1 hour
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo(token);

      expect(info.valid).toBe(true);
      expect(info.expired).toBe(false);
      expect(info.payload).toBeDefined();
      expect(info.payload?.sub).toBe('user123');
      expect(info.payload?.email).toBe('test@example.com');
    });

    it('should handle JWT with missing parts', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo('header.'); // Missing payload
      expect(info.valid).toBe(false);
      expect(info.payload).toBeNull();
    });

    it('should handle malformed base64 in JWT', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo('header.!!invalid-base64!!.signature');
      expect(info.valid).toBe(false);
    });

    it('should parse JWT without expiration', () => {
      const payload = { sub: 'user123', iat: Math.floor(Date.now() / 1000) };
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payloadEncoded = btoa(JSON.stringify(payload));
      const token = `${header}.${payloadEncoded}.signature`;

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo(token);
      expect(info.valid).toBe(true);
      expect(info.expiresAt).toBeNull();
      expect(info.needsRefresh).toBe(false);
    });

    it('should detect expired token', () => {
      const token = createMockJWT(-10); // Expired 10 seconds ago
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      expect(manager.isTokenExpired(token)).toBe(true);
    });

    it('should detect token that needs refresh', () => {
      const token = createMockJWT(240); // Expires in 4 minutes
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000, // 5 minutes
      };
      manager = new TokenRefreshManager(config);

      expect(manager.needsRefresh(token)).toBe(true);
    });

    it('should handle invalid token gracefully', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo('invalid-token');

      expect(info.valid).toBe(false);
      expect(info.expired).toBe(false);
      expect(info.payload).toBeNull();
    });
  });

  describe('Auto Refresh', () => {
    it('should schedule refresh before expiration', () => {
      const token = createMockJWT(600); // 10 minutes
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000, // 5 minutes
        onTokenRefreshed: onRefreshed,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);

      // Should schedule refresh in 5 minutes (600s - 300s = 300s)
      expect(jest.getTimerCount()).toBe(1);
    });

    it('should not start auto-refresh with empty token', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh('');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not schedule refresh for token without expiration', () => {
      const payload = { sub: 'user123' };
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payloadEncoded = btoa(JSON.stringify(payload));
      const token = `${header}.${payloadEncoded}.signature`;

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should refresh token when threshold is reached', async () => {
      const oldToken = createMockJWT(600); // 10 minutes
      const newToken = createMockJWT(3600); // 1 hour

      refreshFn.mockResolvedValue(newToken);

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000, // 5 minutes
        onTokenRefreshed: onRefreshed,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(oldToken);

      // Fast-forward to refresh time (5 minutes before expiration)
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(refreshFn).toHaveBeenCalled();
      expect(onRefreshed).toHaveBeenCalledWith(newToken);
    });

    it('should skip refresh if already in progress', async () => {
      const token = createMockJWT(600);
      const newToken = createMockJWT(3600);

      // Make refresh take some time
      let resolveRefresh: (value: string) => void;
      const refreshPromise = new Promise<string>((resolve) => {
        resolveRefresh = resolve;
      });
      refreshFn.mockReturnValue(refreshPromise);

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      // Try to refresh again while first is in progress
      const secondRefresh = manager.refreshNow();

      // Should only call refresh function once
      expect(refreshFn).toHaveBeenCalledTimes(1);

      // Complete the refresh
      resolveRefresh!(newToken);
      await secondRefresh;
    });

    it('should handle invalid token from refresh function', async () => {
      const token = createMockJWT(600);

      refreshFn.mockResolvedValue(''); // Empty token

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
        onRefreshError: onError,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(onError).toHaveBeenCalled();
      const error = onError.mock.calls[0][0];
      expect(error.message).toContain('Invalid token');
    });

    it('should handle already-expired token from refresh function', async () => {
      const token = createMockJWT(600);
      const expiredToken = createMockJWT(-10); // Already expired

      refreshFn.mockResolvedValue(expiredToken);

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
        onRefreshError: onError,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(onError).toHaveBeenCalled();
      const error = onError.mock.calls[0][0];
      expect(error.message).toContain('already expired');
    });

    it('should handle non-Error thrown from refresh function', async () => {
      const token = createMockJWT(600);

      refreshFn.mockRejectedValue('string error'); // Non-Error object

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
        onRefreshError: onError,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(onError).toHaveBeenCalled();
      const error = onError.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });

    it('should handle refresh errors', async () => {
      const token = createMockJWT(600);
      const error = new Error('Refresh failed');

      refreshFn.mockRejectedValue(error);

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
        onRefreshError: onError,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);

      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(refreshFn).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(error);
      expect(onRefreshed).not.toHaveBeenCalled();
    });

    it('should not start auto-refresh with expired token', () => {
      const token = createMockJWT(-10); // Already expired
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should stop auto-refresh when requested', () => {
      const token = createMockJWT(600);
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      expect(jest.getTimerCount()).toBe(1);

      manager.stopAutoRefresh();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should handle stop when no timer is active', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        debug: true,
      };
      manager = new TokenRefreshManager(config);

      expect(() => manager.stopAutoRefresh()).not.toThrow();
    });
  });

  describe('Manual Refresh', () => {
    it('should allow manual token refresh', async () => {
      const newToken = createMockJWT(3600);
      refreshFn.mockResolvedValue(newToken);

      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        onTokenRefreshed: onRefreshed,
      };
      manager = new TokenRefreshManager(config);

      const result = await manager.refreshNow();

      expect(refreshFn).toHaveBeenCalled();
      expect(onRefreshed).toHaveBeenCalledWith(newToken);
      expect(result).toBe(newToken);
    });
  });

  describe('Configuration', () => {
    it('should respect custom refresh threshold', () => {
      const token = createMockJWT(120); // 2 minutes
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 3 * 60 * 1000, // 3 minutes
      };
      manager = new TokenRefreshManager(config);

      expect(manager.needsRefresh(token)).toBe(true);
    });

    it('should allow disabling auto-refresh', () => {
      const token = createMockJWT(600);
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        enabled: false,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should allow updating configuration', () => {
      const token = createMockJWT(600);
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
        refreshThreshold: 5 * 60 * 1000,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      manager.updateConfig({ refreshThreshold: 10 * 60 * 1000 });

      // Should reschedule with new threshold
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('Token Info', () => {
    it('should return complete token information', () => {
      const token = createMockJWT(600); // 10 minutes
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      const info = manager.getTokenInfo(token);

      expect(info.valid).toBe(true);
      expect(info.expired).toBe(false);
      expect(info.expiresAt).toBeInstanceOf(Date);
      expect(info.timeUntilExpiration).toBeGreaterThan(0);
      expect(info.payload).toBeDefined();
    });
  });

  describe('Factory Function', () => {
    it('should create manager via factory function', () => {
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };

      const created = createTokenRefreshManager(config);

      expect(created).toBeInstanceOf(TokenRefreshManager);
      created.dispose();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on dispose', () => {
      const token = createMockJWT(600);
      const config: TokenRefreshConfig = {
        refreshToken: refreshFn,
      };
      manager = new TokenRefreshManager(config);

      manager.startAutoRefresh(token);
      expect(jest.getTimerCount()).toBe(1);

      manager.dispose();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
