/**
 * Plugin System
 * Extensible plugin architecture for Minder Data Provider
 */

export interface MinderPlugin {
  name: string;
  version?: string;
  
  // Lifecycle hooks
  onInit?: (config: any) => void | Promise<void>;
  onRequest?: (request: PluginRequest) => void | Promise<void>;
  onResponse?: (response: PluginResponse) => void | Promise<void>;
  onError?: (error: PluginError) => void | Promise<void>;
  onCacheHit?: (cacheEntry: CacheHitEvent) => void | Promise<void>;
  onCacheMiss?: (cacheKey: string) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
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

/**
 * Plugin Manager
 * Manages plugin lifecycle and execution
 */
export class PluginManager {
  private plugins: Map<string, MinderPlugin> = new Map();
  private initialized: boolean = false;

  /**
   * Register a plugin
   */
  register(plugin: MinderPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered`);
      return;
    }

    this.plugins.set(plugin.name, plugin);
    console.log(`✓ Plugin registered: ${plugin.name}${plugin.version ? ` v${plugin.version}` : ''}`);
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.onDestroy?.();
      this.plugins.delete(pluginName);
      console.log(`✓ Plugin unregistered: ${pluginName}`);
    }
  }

  /**
   * Initialize all plugins
   */
  async init(config: any): Promise<void> {
    if (this.initialized) {
      console.warn('Plugins already initialized');
      return;
    }

    console.log(`Initializing ${this.plugins.size} plugin(s)...`);

    for (const [name, plugin] of this.plugins) {
      try {
        await plugin.onInit?.(config);
        console.log(`✓ Plugin initialized: ${name}`);
      } catch (error) {
        console.error(`✗ Plugin initialization failed: ${name}`, error);
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
        console.error(`Plugin "${name}" request hook failed:`, error);
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
        console.error(`Plugin "${name}" response hook failed:`, error);
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
        console.error(`Plugin "${name}" error hook failed:`, err);
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
        console.error(`Plugin "${name}" cache hit hook failed:`, error);
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
        console.error(`Plugin "${name}" cache miss hook failed:`, error);
      }
    }
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
        console.error(`Plugin "${name}" destroy failed:`, error);
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
 * Logger Plugin - Logs all requests and responses
 */
export const LoggerPlugin: MinderPlugin = {
  name: 'logger',
  version: '1.0.0',

  onInit: (config) => {
    console.log('🔍 Logger plugin initialized');
  },

  onRequest: (request) => {
    console.log(`→ ${request.method} ${request.url}`);
  },

  onResponse: (response) => {
    const color = response.status >= 400 ? '🔴' : '🟢';
    console.log(`← ${color} ${response.status} (${response.duration}ms)`);
  },

  onError: (error) => {
    console.error('❌ Request error:', error.message);
  }
};

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

  constructor(options: {
    maxRetries?: number;
    retryDelay?: number;
    retryableStatuses?: number[];
  } = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.retryableStatuses = options.retryableStatuses || [408, 429, 500, 502, 503, 504];
  }

  onError = async (error: PluginError) => {
    console.log(`⚠️ Retry plugin: considering retry for error: ${error.message}`);
  };
}

/**
 * Cache Warmup Plugin - Preload cache with common requests
 */
export class CacheWarmupPlugin implements MinderPlugin {
  name = 'cache-warmup';
  version = '1.0.0';
  
  private routes: string[];

  constructor(routes: string[] = []) {
    this.routes = routes;
  }

  onInit = async (config: any) => {
    console.log(`🔥 Warming up cache for ${this.routes.length} route(s)...`);
    // Implementation would fetch and cache these routes
  };
}

/**
 * Performance Monitor Plugin - Track performance metrics
 */
export const PerformanceMonitorPlugin: MinderPlugin = {
  name: 'performance-monitor',
  version: '1.0.0',

  onResponse: (response) => {
    if (response.duration > 1000) {
      console.warn(`⚠️ Slow request detected: ${response.duration}ms`);
    }
  }
};

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
