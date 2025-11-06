/**
 * Common configuration types shared between light and full configurations
 */
import type { ApiRoute } from './types.js';

export interface BaseConfig {
  apiBaseUrl: string;
  routes: Record<string, string | ApiRoute>;
}

/**
 * Light configuration specific features
 */
export interface LightFeatures {
  auth?: boolean;
  cache?: boolean;
  websocket?: boolean;
  debug?: boolean;
}

/**
 * Light configuration options
 */
export interface LightConfigOptions extends BaseConfig {
  features?: LightFeatures;
  /** Optional performance tuning */
  performance?: {
    timeout?: number;
    retries?: number;
  };
}

/**
 * Configuration validator result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration validation options
 */
export interface ValidationOptions {
  /** Whether to validate route configurations */
  validateRoutes?: boolean;
  /** Whether to validate security settings */
  validateSecurity?: boolean;
  /** Whether to check for deprecated options */
  checkDeprecated?: boolean;
}

/**
 * Configuration migration options
 */
export interface MigrationOptions {
  /** Target version to migrate to */
  targetVersion: string;
  /** Whether to backup before migration */
  backup?: boolean;
  /** Custom migration handlers */
  handlers?: Record<string, (config: any) => any>;
}