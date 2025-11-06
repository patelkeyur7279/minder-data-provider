/**
 * Dynamic Feature Loader
 * Analyzes configuration and lazy-loads only required features
 * Enables tree-shaking and optimal bundle sizes
 */

import type { MinderConfig } from './types';
import { PlatformDetector } from '../platform/PlatformDetector';
import { PlatformCapabilityDetector } from '../platform/PlatformCapabilities';
import { MinderConfigError } from '../errors/index.js';

/**
 * Feature flags derived from configuration
 */
export interface FeatureFlags {
  // Core features
  auth: boolean;
  cache: boolean;
  websocket: boolean;
  upload: boolean;
  
  // Advanced features
  plugins: boolean;
  devtools: boolean;
  middleware: boolean;
  
  // Platform-specific
  ssr: boolean;
  offline: boolean;
  storage: boolean;
  
  // Debug features
  logger: boolean;
  performance: boolean;
}

/**
 * Lazy-loaded feature modules
 */
export interface FeatureModules {
  AuthManager?: any;
  CacheManager?: any;
  WebSocketManager?: any;
  UploadManager?: any;
  PluginManager?: any;
  DevTools?: any;
  SSRManager?: any;
  OfflineManager?: any;
  StorageAdapter?: any;
  Logger?: any;
  PerformanceMonitor?: any;
}

/**
 * Feature loader options
 */
export interface FeatureLoaderOptions {
  config: MinderConfig;
  autoDetect?: boolean; // Auto-detect platform capabilities
  preload?: string[]; // Features to preload immediately
  lazy?: boolean; // Enable lazy loading (default: true)
}

/**
 * Dynamic Feature Loader
 * Analyzes configuration and loads only required features
 */
export class FeatureLoader {
  private config: MinderConfig;
  private features: FeatureFlags;
  private modules: FeatureModules = {};
  private loadedModules = new Set<string>();
  private loadPromises = new Map<string, Promise<any>>();
  private autoDetect: boolean;
  private lazy: boolean;

  constructor(options: FeatureLoaderOptions) {
    this.config = options.config;
    this.autoDetect = options.autoDetect ?? true;
    this.lazy = options.lazy ?? true;
    this.features = this.analyzeFeatures();

    // Preload requested features
    if (options.preload && options.preload.length > 0) {
      this.preloadFeatures(options.preload);
    }
  }

  /**
   * Analyze configuration to determine required features
   */
  private analyzeFeatures(): FeatureFlags {
    const config = this.config as any;
    const platform = this.autoDetect ? PlatformDetector.detect() : null;
    const capabilities = platform 
      ? PlatformCapabilityDetector.getCapabilities(platform)
      : null;

    return {
      // Core features based on config
      auth: !!(
        config.auth?.enabled ||
        config.auth?.token ||
        config.auth?.tokenKey ||
        config.auth?.refreshToken
      ),
      
      cache: !!(
        config.cache?.enabled ||
        config.cache?.ttl ||
        config.cache?.storage ||
        config.caching // Legacy support
      ),
      
      websocket: !!(
        config.websocket?.enabled ||
        config.websocket?.url ||
        config.realtime // Legacy support
      ),
      
      upload: !!(
        config.upload?.enabled ||
        config.upload?.endpoint ||
        config.fileUpload // Legacy support
      ),

      // Advanced features
      plugins: !!(
        config.plugins?.enabled ||
        Array.isArray(config.plugins) && config.plugins.length > 0
      ),
      
      devtools: !!(
        config.devtools?.enabled ||
        (config.debug && process.env.NODE_ENV === 'development')
      ),
      
      middleware: !!(
        Array.isArray(config.middleware) && config.middleware.length > 0
      ),

      // Platform-specific features
      ssr: !!(
        (platform === 'nextjs' || platform === 'node') &&
        capabilities?.ssr &&
        (config.ssr?.enabled || config.prefetch)
      ),
      
      offline: !!(
        (platform === 'react-native' || platform === 'expo') &&
        capabilities?.offline &&
        config.offline?.enabled
      ),
      
      storage: !!(
        config.storage?.enabled ||
        config.cache?.storage ||
        config.persistence
      ),

      // Debug features
      logger: !!(
        config.logger?.enabled ||
        config.debug ||
        config.logging
      ),
      
      performance: !!(
        config.performance?.enabled ||
        config.metrics ||
        (config.devtools?.enabled && config.devtools?.trackPerformance)
      ),
    };
  }

