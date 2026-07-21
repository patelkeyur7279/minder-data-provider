/**
 * Plugins Module
 * Export plugin system and built-in plugins
 */

export {
  PluginManager,
  pluginManager,
  LoggerPlugin,
  AnalyticsPlugin,
  RetryPlugin,
  CacheWarmupPlugin,
  PerformanceMonitorPlugin,
  createPlugin,
  registerPlugins
} from './PluginSystem';

export type {
  MinderPlugin,
  PluginRequest,
  PluginResponse,
  PluginError,
  CacheHitEvent
} from './PluginSystem';

export {
  PROVIDER_CATEGORIES,
  PROVIDER_RUNTIMES,
  PROVIDER_FRAMEWORKS,
  providerManifestSchema,
  validateProviderManifest,
  defineProviderManifest
} from './manifest';

export type {
  ProviderCategory,
  ProviderRuntime,
  ProviderFramework,
  ProviderCapability,
  ProviderConfigSplit,
  ProviderScope,
  ProviderDocs,
  ProviderManifest,
  ValidationResult
} from './manifest';
