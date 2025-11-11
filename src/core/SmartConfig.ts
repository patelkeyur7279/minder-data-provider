/**
 * Smart Configuration System
 * Allows seamless transition between light and full configurations
 * with automatic feature detection and scaling
 */

import type { MinderConfig, AuthConfig, CacheConfig, SecurityConfig } from './types.js';
import { analyzeComplexity, type ComplexityMetrics } from '../utils/complexityAnalyzer.js';
import { LightHttpClient } from './LightHttpClient.js';
import axios from 'axios';
import { CacheType, StorageType } from '../constants/enums.js';

interface SmartConfigOptions {
  /**
   * Mode of operation
   * 'auto' - Automatically determines based on usage
   * 'light' - Forces lightweight mode
   * 'full' - Forces full feature mode
   */
  mode?: 'auto' | 'light' | 'full';
  
  /**
   * Performance tuning
   */
  performance?: {
    /** Automatically optimize based on usage patterns */
    autoOptimize?: boolean;
    /** Target bundle size in KB */
    targetBundleSize?: number;
    /** Maximum memory usage in MB */
    maxMemoryUsage?: number;
    /** Enable code splitting */
    enableCodeSplitting?: boolean;
  };

  /**
   * Security options
   */
  security?: {
    /** Level of security measures */
    level?: 'basic' | 'standard' | 'strict';
    /** Enable encryption for sensitive data */
    encryption?: boolean;
    /** Enable request sanitization */
    sanitization?: boolean;
    /** CORS configuration */
    cors?: {
      enabled: boolean;
      origin?: string | string[];
      credentials?: boolean;
    };
  };

  /**
   * Feature flags for progressive enhancement
   */
  features?: {
    /** Enable advanced caching */
    advancedCaching?: boolean;
    /** Enable real-time updates */
    realtime?: boolean;
    /** Enable offline support */
    offline?: boolean;
    /** Enable analytics */
    analytics?: boolean;
  };
}

interface FeatureUsageMetrics {
  /** Number of API calls per minute */
  apiCallsPerMinute: number;
  /** Average payload size in KB */
  averagePayloadSize: number;
  /** Number of concurrent users */
  concurrentUsers: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Number of websocket connections */
  websocketConnections: number;
}

export class SmartConfigManager {
  private currentConfig: MinderConfig;
  private complexity: ComplexityMetrics;
  private usageMetrics: FeatureUsageMetrics = {
    apiCallsPerMinute: 0,
    averagePayloadSize: 0,
    concurrentUsers: 0,
    cacheHitRate: 0,
    websocketConnections: 0,
  };

  constructor(
    private baseConfig: MinderConfig,
    private options: SmartConfigOptions = {}
  ) {
    this.complexity = analyzeComplexity(baseConfig);
    this.currentConfig = this.generateInitialConfig();
    
    if (options.mode === 'auto') {
      this.startMetricsCollection();
    }
  }

  /**
   * Generate initial configuration based on mode and complexity
   */
  private generateInitialConfig(): MinderConfig {
    const isLightMode = this.options.mode === 'light' || 
      (this.options.mode === 'auto' && this.complexity.routeCount < 5);

    return {
      ...this.baseConfig,
      httpClient: isLightMode ? 
        new LightHttpClient({ baseURL: this.baseConfig.apiBaseUrl }) :
        axios.create({ baseURL: this.baseConfig.apiBaseUrl }),
      
      cache: this.generateCacheConfig(isLightMode),
      auth: this.generateAuthConfig(isLightMode),
      security: this.generateSecurityConfig(),
      performance: this.generatePerformanceConfig(isLightMode),
    };
  }

  /**
   * Generate cache configuration based on mode and usage
   */
  private generateCacheConfig(isLightMode: boolean): CacheConfig {
    return {
      type: isLightMode ? CacheType.MEMORY : CacheType.HYBRID,
      staleTime: this.calculateOptimalStaleTime(),
      gcTime: this.calculateOptimalGCTime(),
      maxSize: this.calculateOptimalCacheSize(),
      refetchOnWindowFocus: !isLightMode,
      refetchOnReconnect: !isLightMode,
    };
  }