  /**
   * Get feature flags
   */
  public getFeatures(): FeatureFlags {
    return { ...this.features };
  }

  /**
   * Check if a feature is enabled
   */
  public isEnabled(feature: keyof FeatureFlags): boolean {
    return this.features[feature];
  }

  /**
   * Get list of enabled features
   */
  public getEnabledFeatures(): string[] {
    return Object.entries(this.features)
      .filter(([_, enabled]) => enabled)
      .map(([feature]) => feature);
  }

  /**
   * Preload features immediately (before they're needed)
   */
  private async preloadFeatures(features: string[]): Promise<void> {
    const promises = features
      .filter(feature => this.isEnabled(feature as keyof FeatureFlags))
      .map(feature => this.loadFeature(feature));
    
    await Promise.all(promises);
  }

  /**
   * Load a specific feature module
   */
  public async loadFeature(feature: string): Promise<any> {
    // Return cached module if already loaded
    if (this.loadedModules.has(feature)) {
      return this.modules[feature as keyof FeatureModules];
    }

    // Return existing load promise if in progress
    if (this.loadPromises.has(feature)) {
      return this.loadPromises.get(feature);
    }

    // Create load promise
    const loadPromise = this.loadFeatureModule(feature);
    this.loadPromises.set(feature, loadPromise);

    try {
      const module = await loadPromise;
      this.modules[feature as keyof FeatureModules] = module;
      this.loadedModules.add(feature);
      this.loadPromises.delete(feature);
      return module;
    } catch (error) {
      this.loadPromises.delete(feature);
      throw error;
    }
  }

  /**
   * Dynamically import feature module
   */
  private async loadFeatureModule(feature: string): Promise<any> {
    if (!this.lazy) {
      // If lazy loading is disabled, import synchronously
      return this.loadFeatureSync(feature);
    }

    switch (feature) {
      case 'auth':
        return import('../auth/index.js').then(m => m.AuthManager || m);
      
      case 'cache':
        return import('../cache/index.js').then(m => m.CacheManager || m);
      
      case 'websocket':
        return import('../websocket/index.js').then(m => m.useWebSocket || m);
      
      case 'upload':
        return import('../upload/index.js').then(m => m.useMediaUpload || m);
      
      case 'plugins':
        return import('../plugins/index.js').then(m => m.PluginManager || m);
      
      case 'devtools':
        return import('../devtools/index.js').then(m => m.DevTools || m);
      
      case 'ssr':
        return import('../ssr/index.js').then(m => m.createSSRConfig || m);
      
      case 'offline':
        // Will be implemented in Phase 5
        throw new Error('Offline support not yet implemented');
      
      case 'storage':
        return import('../platform/adapters/storage/index.js').then(m => m.StorageAdapterFactory || m);
      
      case 'logger':
        return import('../debug/index.js').then(m => m.DebugManager || m);
      
      case 'performance':
        // Performance monitoring can use debug manager for now
        return import('../debug/index.js').then(m => m.DebugManager || m);
      
      default:
        throw new MinderConfigError(`Unknown feature: ${feature}`, 'UNKNOWN_FEATURE');
    }
  }

  /**
   * Synchronous feature loading (when lazy loading is disabled)
   */
  private loadFeatureSync(feature: string): any {
    // Note: This requires all features to be bundled
    // Used for testing or when bundle size is not a concern
    try {
      switch (feature) {
        case 'auth':
          return require('../auth');
        case 'cache':
          return require('../cache');
        case 'websocket':
          return require('../websocket');
        case 'upload':
          return require('../upload');
        case 'plugins':
          return require('../plugins');
        case 'devtools':
          return require('../devtools');
        case 'ssr':
          return require('../ssr');
        case 'storage':
          return require('../platform/adapters/storage');
        case 'logger':
        case 'performance':
          return require('../debug');
        default:
          throw new MinderConfigError(`Unknown feature: ${feature}`, 'UNKNOWN_FEATURE');
      }
    } catch (error) {
      throw new MinderConfigError(`Failed to load feature ${feature}: ${error}`, 'FEATURE_LOAD_FAILED');
    }
  }

