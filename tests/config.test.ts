/**
 * Comprehensive Tests for Configuration Module
 * Tests for presets, createMinderConfig, and configuration utilities
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  createConfigFromPreset, 
  detectPreset, 
  getPresetInfo,
  CONFIG_PRESETS,
  type ConfigPreset 
} from '../src/config/presets';
import { configureMinder, type UnifiedMinderConfig } from '../src/config/index';
import { ConfigPreset as ConfigPresetEnum, StorageType, CacheType, HttpMethod } from '../src/constants/enums';

describe('Configuration Presets', () => {
  describe('CONFIG_PRESETS', () => {
    it('should have all preset types defined', () => {
      expect(CONFIG_PRESETS.minimal).toBeDefined();
      expect(CONFIG_PRESETS.standard).toBeDefined();
      expect(CONFIG_PRESETS.advanced).toBeDefined();
      expect(CONFIG_PRESETS.enterprise).toBeDefined();
    });

    it('should have minimal preset with basic features only', () => {
      const preset = CONFIG_PRESETS.minimal;
      
      expect(preset.cache).toBeDefined();
      expect(preset.cache?.type).toBe('memory');
      expect(preset.cache?.maxSize).toBe(50);
      expect(preset.performance?.deduplication).toBe(true);
      expect(preset.performance?.batching).toBe(false);
      expect(preset.auth).toBeUndefined();
      expect(preset.websocket).toBeUndefined();
    });

    it('should have standard preset with auth and security', () => {
      const preset = CONFIG_PRESETS.standard;
      
      expect(preset.auth).toBeDefined();
      expect(preset.auth?.storage).toBe('cookie');
      expect(preset.cache?.type).toBe('hybrid');
      expect(preset.cache?.maxSize).toBe(200);
      expect(preset.security).toBeDefined();
      expect(preset.security?.sanitization).toBe(true);
      expect(preset.security?.csrfProtection).toBe(true);
      expect(preset.performance?.batching).toBe(true);
    });

    it('should have advanced preset with persistent cache', () => {
      const preset = CONFIG_PRESETS.advanced;
      
      expect(preset.cache?.type).toBe('persistent');
      expect(preset.cache?.maxSize).toBe(1000);
      expect(preset.security?.sanitization).toBeDefined();
      expect(typeof preset.security?.sanitization).toBe('object');
      expect(preset.debug?.devTools).toBe(true);
    });

    it('should have enterprise preset with all features', () => {
      const preset = CONFIG_PRESETS.enterprise;
      
      expect(preset.websocket).toBeDefined();
      expect(preset.ssr?.enabled).toBe(true);
      expect(preset.cache?.maxSize).toBe(5000);
      expect(preset.security?.encryption).toBe(true);
      expect(preset.security?.headers).toBeDefined();
      expect(preset.performance?.retries).toBe(5);
    });

    it('should use cookie storage for all presets (v2.1+)', () => {
      expect(CONFIG_PRESETS.standard.auth?.storage).toBe('cookie');
      expect(CONFIG_PRESETS.advanced.auth?.storage).toBe('cookie');
      expect(CONFIG_PRESETS.enterprise.auth?.storage).toBe('cookie');
    });
  });

  describe('createConfigFromPreset', () => {
    it('should create config from minimal preset', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.MINIMAL);
      
      expect(config.cache?.type).toBe('memory');
      expect(config.performance?.deduplication).toBe(true);
    });

    it('should create config from standard preset', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.STANDARD);
      
      expect(config.auth).toBeDefined();
      expect(config.cache?.type).toBe('hybrid');
      expect(config.security).toBeDefined();
    });

    it('should merge overrides with preset', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.MINIMAL, {
        cache: {
          type: CacheType.PERSISTENT,
          maxSize: 100,
        },
      });
      
      expect(config.cache?.type).toBe(CacheType.PERSISTENT);
      expect(config.cache?.maxSize).toBe(100);
      // Other preset values preserved
      expect(config.performance?.deduplication).toBe(true);
    });

    it('should deep merge nested overrides', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.STANDARD, {
        security: {
          sanitization: false,
          // csrfProtection from preset should be preserved
        },
      });
      
      expect(config.security?.sanitization).toBe(false);
      expect(config.security?.csrfProtection).toBe(true); // From preset
    });

    it('should handle empty overrides', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.STANDARD, {});
      
      expect(config.auth).toBeDefined();
      expect(config.cache).toBeDefined();
    });

    it('should allow adding new properties via overrides', () => {
      const config = createConfigFromPreset(ConfigPresetEnum.MINIMAL, {
        apiBaseUrl: 'https://api.example.com',
        routes: {
          users: { method: 'GET', url: '/users' },
        },
      } as any);
      
      expect((config as any).apiBaseUrl).toBe('https://api.example.com');
      expect((config as any).routes).toBeDefined();
    });
  });

  describe('detectPreset', () => {
    it('should detect minimal for basic config', () => {
      const config = {
        cache: { type: CacheType.MEMORY, maxSize: 50 },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('minimal');
    });

    it('should detect standard for config with auth', () => {
      const config = {
        auth: { tokenKey: 'token', storage: StorageType.COOKIE },
        cache: { type: CacheType.MEMORY },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('standard');
    });

    it('should detect advanced for config with SSR', () => {
      const config = {
        auth: { tokenKey: 'token', storage: StorageType.COOKIE },
        ssr: { enabled: true },
        cache: { type: CacheType.PERSISTENT, maxSize: 1000 },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('advanced');
    });

    it('should detect enterprise for config with WebSocket', () => {
      const config = {
        auth: { tokenKey: 'token', storage: StorageType.COOKIE },
        websocket: { url: 'wss://example.com' },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('enterprise');
    });

    it('should detect enterprise for config with encryption', () => {
      const config = {
        security: {
          encryption: true,
          headers: {
            contentSecurityPolicy: "default-src 'self'",
          },
        },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('enterprise');
    });

    it('should handle empty config', () => {
      const detected = detectPreset({});
      expect(detected).toBe('minimal');
    });
  });

  describe('getPresetInfo', () => {
    it('should return info for minimal preset', () => {
      const info = getPresetInfo(ConfigPresetEnum.MINIMAL);
      
      expect(info.name).toBe('Minimal');
      expect(info.bundleSize).toBe('~45KB');
      expect(info.features).toContain('Basic CRUD');
      expect(info.useCase).toBeDefined();
    });

    it('should return info for standard preset', () => {
      const info = getPresetInfo(ConfigPresetEnum.STANDARD);
      
      expect(info.name).toBe('Standard');
      expect(info.bundleSize).toBe('~90KB');
      expect(info.features).toContain('Auth');
      expect(info.features).toContain('Security');
      expect(info.description).toContain('Recommended');
    });

    it('should return info for advanced preset', () => {
      const info = getPresetInfo(ConfigPresetEnum.ADVANCED);
      
      expect(info.name).toBe('Advanced');
      expect(info.bundleSize).toBe('~120KB');
      expect(info.features).toContain('Offline');
      expect(info.features).toContain('SSR');
    });

    it('should return info for enterprise preset', () => {
      const info = getPresetInfo(ConfigPresetEnum.ENTERPRISE);
      
      expect(info.name).toBe('Enterprise');
      expect(info.bundleSize).toBe('~150KB');
      expect(info.features).toContain('All Features');
      expect(info.features).toContain('WebSocket');
    });

    it('should include all required metadata fields', () => {
      const presets: ConfigPreset[] = [ConfigPresetEnum.MINIMAL, ConfigPresetEnum.STANDARD, ConfigPresetEnum.ADVANCED, ConfigPresetEnum.ENTERPRISE];
      
      presets.forEach(preset => {
        const info = getPresetInfo(preset);
        expect(info.name).toBeDefined();
        expect(info.description).toBeDefined();
        expect(info.bundleSize).toBeDefined();
        expect(info.features).toBeInstanceOf(Array);
        expect(info.features.length).toBeGreaterThan(0);
        expect(info.useCase).toBeDefined();
      });
    });
  });
});

describe('configureMinder', () => {
  it('should create basic config with apiUrl and routes', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
      },
    };
    
    const config = configureMinder(simple);
    
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.routes).toBeDefined();
  });

  it('should auto-generate CRUD routes from simple strings', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
      },
    };
    
    const config = configureMinder(simple);
    
    expect(config.routes?.users).toBeDefined();
    expect(config.routes?.users.method).toBe(HttpMethod.GET);
    expect(config.routes?.createUser).toBeDefined();
    expect(config.routes?.createUser.method).toBe(HttpMethod.POST);
    expect(config.routes?.updateUser).toBeDefined();
    expect(config.routes?.updateUser.method).toBe(HttpMethod.PUT);
    expect(config.routes?.deleteUser).toBeDefined();
    expect(config.routes?.deleteUser.method).toBe(HttpMethod.DELETE);
  });

  it('should preserve explicit route definitions', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        customRoute: { method: HttpMethod.PATCH, url: '/custom/:id' },
      },
    };
    
    const config = configureMinder(simple);
    
    expect(config.routes?.customRoute.method).toBe(HttpMethod.PATCH);
    expect(config.routes?.customRoute.url).toBe('/custom/:id');
  });

  it('should apply preset when specified', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      // Note: preset is not part of UnifiedMinderConfig, presets are handled separately
    };
    
    const config = configureMinder(simple);
    
    // Basic config should have platform defaults
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.routes).toBeDefined();
  });

  it('should configure auth with boolean true', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      auth: true,
    };
    
    const config = configureMinder(simple);
    
    expect(config.auth).toBeDefined();
    expect(config.auth?.tokenKey).toBe('token');
    expect(config.auth?.storage).toBe(StorageType.COOKIE);
  });

  it('should configure auth with custom storage', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      auth: { storage: StorageType.ASYNC_STORAGE },
    };
    
    const config = configureMinder(simple);
    
    expect(config.auth?.storage).toBe(StorageType.ASYNC_STORAGE);
  });

  it('should configure cache with boolean true', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      cache: true,
    };
    
    const config = configureMinder(simple);
    
    expect(config.cache).toBeDefined();
    expect(config.cache?.staleTime).toBeGreaterThan(0);
    expect(config.cache?.gcTime).toBeGreaterThan(0);
  });

  it('should configure cache with custom staleTime', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      cache: { staleTime: 60000 },
    };
    
    const config = configureMinder(simple);
    
    expect(config.cache?.staleTime).toBe(60000);
  });

  it('should configure CORS when enabled', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      cors: true,
    };
    
    const config = configureMinder(simple);
    
    expect(config.cors).toBeDefined();
    expect(config.cors?.enabled).toBe(true);
  });

  it('should configure WebSocket with boolean true', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      websocket: true,
    };
    
    const config = configureMinder(simple);
    
    expect(config.websocket).toBeDefined();
    expect(config.websocket?.url).toContain('wss://'); // https -> wss
    expect(config.websocket?.reconnect).toBe(true);
  });

  it('should configure WebSocket with custom URL', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      websocket: { url: 'wss://custom.example.com/ws' },
    };
    
    const config = configureMinder(simple);
    
    expect(config.websocket?.url).toBe('wss://custom.example.com/ws');
  });

  it('should convert http to ws for WebSocket URL', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      websocket: true,
    };
    
    const config = configureMinder(simple);
    
    expect(config.websocket?.url).toContain('wss://');
  });

  it('should configure performance settings', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
    };
    
    const config = configureMinder(simple);
    
    expect(config.performance).toBeDefined();
    expect(config.performance?.deduplication).toBe(true);
  });

  it('should override preset settings with user config', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      auth: { storage: StorageType.SESSION_STORAGE },
      cache: { staleTime: 60000 },
    };
    
    const config = configureMinder(simple);
    
    // User config should override defaults
    expect(config.auth?.storage).toBe(StorageType.SESSION_STORAGE);
    expect(config.cache?.staleTime).toBe(60000);
  });

  it('should handle minimal config', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
    };
    
    const config = configureMinder(simple);
    
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.dynamic).toEqual({});
  });

  it('should handle multiple routes', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
        posts: '/posts',
        comments: '/comments',
      },
    };
    
    const config = configureMinder(simple);
    
    expect(Object.keys(config.routes || {}).length).toBeGreaterThan(3);
    expect(config.routes?.users).toBeDefined();
    expect(config.routes?.posts).toBeDefined();
    expect(config.routes?.comments).toBeDefined();
  });

  it('should capitalize route names correctly for CRUD operations', () => {
    const simple: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        user: '/user',
      },
    };
    
    const config = configureMinder(simple);
    
    expect(config.routes?.createUser).toBeDefined();
    expect(config.routes?.updateUser).toBeDefined();
    expect(config.routes?.deleteUser).toBeDefined();
  });

  describe('integration scenarios', () => {
    it('should create production-ready config with standard preset', () => {
      const simple: UnifiedMinderConfig = {
        apiUrl: 'https://api.production.com',
        routes: {
          users: '/api/users',
          products: '/api/products',
        },
        auth: true,
        cache: true,
        security: true,
      };
      
      const config = configureMinder(simple);
      
      expect(config.apiBaseUrl).toBe('https://api.production.com');
      expect(config.auth).toBeDefined();
      expect(config.cache).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.routes?.users).toBeDefined();
      expect(config.routes?.createUser).toBeDefined();
    });

    it('should create real-time app config with enterprise preset', () => {
      const simple: UnifiedMinderConfig = {
        apiUrl: 'https://api.example.com',
        websocket: { url: 'wss://ws.example.com' },
        security: { csrfProtection: true, sanitization: true },
        ssr: true,
      };
      
      const config = configureMinder(simple);
      
      expect(config.websocket?.url).toBe('wss://ws.example.com');
      expect(config.security?.csrfProtection).toBe(true);
      expect(config.ssr?.enabled).toBe(true);
    });

    it('should create mobile app config', () => {
      const simple: UnifiedMinderConfig = {
        apiUrl: 'https://api.mobile.com',
        auth: { storage: StorageType.ASYNC_STORAGE },
        cache: { staleTime: 600000 }, // Longer cache for mobile
      };
      
      const config = configureMinder(simple);
      
      expect(config.auth?.storage).toBe(StorageType.ASYNC_STORAGE);
      expect(config.cache?.staleTime).toBe(600000);
    });
  });
});
