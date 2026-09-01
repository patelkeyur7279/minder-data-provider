/**
 * Tests for CORS helper rename (cors -> corsHelper)
 * Issue #12: Renaming CORS helper to avoid user confusion
 * 
 * Tests:
 * 1. New corsHelper field works correctly
 * 2. Old cors field still works (backward compatibility)
 * 3. Deprecation warning shown when using old field
 * 4. corsHelper takes precedence over cors
 * 5. Boolean shorthand works for both fields
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { configureMinder } from '../src/config/index.js';
import { PlatformDetector } from '../src/platform/PlatformDetector.js';
import { Platform } from '../src/constants/enums.js';

describe('CORS Helper Rename', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let originalDetect: typeof PlatformDetector.detect;

  beforeEach(() => {
    // Mock console.warn to capture deprecation warnings
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Save and mock platform detection (default to WEB)
    originalDetect = PlatformDetector.detect;
    PlatformDetector.detect = () => Platform.WEB;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    PlatformDetector.detect = originalDetect;
    PlatformDetector.reset();
  });

  describe('New corsHelper field', () => {
    it('should work with corsHelper field', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: {
          enabled: true,
          proxy: '/api',
          credentials: true,
        },
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(true);
      expect((config as any).corsHelper.proxy).toBe('/api');
      expect((config as any).corsHelper.credentials).toBe(true);
    });

    it('should throw when enabled via boolean shorthand because no proxy route is configured (B4)', () => {
      // B4 (fix-2.2.0-blockers, ratified): enabling corsHelper without
      // wiring a `proxy` route would silently rewrite every request to a
      // route that almost certainly doesn't exist in the app — a 404 on
      // every call. Boolean shorthand `true` has no way to express a proxy,
      // so on its own it can no longer produce a working config.
      expect(() =>
        configureMinder({
          apiUrl: 'https://api.example.com',
          corsHelper: true,
        })
      ).toThrow(/no `proxy` route was configured/);
    });

    it('should default credentials to false for corsHelper boolean-shorthand semantics once a proxy is configured', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(true);
      // G-05: flipped true->false — boolean shorthand only means "enable",
      // credentials must be opted into explicitly (M0-01 opt-in contract).
      expect((config as any).corsHelper.credentials).toBe(false);
    });

    it('should work with corsHelper boolean shorthand (false)', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: false,
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(false);
    });

    it('should NOT show deprecation warning for corsHelper', () => {
      // B4: enabling corsHelper requires a `proxy` route now (see the
      // "throw when enabled via boolean shorthand" test above); add one so
      // this test can observe the (absence of a) deprecation warning.
      configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Backward compatibility with old cors field', () => {
    it('should still work with old cors field', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: {
          enabled: true,
          proxy: '/api',
        },
      });

      // Should populate both fields for compatibility
      expect(config.cors).toBeDefined();
      expect(config.cors?.enabled).toBe(true);
      expect(config.cors?.proxy).toBe('/api');
      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(true);
      expect((config as any).corsHelper.proxy).toBe('/api');
    });

    it('should show deprecation warning when using old cors field', () => {
      // B4: enabling cors requires a `proxy` route now (see the boolean
      // shorthand throw test below); add one so this test can observe the
      // deprecation warning without configureMinder() throwing first.
      configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Minder] DEPRECATION WARNING: config.cors is deprecated')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Please use config.corsHelper instead')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('this config does NOT bypass CORS restrictions')
      );
    });

    it('should throw when cors is enabled via boolean shorthand because no proxy route is configured (B4)', () => {
      // B4 (fix-2.2.0-blockers, ratified): enabling cors without wiring a
      // `proxy` route would silently rewrite every request to a route that
      // almost certainly doesn't exist. Boolean shorthand `true` has no way
      // to express a proxy, so on its own it can no longer produce a
      // working config.
      expect(() =>
        configureMinder({
          apiUrl: 'https://api.example.com',
          cors: true,
        })
      ).toThrow(/no `proxy` route was configured/);
    });

    it('should default credentials to false for cors boolean-shorthand semantics once a proxy is configured', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect(config.cors?.enabled).toBe(true);
      // G-05: flipped true->false (both mirrors) — boolean shorthand only
      // means "enable", credentials must be opted into explicitly (M0-01).
      expect(config.cors?.credentials).toBe(false);
      expect((config as any).corsHelper.enabled).toBe(true);
      expect((config as any).corsHelper.credentials).toBe(false);
    });

    it('should work with cors boolean shorthand (false)', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: false,
      });

      expect(config.cors?.enabled).toBe(false);
      expect((config as any).corsHelper.enabled).toBe(false);
    });
  });

  describe('Precedence: corsHelper takes priority', () => {
    it('should use corsHelper when both cors and corsHelper provided', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: {
          enabled: false, // Old field
        },
        corsHelper: {
          enabled: true, // New field - should win
          proxy: '/api',
        },
      });

      expect((config as any).corsHelper.enabled).toBe(true);
      expect((config as any).corsHelper.proxy).toBe('/api');
      
      // Should NOT show deprecation warning because corsHelper is used
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should use corsHelper even if cors comes first in object', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: true, // Old field first
        corsHelper: false, // New field second - should win
      });

      expect((config as any).corsHelper.enabled).toBe(false);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Default values', () => {
    it('should have corsHelper disabled by default for React Native', () => {
      PlatformDetector.detect = () => Platform.REACT_NATIVE;
      
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(false);
    });

    it('should have corsHelper disabled by default for Expo', () => {
      PlatformDetector.detect = () => Platform.EXPO;
      
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(false);
    });

    it('should have corsHelper disabled by default for Electron', () => {
      PlatformDetector.detect = () => Platform.ELECTRON;
      
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(false);
    });

    it('should have corsHelper disabled by default for Node.js', () => {
      PlatformDetector.detect = () => Platform.NODE;
      
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
      });

      expect((config as any).corsHelper).toBeDefined();
      expect((config as any).corsHelper.enabled).toBe(false);
    });
  });

  describe('Advanced corsHelper configuration', () => {
    it('should support all corsHelper fields', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: {
          enabled: true,
          proxy: '/api/proxy',
          credentials: true,
          origin: 'https://example.com',
          methods: ['GET', 'POST', 'PUT'],
          headers: ['Content-Type', 'Authorization'],
        },
      });

      const helper = (config as any).corsHelper;
      expect(helper.enabled).toBe(true);
      expect(helper.proxy).toBe('/api/proxy');
      expect(helper.credentials).toBe(true);
      expect(helper.origin).toBe('https://example.com');
      expect(helper.methods).toEqual(['GET', 'POST', 'PUT']);
      expect(helper.headers).toEqual(['Content-Type', 'Authorization']);
    });

    // G-05: renamed (was "should default credentials to true when enabled")
    // and flipped true->false — that name asserted the exact bug this fix
    // removes. `enabled: true` alone is not an opinion on credentials;
    // opt-in requires an explicit `credentials: true` (M0-01 contract).
    it('should default credentials to false when enabled without an explicit opinion', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        // B4: enabling corsHelper requires a `proxy` route now.
        corsHelper: {
          enabled: true,
          proxy: '/api/minder-proxy',
        },
      });

      expect((config as any).corsHelper.credentials).toBe(false);
    });

    it('should allow credentials to be explicitly false', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        // B4: enabling corsHelper requires a `proxy` route now.
        corsHelper: {
          enabled: true,
          proxy: '/api/minder-proxy',
          credentials: false,
        },
      });

      expect((config as any).corsHelper.credentials).toBe(false);
    });
  });
});