  /**
   * Generate auth configuration based on mode and security requirements
   */
  private generateAuthConfig(isLightMode: boolean): AuthConfig {
    return {
      storage: this.options.security?.level === 'strict' ? StorageType.MEMORY : StorageType.SESSION_STORAGE,
      tokenKey: 'auth_token',
      refreshUrl: isLightMode ? undefined : '/refresh-token',
      onAuthError: () => this.handleAuthError(),
    };
  }

  /**
   * Generate security configuration based on security level
   */
  private generateSecurityConfig(): SecurityConfig {
    const securityLevel = this.options.security?.level || 'standard';
    
    return {
      encryption: securityLevel === 'strict',
      sanitization: securityLevel !== 'basic',
      csrfProtection: securityLevel !== 'basic',
      rateLimiting: {
        requests: this.calculateOptimalRateLimit(),
        window: 60000,
      },
    };
  }

  /**
   * Generate performance configuration based on mode and metrics
   */
  private generatePerformanceConfig(isLightMode: boolean): MinderConfig['performance'] {
    return {
      deduplication: !isLightMode,
      retries: isLightMode ? 1 : 3,
      compression: this.usageMetrics.averagePayloadSize > 100,
      lazyLoading: this.options.performance?.enableCodeSplitting !== false,
    };
  }

  /**
   * Calculate optimal cache stale time based on usage patterns
   */
  private calculateOptimalStaleTime(): number {
    const baseTime = 5 * 60 * 1000; // 5 minutes
    const hitRateMultiplier = this.usageMetrics.cacheHitRate > 0.8 ? 2 : 1;
    return baseTime * hitRateMultiplier;
  }

  /**
   * Calculate optimal garbage collection time
   */
  private calculateOptimalGCTime(): number {
    return this.calculateOptimalStaleTime() * 2;
  }

  /**
   * Calculate optimal cache size based on memory usage
   */
  private calculateOptimalCacheSize(): number {
    const maxMemory = this.options.performance?.maxMemoryUsage || 100; // Default 100MB
    return Math.floor(maxMemory / this.usageMetrics.averagePayloadSize);
  }

  /**
   * Calculate optimal rate limit based on usage
   */
  private calculateOptimalRateLimit(): number {
    const baseLimit = 100;
    const scalingFactor = Math.max(1, this.usageMetrics.concurrentUsers / 10);
    return Math.floor(baseLimit * scalingFactor);
  }

  /**
   * Start collecting usage metrics for auto-optimization
   */
  private startMetricsCollection(): void {
    if (typeof window === 'undefined') return;

    setInterval(() => {
      this.collectMetrics();
      this.optimizeConfig();
    }, 60000); // Collect metrics every minute
  }

  /**
   * Collect current usage metrics
   */
  private collectMetrics(): void {
    // Implement metric collection
    // This would be connected to actual usage monitoring
  }

  /**
   * Optimize configuration based on collected metrics
   */
  private optimizeConfig(): void {
    if (!this.options.performance?.autoOptimize) return;

    const newConfig = {
      ...this.currentConfig,
      cache: this.generateCacheConfig(false),
      performance: this.generatePerformanceConfig(false),
    };

    this.currentConfig = newConfig;
    this.emitConfigUpdate(newConfig);
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(): void {
    // Implement auth error handling
  }

  /**
   * Emit configuration update event
   */
  private emitConfigUpdate(config: MinderConfig): void {
    const event = new CustomEvent('minder:config-update', { detail: config });
    window.dispatchEvent(event);
  }

  /**
   * Get current configuration
   */
  public getCurrentConfig(): MinderConfig {
    return this.currentConfig;
  }

  /**
   * Upgrade to full configuration
   */
  public upgradeToFull(): MinderConfig {
    this.options.mode = 'full';
    this.currentConfig = this.generateInitialConfig();
    this.emitConfigUpdate(this.currentConfig);
    return this.currentConfig;
  }

  /**
   * Update specific feature configuration
   */
  public updateFeature<K extends keyof MinderConfig>(
    feature: K,
    config: Partial<MinderConfig[K]>
  ): void {
    this.currentConfig = {
      ...this.currentConfig,
      [feature]: {
        ...this.currentConfig[feature],
        ...config,
      },
    };
    this.emitConfigUpdate(this.currentConfig);
  }
}