  /**
   * Load all enabled features
   */
  public async loadAllFeatures(): Promise<FeatureModules> {
    const enabledFeatures = this.getEnabledFeatures();
    await Promise.all(
      enabledFeatures.map(feature => this.loadFeature(feature))
    );
    return this.modules;
  }

  /**
   * Get loaded modules
   */
  public getModules(): FeatureModules {
    return { ...this.modules };
  }

  /**
   * Get module for a specific feature
   */
  public getModule<K extends keyof FeatureModules>(
    feature: K
  ): FeatureModules[K] | undefined {
    return this.modules[feature];
  }

  /**
   * Check if a feature is loaded
   */
  public isLoaded(feature: string): boolean {
    return this.loadedModules.has(feature);
  }

  /**
   * Get loading statistics
   */
  public getStats() {
    const enabled = this.getEnabledFeatures();
    const loaded = Array.from(this.loadedModules);
    const loading = Array.from(this.loadPromises.keys());

    return {
      total: Object.keys(this.features).length,
      enabled: enabled.length,
      loaded: loaded.length,
      loading: loading.length,
      pending: enabled.filter(f => !loaded.includes(f) && !loading.includes(f)),
      features: {
        enabled,
        loaded,
        loading,
      },
    };
  }

  /**
   * Estimate bundle size based on enabled features
   * Returns size in KB (approximate)
   */
  public estimateBundleSize(): number {
    const baseSizeKB = 15; // Core bundle size
    const featureSizes: Record<string, number> = {
      auth: 8,
      cache: 12,
      websocket: 15,
      upload: 10,
      plugins: 5,
      devtools: 25,
      middleware: 3,
      ssr: 20,
      offline: 18,
      storage: 8,
      logger: 6,
      performance: 7,
    };

    let totalSize = baseSizeKB;
    for (const [feature, enabled] of Object.entries(this.features)) {
      if (enabled) {
        totalSize += featureSizes[feature] || 0;
      }
    }

    return totalSize;
  }

  /**
   * Reset loader (useful for testing)
   */
  public reset(): void {
    this.modules = {};
    this.loadedModules.clear();
    this.loadPromises.clear();
  }

  /**
   * Create a minimal feature loader (only core features)
   */
  public static createMinimal(config: MinderConfig): FeatureLoader {
    const minimalConfig: any = { ...config };
    // Disable all optional features
    delete minimalConfig.auth;
    delete minimalConfig.cache;
    delete minimalConfig.websocket;
    delete minimalConfig.plugins;
    delete minimalConfig.devtools;
    delete minimalConfig.ssr;
    
    return new FeatureLoader({
      config: minimalConfig,
      autoDetect: false,
      lazy: true,
    });
  }

  /**
   * Create a full-featured loader (all features enabled)
   */
  public static createFull(config: MinderConfig): FeatureLoader {
    const fullConfig: any = { ...config };
    
    // Enable all features
    fullConfig.auth = { enabled: true, ...((config as any).auth || {}) };
    fullConfig.cache = { enabled: true, ...((config as any).cache || {}) };
    fullConfig.websocket = { enabled: true, ...((config as any).websocket || {}) };
    fullConfig.plugins = { enabled: true, ...((config as any).plugins || {}) };
    fullConfig.devtools = { enabled: true, ...((config as any).devtools || {}) };
    fullConfig.ssr = { enabled: true, ...((config as any).ssr || {}) };
    
    return new FeatureLoader({
      config: fullConfig,
      autoDetect: true,
      lazy: false,
    });
  }
}

/**
 * Helper function to create feature loader from config
 */
export function createFeatureLoader(
  config: MinderConfig,
  options?: Partial<FeatureLoaderOptions>
): FeatureLoader {
  return new FeatureLoader({
    config,
    ...options,
  });
}

/**
 * Export types
 */
export type { MinderConfig };
