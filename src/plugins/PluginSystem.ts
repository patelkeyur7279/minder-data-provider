/**
 * Plugin System
 * Extensible plugin architecture for Minder Data Provider
 */

import { Logger, LogLevel } from '../utils/Logger.js';

/**
 * Capabilities a plugin can declare (used for introspection + lazy loading).
 */
export type MinderCapability =
  | 'crash-reporting'
  | 'analytics'
  | 'payments'
  | 'auth-provider'
  | 'storage'
  | 'upload'
  | 'transport';

/**
 * Optional declarative metadata for a plugin (additive — never required).
 */
export interface PluginManifest {
  name: string;
  version?: string;
  capabilities?: MinderCapability[];
  /** Where this plugin may run. Server-only plugins must not be bundled client-side. */
  runtime?: 'client' | 'server' | 'isomorphic';
  /** npm peers the adapter lazy-loads (surfaced in DX errors). */
  peerDependencies?: string[];
}

export interface MinderPlugin {
  name: string;
  version?: string;
  /** Optional declarative metadata (capabilities, runtime, peer deps). */
  manifest?: PluginManifest;

  // Lifecycle hooks
  onInit?: (config: any) => void | Promise<void>;
  onRequest?: (request: PluginRequest) => void | Promise<void>;
  onResponse?: (response: PluginResponse) => void | Promise<void>;
  onError?: (error: PluginError) => void | Promise<void>;
  onCacheHit?: (cacheEntry: CacheHitEvent) => void | Promise<void>;
  onCacheMiss?: (cacheKey: string) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;

  // Capability hooks — all optional, fired only when present.
  /** Supply an auth token (auth-provider plugins: Firebase, Auth0, Clerk…). */
  provideToken?: () => string | null | Promise<string | null>;
  /** Notified when the client rotates its tokens. */
  onAuthRefresh?: (tokens: { accessToken?: string; refreshToken?: string }) => void | Promise<void>;
  /** Notified of media-upload lifecycle (fired by the upload pipeline). */
  onUpload?: (event: UploadLifecycleEvent) => void | Promise<void>;
  /** Notified of offline-sync lifecycle (fired by the sync engine). */
  onSync?: (event: SyncLifecycleEvent) => void | Promise<void>;
  /** Notified when connectivity changes. */
  onConnectivityChange?: (online: boolean) => void | Promise<void>;
}

export interface PluginRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timestamp: number;
}

export interface PluginResponse {
  status: number;
  data: any;
  headers?: Record<string, string>;
  duration: number;
  timestamp: number;
}

export interface PluginError {
  message: string;
  code?: string;
  stack?: string;
  request?: PluginRequest;
  timestamp: number;
}

export interface CacheHitEvent {
  key: string;
  value: any;
  age: number;
  timestamp: number;
}

export interface UploadLifecycleEvent {
  phase: 'start' | 'progress' | 'complete' | 'error';
  uploadId: string;
  url?: string;
  file?: { name: string; size: number; type: string };
  progress?: { loaded: number; total: number; percentage: number };
  error?: { message: string; code?: string };
  timestamp: number;
}

export interface SyncLifecycleEvent {
  phase: 'start' | 'progress' | 'complete' | 'error';
  pending?: number;
  processed?: number;
  error?: { message: string; code?: string };
  timestamp: number;
}

/**
 * Plugin Manager
 * Manages plugin lifecycle and execution
 */
export class PluginManager {
  private plugins: Map<string, MinderPlugin> = new Map();
  private initialized: boolean = false;
  private logger: Logger;

  constructor(options?: { debug?: boolean }) {
    this.logger = new Logger('PluginManager', {
      level: options?.debug ? LogLevel.DEBUG : LogLevel.WARN
    });
  }

