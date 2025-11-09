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
import { createMinderConfig, type SimpleConfig } from '../src/config/index';

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
      const config = createConfigFromPreset('minimal');
      
      expect(config.cache?.type).toBe('memory');
      expect(config.performance?.deduplication).toBe(true);
    });

    it('should create config from standard preset', () => {
      const config = createConfigFromPreset('standard');
      
      expect(config.auth).toBeDefined();
      expect(config.cache?.type).toBe('hybrid');
      expect(config.security).toBeDefined();
    });

    it('should merge overrides with preset', () => {
      const config = createConfigFromPreset('minimal', {
        cache: {
          type: 'persistent',
          maxSize: 100,
        },
      });
      
      expect(config.cache?.type).toBe('persistent');
      expect(config.cache?.maxSize).toBe(100);
      // Other preset values preserved
      expect(config.performance?.deduplication).toBe(true);
    });

    it('should deep merge nested overrides', () => {
      const config = createConfigFromPreset('standard', {
        security: {
          sanitization: false,
          // csrfProtection from preset should be preserved
        },
      });
      
      expect(config.security?.sanitization).toBe(false);
      expect(config.security?.csrfProtection).toBe(true); // From preset
    });

    it('should handle empty overrides', () => {
      const config = createConfigFromPreset('standard', {});
      
      expect(config.auth).toBeDefined();
      expect(config.cache).toBeDefined();
    });

    it('should allow adding new properties via overrides', () => {
      const config = createConfigFromPreset('minimal', {
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
        cache: { type: 'memory' as const, maxSize: 50 },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('minimal');
    });

    it('should detect standard for config with auth', () => {
      const config = {
        auth: { tokenKey: 'token', storage: 'cookie' as const },
        cache: { type: 'memory' as const },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('standard');
    });

    it('should detect advanced for config with SSR', () => {
      const config = {
        auth: { tokenKey: 'token', storage: 'cookie' as const },
        ssr: { enabled: true },
        cache: { type: 'persistent' as const, maxSize: 1000 },
      };
      
      const detected = detectPreset(config);
      expect(detected).toBe('advanced');
    });

    it('should detect enterprise for config with WebSocket', () => {
      const config = {
        auth: { tokenKey: 'token', storage: 'cookie' as const },
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
      const info = getPresetInfo('minimal');
      
      expect(info.name).toBe('Minimal');
      expect(info.bundleSize).toBe('~45KB');
      expect(info.features).toContain('Basic CRUD');
      expect(info.useCase).toBeDefined();
    });

    it('should return info for standard preset', () => {
      const info = getPresetInfo('standard');
      
      expect(info.name).toBe('Standard');
      expect(info.bundleSize).toBe('~90KB');
      expect(info.features).toContain('Auth');
      expect(info.features).toContain('Security');
      expect(info.description).toContain('Recommended');
    });

    it('should return info for advanced preset', () => {
      const info = getPresetInfo('advanced');
      
      expect(info.name).toBe('Advanced');
      expect(info.bundleSize).toBe('~120KB');
      expect(info.features).toContain('Offline');
      expect(info.features).toContain('SSR');
    });

    it('should return info for enterprise preset', () => {
      const info = getPresetInfo('enterprise');
      
      expect(info.name).toBe('Enterprise');
      expect(info.bundleSize).toBe('~150KB');
      expect(info.features).toContain('All Features');
      expect(info.features).toContain('WebSocket');
    });

    it('should include all required metadata fields', () => {
      const presets: ConfigPreset[] = ['minimal', 'standard', 'advanced', 'enterprise'];
      
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

describe('createMinderConfig', () => {
  it('should create basic config with apiUrl and routes', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
      },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.routes).toBeDefined();
  });

  it('should auto-generate CRUD routes from simple strings', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
      },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.routes?.users).toBeDefined();
    expect(config.routes?.users.method).toBe('GET');
    expect(config.routes?.createUsers).toBeDefined();
    expect(config.routes?.createUsers.method).toBe('POST');
    expect(config.routes?.updateUsers).toBeDefined();
    expect(config.routes?.updateUsers.method).toBe('PUT');
    expect(config.routes?.deleteUsers).toBeDefined();
    expect(config.routes?.deleteUsers.method).toBe('DELETE');
  });

  it('should preserve explicit route definitions', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        customRoute: { method: 'PATCH', url: '/custom/:id' },
      },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.routes?.customRoute.method).toBe('PATCH');
    expect(config.routes?.customRoute.url).toBe('/custom/:id');
  });

  it('should apply preset when specified', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      preset: 'standard',
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.auth).toBeDefined();
    expect(config.cache).toBeDefined();
    expect(config.security).toBeDefined();
  });

  it('should configure auth with boolean true', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      auth: true,
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.auth).toBeDefined();
    expect(config.auth?.tokenKey).toBe('accessToken');
    expect(config.auth?.storage).toBe('cookie');
  });

  it('should configure auth with custom storage', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      auth: { storage: 'AsyncStorage' },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.auth?.storage).toBe('AsyncStorage');
  });

  it('should configure cache with boolean true', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      cache: true,
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.cache).toBeDefined();
    expect(config.cache?.staleTime).toBe(300000);
    expect(config.cache?.gcTime).toBe(600000);
  });

  it('should configure cache with custom staleTime', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      cache: { staleTime: 60000 },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.cache?.staleTime).toBe(60000);
  });

  it('should configure CORS when enabled', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      cors: true,
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.cors).toBeDefined();
    expect(config.cors?.enabled).toBe(true);
    expect(config.cors?.credentials).toBe(true);
  });

  it('should configure WebSocket with boolean true', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      websocket: true,
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.websocket).toBeDefined();
    expect(config.websocket?.url).toContain('wss://'); // https -> wss
    expect(config.websocket?.reconnect).toBe(true);
  });

  it('should configure WebSocket with custom URL', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      websocket: 'wss://custom.example.com/ws',
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.websocket?.url).toBe('wss://custom.example.com/ws');
  });

  it('should convert http to ws for WebSocket URL', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      websocket: true,
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.websocket?.url).toContain('wss://');
  });

  it('should configure performance settings', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.performance).toBeDefined();
    expect(config.performance?.deduplication).toBe(true);
  });

  it('should override preset settings with user config', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      preset: 'minimal',
      auth: { storage: 'sessionStorage' },
      cache: { staleTime: 60000 },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    // User config should override preset
    expect(config.auth?.storage).toBe('sessionStorage');
    expect(config.cache?.staleTime).toBe(60000);
    
    // Preset base should still be there
    expect(config.performance?.deduplication).toBe(true);
  });

  it('should handle minimal config', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.dynamic).toEqual({});
  });

  it('should handle multiple routes', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        users: '/users',
        posts: '/posts',
        comments: '/comments',
      },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(Object.keys(config.routes || {}).length).toBeGreaterThan(3);
    expect(config.routes?.users).toBeDefined();
    expect(config.routes?.posts).toBeDefined();
    expect(config.routes?.comments).toBeDefined();
  });

  it('should capitalize route names correctly for CRUD operations', () => {
    const simple: SimpleConfig = {
      apiUrl: 'https://api.example.com',
      routes: {
        user: '/user',
      },
      dynamic: {},
    };
    
    const config = createMinderConfig(simple);
    
    expect(config.routes?.createUser).toBeDefined();
    expect(config.routes?.updateUser).toBeDefined();
    expect(config.routes?.deleteUser).toBeDefined();
  });

  describe('integration scenarios', () => {
    it('should create production-ready config with standard preset', () => {
      const simple: SimpleConfig = {
        apiUrl: 'https://api.production.com',
        preset: 'standard',
        routes: {
          users: '/api/users',
          products: '/api/products',
        },
        dynamic: { version: 'v1' },
      };
      
      const config = createMinderConfig(simple);
      
      expect(config.apiBaseUrl).toBe('https://api.production.com');
      expect(config.auth).toBeDefined();
      expect(config.cache).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.routes?.users).toBeDefined();
      expect(config.routes?.createUsers).toBeDefined();
    });

    it('should create real-time app config with enterprise preset', () => {
      const simple: SimpleConfig = {
        apiUrl: 'https://api.example.com',
        preset: 'enterprise',
        websocket: 'wss://ws.example.com',
        dynamic: {},
      };
      
      const config = createMinderConfig(simple);
      
      expect(config.websocket?.url).toBe('wss://ws.example.com');
      expect(config.security?.encryption).toBe(true);
      expect(config.ssr?.enabled).toBe(true);
    });

    it('should create mobile app config', () => {
      const simple: SimpleConfig = {
        apiUrl: 'https://api.mobile.com',
        preset: 'standard',
        auth: { storage: 'AsyncStorage' },
        cache: { staleTime: 600000 }, // Longer cache for mobile
        dynamic: { platform: 'mobile' },
      };
      
      const config = createMinderConfig(simple);
      
      expect(config.auth?.storage).toBe('AsyncStorage');
      expect(config.cache?.staleTime).toBe(600000);
    });
  });
});
