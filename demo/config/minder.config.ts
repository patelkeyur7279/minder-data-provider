import type { MinderConfig } from 'minder-data-provider';
import { baseConfig } from './minder.base';
import { environmentConfigs } from './minder.environments';
import type { Environment } from './minder.types';

// 🔄 Merge configs helper
function mergeConfigs(base: Partial<MinderConfig>, environment: Partial<MinderConfig>): MinderConfig {
  return {
    ...base,
    ...environment,
    // Deep merge nested objects
    cors: { ...base.cors, ...environment.cors },
    auth: { ...base.auth, ...environment.auth },
    cache: { ...base.cache, ...environment.cache },
    debug: { ...base.debug, ...environment.debug },
    performance: { ...base.performance },
    security: { ...base.security },
    ssr: { ...base.ssr },
  } as MinderConfig;
}

// 📦 Export default config
const config: MinderConfig = {
  ...baseConfig,
  defaultEnvironment: 'development',
  autoDetectEnvironment: true,
  environments: environmentConfigs,
} as MinderConfig;

export default config;

// 🛠️ Utility to get environment-specific config
export function getEnvironmentConfig(env: Environment): MinderConfig {
  return mergeConfigs(baseConfig, environmentConfigs[env]);
}

// 🔧 Export individual configs for direct use
export { baseConfig } from './minder.base';
export { environmentConfigs } from './minder.environments';
export type { Environment, EnvironmentConfig } from './minder.types';