  /**
   * Register a plugin
   */
  register(plugin: MinderPlugin): void {
    if (this.plugins.has(plugin.name)) {
      this.logger.warn(`Plugin "${plugin.name}" is already registered`);
      return;
    }

    this.plugins.set(plugin.name, plugin);
    this.logger.info(`✓ Plugin registered: ${plugin.name}${plugin.version ? ` v${plugin.version}` : ''}`);
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.onDestroy?.();
      this.plugins.delete(pluginName);
      this.logger.info(`✓ Plugin unregistered: ${pluginName}`);
    }
  }

  /**
   * Initialize all plugins
   */
  async init(config: any): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Plugins already initialized');
      return;
    }

    this.logger.info(`Initializing ${this.plugins.size} plugin(s)...`);

    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onInit?.(config);
        this.logger.debug(`✓ Plugin initialized: ${name}`);
      } catch (error) {
        this.logger.error(`✗ Plugin initialization failed: ${name}`, error);
      }
    }

    this.initialized = true;
  }

  /**
   * Execute request hooks
   */
  async executeRequestHooks(request: PluginRequest): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onRequest?.(request);
      } catch (error) {
        this.logger.error(`Plugin "${name}" request hook failed:`, error);
      }
    }
  }

  /**
   * Execute response hooks
   */
  async executeResponseHooks(response: PluginResponse): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onResponse?.(response);
      } catch (error) {
        this.logger.error(`Plugin "${name}" response hook failed:`, error);
      }
    }
  }

  /**
   * Execute error hooks
   */
  async executeErrorHooks(error: PluginError): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onError?.(error);
      } catch (err) {
        this.logger.error(`Plugin "${name}" error hook failed:`, err);
      }
    }
  }

  /**
   * Execute cache hit hooks
   */
  async executeCacheHitHooks(event: CacheHitEvent): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onCacheHit?.(event);
      } catch (error) {
        this.logger.error(`Plugin "${name}" cache hit hook failed:`, error);
      }
    }
  }

  /**
   * Execute cache miss hooks
   */
  async executeCacheMissHooks(cacheKey: string): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onCacheMiss?.(cacheKey);
      } catch (error) {
        this.logger.error(`Plugin "${name}" cache miss hook failed:`, error);
      }
    }
  }

  /**
   * Number of registered plugins (cheap check for hot paths).
   */
  get size(): number {
    return this.plugins.size;
  }

  /**
   * Execute auth-refresh hooks (after the client rotates its tokens).
   */
  async executeAuthRefreshHooks(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onAuthRefresh?.(tokens);
      } catch (error) {
        this.logger.error(`Plugin "${name}" auth-refresh hook failed:`, error);
      }
    }
  }

  /**
   * Execute upload-lifecycle hooks (fired by the media pipeline).
   */
  async executeUploadHooks(event: UploadLifecycleEvent): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onUpload?.(event);
      } catch (error) {
        this.logger.error(`Plugin "${name}" upload hook failed:`, error);
      }
    }
  }

  /**
   * Execute sync-lifecycle hooks (fired by the offline-sync engine).
   */
  async executeSyncHooks(event: SyncLifecycleEvent): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onSync?.(event);
      } catch (error) {
        this.logger.error(`Plugin "${name}" sync hook failed:`, error);
      }
    }
  }

  /**
   * Execute connectivity-change hooks.
   */
  async executeConnectivityHooks(online: boolean): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onConnectivityChange?.(online);
      } catch (error) {
        this.logger.error(`Plugin "${name}" connectivity hook failed:`, error);
      }
    }
  }

  /**
   * Ask auth-provider plugins for a token. Returns the first non-empty token,
   * or null if none provide one.
   */
  async collectToken(): Promise<string | null> {
    for (const [name, plugin] of this.plugins) {
      if (!plugin.provideToken) continue;
      try {
        const token = await plugin.provideToken();
        if (token) return token;
      } catch (error) {
        this.logger.error(`Plugin "${name}" provideToken failed:`, error);
      }
    }
    return null;
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): MinderPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): MinderPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Check if plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Destroy all plugins
   */
  async destroy(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onDestroy?.();
      } catch (error) {
        this.logger.error(`Plugin "${name}" destroy failed:`, error);
      }
    }
    this.plugins.clear();
    this.initialized = false;
  }
}

