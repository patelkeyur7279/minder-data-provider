/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EnvironmentManager } from '../src/core/EnvironmentManager';
import { MinderConfigError } from '../src/errors';
import type { MinderConfig } from '../src/core/types';

describe('EnvironmentManager', () => {
  let originalLocation: Location;
  let originalProcess: any;

  beforeEach(() => {
    // Save original values
    originalLocation = window.location;
    originalProcess = (globalThis as any).process;
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    (globalThis as any).process = originalProcess;
  });

  describe('constructor and environment detection', () => {
    it('should detect development environment from localhost', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('development');
    });

    it('should detect development environment from 127.0.0.1', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: '127.0.0.1' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('development');
    });

    it('should detect staging environment from staging hostname', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'staging.example.com' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('staging');
    });

    it('should detect staging environment from dev hostname', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'dev.example.com' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('staging');
    });

    it('should detect production environment from production hostname', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('production');
    });

    it('should use default environment when autoDetect is disabled', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'staging',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('staging');
    });

    it('should default to development when no defaultEnvironment is set', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('development');
    });

    it('should detect environment from NODE_ENV in server-side', () => {
      // Remove window to simulate server-side
      const originalWindow = (globalThis as any).window;
      delete (globalThis as any).window;

      // Set NODE_ENV
      (globalThis as any).process = { env: { NODE_ENV: 'development' } };

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('development');

      // Restore window
      (globalThis as any).window = originalWindow;
    });

    it('should detect test environment from NODE_ENV', () => {
      const originalWindow = (globalThis as any).window;
      delete (globalThis as any).window;

      (globalThis as any).process = { env: { NODE_ENV: 'test' } };

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('test');

      (globalThis as any).window = originalWindow;
    });

    it('should default to production in server-side without NODE_ENV', () => {
      const originalWindow = (globalThis as any).window;
      delete (globalThis as any).window;

      (globalThis as any).process = { env: {} };

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('production');

      (globalThis as any).window = originalWindow;
    });
  });

  describe('getCurrentEnvironment', () => {
    it('should return the current environment', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'production',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getCurrentEnvironment()).toBe('production');
    });
  });

  describe('setEnvironment', () => {
    it('should set a new environment', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        environments: {
          development: { apiBaseUrl: 'http://dev.api.example.com' },
          production: { apiBaseUrl: 'http://api.example.com' },
        },
      };

      const manager = new EnvironmentManager(config);
      manager.setEnvironment('production');
      expect(manager.getCurrentEnvironment()).toBe('production');
    });

    it('should throw error when setting non-existent environment', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        environments: {
          development: { apiBaseUrl: 'http://dev.api.example.com' },
        },
      };

      const manager = new EnvironmentManager(config);
      
      expect(() => {
        manager.setEnvironment('production');
      }).toThrow(MinderConfigError);
    });

    it('should allow setting environment when no environments config exists', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
      };

      const manager = new EnvironmentManager(config);
      
      // Should not throw when no environments config
      expect(() => {
        manager.setEnvironment('custom');
      }).not.toThrow();
      
      expect(manager.getCurrentEnvironment()).toBe('custom');
    });
  });

  describe('getEnvironmentOverride', () => {
    it('should return environment override when available', () => {
      const envOverride = { apiBaseUrl: 'http://dev.api.example.com' };
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: envOverride,
        },
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getEnvironmentOverride()).toEqual(envOverride);
    });

    it('should return null when no environments config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getEnvironmentOverride()).toBeNull();
    });

    it('should return null when current environment not in config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'staging',
        environments: {
          development: { apiBaseUrl: 'http://dev.api.example.com' },
        },
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getEnvironmentOverride()).toBeNull();
    });
  });

  describe('getResolvedConfig', () => {
    it('should return base config when no environment override', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved).toEqual(config);
    });

    it('should merge environment override with base config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.apiBaseUrl).toBe('http://dev.api.example.com');
    });

    it('should use proxy URL when CORS is enabled', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            cors: {
              enabled: true,
              proxy: 'http://proxy.example.com',
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.apiBaseUrl).toBe('http://proxy.example.com');
    });

    it('should merge auth config with defaults', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        auth: {
          tokenKey: 'customToken',
        },
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            auth: {
              storage: 'cookie',
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.auth?.tokenKey).toBe('customToken');
      expect(resolved.auth?.storage).toBe('cookie');
    });

    it('should use secure default storage when no auth config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.auth?.storage).toBe('memory');
      expect(resolved.auth?.tokenKey).toBe('accessToken');
    });

    it('should merge cache config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        cache: {
          enabled: true,
          staleTime: 5000,
        },
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            cache: {
              gcTime: 10000,
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.cache?.enabled).toBe(true);
      expect(resolved.cache?.staleTime).toBe(5000);
      expect(resolved.cache?.gcTime).toBe(10000);
    });

    it('should build CORS config with defaults', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            cors: {
              enabled: true,
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.cors?.enabled).toBe(true);
      expect(resolved.cors?.credentials).toBe(true);
      expect(resolved.cors?.origin).toBe('*');
      expect(resolved.cors?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
      expect(resolved.cors?.headers).toEqual(['Content-Type', 'Authorization', 'X-Requested-With']);
    });

    it('should not add CORS defaults when CORS is disabled', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            cors: {
              enabled: false,
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.cors?.enabled).toBe(false);
      expect(resolved.cors?.credentials).toBeUndefined();
    });

    it('should preserve custom CORS config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            cors: {
              enabled: true,
              origin: 'http://example.com',
              methods: ['GET', 'POST'],
              credentials: false,
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      expect(resolved.cors?.origin).toBe('http://example.com');
      expect(resolved.cors?.methods).toEqual(['GET', 'POST']);
      expect(resolved.cors?.credentials).toBe(false);
    });
  });

  describe('getAllEnvironments', () => {
    it('should return all configured environments', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        environments: {
          development: { apiBaseUrl: 'http://dev.api.example.com' },
          staging: { apiBaseUrl: 'http://staging.api.example.com' },
          production: { apiBaseUrl: 'http://api.example.com' },
        },
      };

      const manager = new EnvironmentManager(config);
      const envs = manager.getAllEnvironments();
      
      expect(envs).toContain('development');
      expect(envs).toContain('staging');
      expect(envs).toContain('production');
      expect(envs.length).toBe(3);
    });

    it('should return current environment when no environments config', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'production',
      };

      const manager = new EnvironmentManager(config);
      const envs = manager.getAllEnvironments();
      
      expect(envs).toEqual(['production']);
    });
  });

  describe('isProduction', () => {
    it('should return true when environment is production', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'production',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.isProduction()).toBe(true);
    });

    it('should return false when environment is not production', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when environment is development', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.isDevelopment()).toBe(true);
    });

    it('should return false when environment is not development', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'production',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.isDevelopment()).toBe(false);
    });
  });

  describe('getDebugMode', () => {
    it('should return debug mode from environment override', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
            debug: true,
          },
        },
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getDebugMode()).toBe(true);
    });

    it('should return false when no debug mode in override', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        environments: {
          development: {
            apiBaseUrl: 'http://dev.api.example.com',
          },
        },
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getDebugMode()).toBe(false);
    });

    it('should return false when no environment override', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
      };

      const manager = new EnvironmentManager(config);
      expect(manager.getDebugMode()).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete multi-environment setup', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true,
        configurable: true,
      });

      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: true,
        environments: {
          development: {
            apiBaseUrl: 'http://localhost:3000',
            debug: true,
            cors: { enabled: true },
          },
          staging: {
            apiBaseUrl: 'http://staging.api.example.com',
            debug: false,
          },
          production: {
            apiBaseUrl: 'http://api.example.com',
            debug: false,
          },
        },
      };

      const manager = new EnvironmentManager(config);
      
      // Should auto-detect development
      expect(manager.getCurrentEnvironment()).toBe('development');
      expect(manager.isDevelopment()).toBe(true);
      expect(manager.isProduction()).toBe(false);
      expect(manager.getDebugMode()).toBe(true);
      
      // Switch to production
      manager.setEnvironment('production');
      expect(manager.getCurrentEnvironment()).toBe('production');
      expect(manager.isProduction()).toBe(true);
      expect(manager.getDebugMode()).toBe(false);
      
      const resolved = manager.getResolvedConfig();
      expect(resolved.apiBaseUrl).toBe('http://api.example.com');
    });

    it('should handle environment switching workflow', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        environments: {
          development: { apiBaseUrl: 'http://dev.api.example.com' },
          staging: { apiBaseUrl: 'http://staging.api.example.com' },
          production: { apiBaseUrl: 'http://api.example.com' },
        },
      };

      const manager = new EnvironmentManager(config);
      const allEnvs = manager.getAllEnvironments();
      
      expect(allEnvs.length).toBe(3);
      
      // Test each environment
      allEnvs.forEach(env => {
        manager.setEnvironment(env);
        expect(manager.getCurrentEnvironment()).toBe(env);
        
        const resolved = manager.getResolvedConfig();
        expect(resolved.apiBaseUrl).toBeTruthy();
      });
    });

    it('should handle complex CORS configuration', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'http://api.example.com',
        autoDetectEnvironment: false,
        defaultEnvironment: 'development',
        cors: {
          enabled: false,
        },
        environments: {
          development: {
            apiBaseUrl: 'http://localhost:3000/api',
            cors: {
              enabled: true,
              proxy: 'http://localhost:3000',
              origin: 'http://localhost:5173',
              credentials: true,
            },
          },
        },
      };

      const manager = new EnvironmentManager(config);
      const resolved = manager.getResolvedConfig();
      
      // Should use proxy for API URL
      expect(resolved.apiBaseUrl).toBe('http://localhost:3000');
      
      // Should have CORS config with defaults
      expect(resolved.cors?.enabled).toBe(true);
      expect(resolved.cors?.origin).toBe('http://localhost:5173');
      expect(resolved.cors?.credentials).toBe(true);
      expect(resolved.cors?.methods).toBeDefined();
      expect(resolved.cors?.headers).toBeDefined();
    });
  });
});
