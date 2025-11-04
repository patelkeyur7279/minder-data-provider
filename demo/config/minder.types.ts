import type { MinderConfig } from 'minder-data-provider';

// Extend MinderConfig for environment-specific settings
export interface EnvironmentConfig extends Partial<MinderConfig> {
  name: string;
}

// Environment type
export type Environment = 'development' | 'staging' | 'production' | 'test';

// Environment configuration type
export type EnvironmentConfigs = Record<Environment, EnvironmentConfig>;