// Global plugin manager instance
export const pluginManager = new PluginManager();

/**
 * Built-in Plugins
 */

/**
 * Logger Plugin - Logs all requests and responses (only in debug mode)
 */
export const createLoggerPlugin = (debug: boolean = false): MinderPlugin => {
  const logger = new Logger('LoggerPlugin', {
    level: debug ? LogLevel.DEBUG : LogLevel.WARN
  });
  
  return {
    name: 'logger',
    version: '1.0.0',

    onInit: (config) => {
      logger.info('🔍 Logger plugin initialized');
    },

    onRequest: (request) => {
      logger.debug(`→ ${request.method} ${request.url}`);
    },

    onResponse: (response) => {
      const color = response.status >= 400 ? '🔴' : '🟢';
      logger.debug(`← ${color} ${response.status} (${response.duration}ms)`);
    },

    onError: (error) => {
      logger.error('❌ Request error:', error.message);
    }
  };
};

// For backward compatibility
export const LoggerPlugin = createLoggerPlugin(false);

/**
 * Analytics Plugin - Track API usage
 */
export const AnalyticsPlugin: MinderPlugin = {
  name: 'analytics',
  version: '1.0.0',

  onResponse: (response) => {
    // Send to analytics service
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('API Request', {
        status: response.status,
        duration: response.duration
      });
    }
  },

  onError: (error) => {
    // Track errors
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('API Error', {
        message: error.message,
        code: error.code
      });
    }
  }
};

/**
 * Retry Plugin - Automatic retry on failures
 */
export class RetryPlugin implements MinderPlugin {
  name = 'retry';
  version = '1.0.0';
  
  private maxRetries: number;
  private retryDelay: number;
  private retryableStatuses: number[];
  private logger: Logger;

  constructor(options: {
    maxRetries?: number;
    retryDelay?: number;
    retryableStatuses?: number[];
    debug?: boolean;
  } = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.retryableStatuses = options.retryableStatuses || [408, 429, 500, 502, 503, 504];
    this.logger = new Logger('RetryPlugin', {
      level: options.debug ? LogLevel.DEBUG : LogLevel.WARN
    });
  }

  onError = async (error: PluginError) => {
    this.logger.warn(`⚠️ Retry plugin: considering retry for error: ${error.message}`);
  };
}

/**
 * Cache Warmup Plugin - Preload cache with common requests
 */
export class CacheWarmupPlugin implements MinderPlugin {
  name = 'cache-warmup';
  version = '1.0.0';
  
  private routes: string[];
  private logger: Logger;

  constructor(routes: string[] = [], debug: boolean = false) {
    this.routes = routes;
    this.logger = new Logger('CacheWarmupPlugin', {
      level: debug ? LogLevel.DEBUG : LogLevel.WARN
    });
  }

  onInit = async (config: any) => {
    this.logger.info(`🔥 Warming up cache for ${this.routes.length} route(s)...`);
    // Implementation would fetch and cache these routes
  };
}

/**
 * Performance Monitor Plugin - Track performance metrics
 */
export const createPerformanceMonitorPlugin = (debug: boolean = false): MinderPlugin => {
  const logger = new Logger('PerformanceMonitorPlugin', {
    level: debug ? LogLevel.DEBUG : LogLevel.WARN
  });
  
  return {
    name: 'performance-monitor',
    version: '1.0.0',

    onResponse: (response) => {
      if (response.duration > 1000) {
        logger.warn(`⚠️ Slow request detected: ${response.duration}ms`);
      }
    }
  };
};

// For backward compatibility
export const PerformanceMonitorPlugin = createPerformanceMonitorPlugin(false);

/**
 * Helper function to create custom plugins
 */
export function createPlugin(plugin: MinderPlugin): MinderPlugin {
  return plugin;
}

/**
 * Helper to register multiple plugins at once
 */
export function registerPlugins(...plugins: MinderPlugin[]): void {
  plugins.forEach(plugin => pluginManager.register(plugin));
}
