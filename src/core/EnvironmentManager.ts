import type { MinderConfig, EnvironmentOverride } from './types.js';
import { MinderConfigError } from '../errors/index.js';

export class EnvironmentManager {
  private config: MinderConfig;
  private currentEnv: string;

  constructor(config: MinderConfig) {
    this.config = config;
    this.currentEnv = this.detectEnvironment();
  }

  private detectEnvironment(): string {
    if (!this.config.autoDetectEnvironment) {
      return this.config.defaultEnvironment || 'development';
    }

    // Auto-detect based on hostname/URL
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
      } else if (hostname.includes('staging') || hostname.includes('dev')) {
        return 'staging';
      } else {
        return 'production';
      }
    }

    // Server-side detection
    try {
      const nodeEnv = (globalThis as any).process?.env?.NODE_ENV;
      if (nodeEnv === 'development') return 'development';
      if (nodeEnv === 'test') return 'test';
    } catch {}
    return 'production';
  }

  public getCurrentEnvironment(): string {
    return this.currentEnv;
  }

  public setEnvironment(env: string): void {
    if (this.config.environments && !this.config.environments[env]) {
      throw new MinderConfigError(`Environment '${env}' not found in configuration`, 'ENV_NOT_FOUND');
    }
    this.currentEnv = env;
  }

  public getEnvironmentOverride(): EnvironmentOverride | null {
    if (!this.config.environments) return null;
    return this.config.environments[this.currentEnv] || null;
  }

  public getResolvedConfig(): MinderConfig {
    const envOverride = this.getEnvironmentOverride();
    if (!envOverride) return this.config;
    
    return {
      ...this.config,
      apiBaseUrl: this.buildApiUrl(envOverride),
      auth: {
        tokenKey: this.config.auth?.tokenKey || 'accessToken',
        storage: this.config.auth?.storage || 'memory', // Secure default
        ...this.config.auth,
        ...envOverride.auth,
      },
      cache: {
        ...this.config.cache,
        ...envOverride.cache,
      },
      cors: this.buildCorsConfig(envOverride),
    };
  }

  private buildApiUrl(envOverride: EnvironmentOverride): string {
    // Use proxy for CORS-enabled environments
    if (envOverride.cors?.enabled && envOverride.cors?.proxy) {
      return envOverride.cors.proxy;
    }
    return envOverride.apiBaseUrl || this.config.apiBaseUrl;
  }

  private buildCorsConfig(envOverride: EnvironmentOverride) {
    const corsConfig = { ...this.config.cors, ...envOverride.cors };
    
    if (!corsConfig.enabled) {
      return corsConfig;
    }

    return {
      ...corsConfig,
      credentials: corsConfig.credentials ?? true,
      origin: corsConfig.origin || '*',
      methods: corsConfig.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: corsConfig.headers || ['Content-Type', 'Authorization', 'X-Requested-With'],
    };
  }

  public getAllEnvironments(): string[] {
    return this.config.environments ? Object.keys(this.config.environments) : [this.currentEnv];
  }

  public isProduction(): boolean {
    return this.currentEnv === 'production';
  }

  public isDevelopment(): boolean {
    return this.currentEnv === 'development';
  }

  public getDebugMode(): boolean {
    const envOverride = this.getEnvironmentOverride();
    return envOverride?.debug ?? false;
  }
}