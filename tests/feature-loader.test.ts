/**
 * Feature Loader Tests
 * Tests for dynamic feature loading and bundle optimization
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FeatureLoader, createFeatureLoader } from '../src/core/FeatureLoader';
import type { MinderConfig } from '../src/core/types';

describe('FeatureLoader', () => {
  describe('Feature Detection', () => {
    it('should detect auth feature from config', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: {
          enabled: true,
          tokenKey: 'access_token',
        },
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.auth).toBe(true);
    });

    it('should detect cache feature from config', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        cache: {
          enabled: true,
          ttl: 5000,
        },
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.cache).toBe(true);
    });

    it('should detect websocket feature from config', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        websocket: {
          enabled: true,
          url: 'ws://localhost:3000',
        },
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.websocket).toBe(true);
    });

    it('should detect devtools from debug mode', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        debug: true,
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      // Devtools enabled if debug is true and in development
      expect(typeof features.devtools).toBe('boolean');
    });

    it('should detect storage from cache storage config', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        cache: {
          enabled: true,
          storage: 'localStorage',
        },
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.storage).toBe(true);
    });

    it('should detect logger from debug config', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        debug: true,
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.logger).toBe(true);
    });

    it('should not detect disabled features', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({ config });
      const features = loader.getFeatures();

      expect(features.auth).toBe(false);
      expect(features.cache).toBe(false);
      expect(features.websocket).toBe(false);
    });
  });

  describe('Feature Management', () => {
    let loader: FeatureLoader;

    beforeEach(() => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
        cache: { enabled: true },
        debug: true,
      };

      loader = new FeatureLoader({ config, lazy: false });
    });

    it('should return feature flags', () => {
      const features = loader.getFeatures();

      expect(typeof features).toBe('object');
      expect(features).toHaveProperty('auth');
      expect(features).toHaveProperty('cache');
      expect(features).toHaveProperty('websocket');
    });

    it('should check if feature is enabled', () => {
      expect(loader.isEnabled('auth')).toBe(true);
      expect(loader.isEnabled('cache')).toBe(true);
      expect(loader.isEnabled('websocket')).toBe(false);
    });

    it('should get list of enabled features', () => {
      const enabled = loader.getEnabledFeatures();

      expect(Array.isArray(enabled)).toBe(true);
      expect(enabled).toContain('auth');
      expect(enabled).toContain('cache');
      expect(enabled).toContain('logger');
      expect(enabled).not.toContain('websocket');
    });

    it('should track loaded modules', () => {
      expect(loader.isLoaded('auth')).toBe(false);
      expect(loader.isLoaded('cache')).toBe(false);
    });
  });

  describe('Loading Statistics', () => {
    it('should provide loading stats', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
        cache: { enabled: true },
      };

      const loader = new FeatureLoader({ config });
      const stats = loader.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('loaded');
      expect(stats).toHaveProperty('loading');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('features');

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBeGreaterThanOrEqual(2); // auth + cache
    });

    it('should track feature states in stats', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = new FeatureLoader({ config });
      const stats = loader.getStats();

      expect(stats.features.enabled).toContain('auth');
      expect(stats.features.loaded).toEqual([]);
      expect(stats.features.loading).toEqual([]);
    });
  });

  describe('Bundle Size Estimation', () => {
    it('should estimate minimal bundle size', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({ config });
      const size = loader.estimateBundleSize();

      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(30); // Base size should be small
    });

    it('should estimate size with auth feature', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = new FeatureLoader({ config });
      const size = loader.estimateBundleSize();

      expect(size).toBeGreaterThan(15); // Base + auth
    });

    it('should estimate size with multiple features', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
        cache: { enabled: true },
        websocket: { enabled: true, url: 'ws://localhost' },
        debug: true,
      };

      const loader = new FeatureLoader({ config });
      const size = loader.estimateBundleSize();

      expect(size).toBeGreaterThan(40); // Multiple features
    });

    it('should estimate larger size for devtools', () => {
      const configWithDevtools: any = {
        baseURL: 'https://api.example.com',
        devtools: { enabled: true },
      };

      const configWithoutDevtools: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loaderWith = new FeatureLoader({ config: configWithDevtools });
      const loaderWithout = new FeatureLoader({ config: configWithoutDevtools });

      expect(loaderWith.estimateBundleSize()).toBeGreaterThan(
        loaderWithout.estimateBundleSize()
      );
    });
  });

  describe('Factory Functions', () => {
    it('should create minimal loader', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
        cache: { enabled: true },
      };

      const loader = FeatureLoader.createMinimal(config);
      const features = loader.getFeatures();

      // Should disable optional features
      expect(features.auth).toBe(false);
      expect(features.cache).toBe(false);
    });

    it('should create full-featured loader', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = FeatureLoader.createFull(config);
      const features = loader.getFeatures();

      // Should enable all features
      expect(features.auth).toBe(true);
      expect(features.cache).toBe(true);
      expect(features.websocket).toBe(true);
      expect(features.devtools).toBe(true);
    });

    it('should create loader via helper function', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = createFeatureLoader(config);

      expect(loader).toBeInstanceOf(FeatureLoader);
      expect(loader.isEnabled('auth')).toBe(true);
    });

    it('should accept options in helper function', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = createFeatureLoader(config, {
        autoDetect: false,
        lazy: false,
      });

      expect(loader).toBeInstanceOf(FeatureLoader);
    });
  });

  describe('Module Management', () => {
    it('should initialize with empty modules', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({ config });
      const modules = loader.getModules();

      expect(Object.keys(modules).length).toBe(0);
    });

    it('should track module loading state', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = new FeatureLoader({ config });

      expect(loader.isLoaded('auth')).toBe(false);
      expect(loader.getModule('AuthManager')).toBeUndefined();
    });

    it('should reset loader state', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = new FeatureLoader({ config });
      
      loader.reset();

      const modules = loader.getModules();
      expect(Object.keys(modules).length).toBe(0);
    });
  });

  describe('Platform Integration', () => {
    it('should auto-detect platform when enabled', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({
        config,
        autoDetect: true,
      });

      // Should not throw
      expect(loader.getFeatures()).toBeDefined();
    });

    it('should skip platform detection when disabled', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({
        config,
        autoDetect: false,
      });

      // Should not throw
      expect(loader.getFeatures()).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown features gracefully', async () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({ config });

      await expect(loader.loadFeature('unknown-feature')).rejects.toThrow(
        'Unknown feature: unknown-feature'
      );
    });

    it('should handle offline feature (not yet implemented)', async () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const loader = new FeatureLoader({ config });

      await expect(loader.loadFeature('offline')).rejects.toThrow(
        'Offline support not yet implemented'
      );
    });
  });

  describe('Bundle Optimization', () => {
    it('should estimate different sizes for different configs', () => {
      const minimalConfig: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
      };

      const fullConfig: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
        cache: { enabled: true },
        websocket: { enabled: true, url: 'ws://localhost' },
        debug: true,
      };

      const minimalLoader = new FeatureLoader({ config: minimalConfig });
      const fullLoader = new FeatureLoader({ config: fullConfig });

      expect(fullLoader.estimateBundleSize()).toBeGreaterThan(
        minimalLoader.estimateBundleSize()
      );
    });

    it('should provide size estimates in KB', () => {
      const config: any = {
        baseURL: 'https://api.example.com',
        auth: { enabled: true },
      };

      const loader = new FeatureLoader({ config });
      const size = loader.estimateBundleSize();

      // Should be reasonable KB values
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(200); // Not unreasonably large
    });
  });
});

