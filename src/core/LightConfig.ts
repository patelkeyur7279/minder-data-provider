/**
 * Light configuration for simple applications
 * Uses minimal dependencies and features
 */
import { LightHttpClient } from './LightHttpClient.js';
import type { MinderConfig, ApiRoute } from './types.js';
import { HttpMethod, StorageType, LogLevel } from '../constants/enums.js';

interface LightConfig {
  apiBaseUrl: string;
  routes: Record<string, string>;
  features?: {
    auth?: boolean;
    cache?: boolean;
    websocket?: boolean;
    debug?: boolean;
  };
}

/**
 * Creates a lightweight configuration with minimal dependencies
 * Suitable for small to medium applications
 */
import { validateConfig } from './configValidator.js';
import type { ConfigValidationResult } from './config.types.js';

export function createLightConfig(config: LightConfig): MinderConfig & { validation: ConfigValidationResult } {
  const httpClient = new LightHttpClient({
    baseURL: config.apiBaseUrl,
    timeout: 10000,
  });

  // Convert simple route definitions to full config
  const routes = Object.entries(config.routes).reduce((acc, [key, url]) => {
    acc[key] = {
      method: HttpMethod.GET,
      url,
      cache: config.features?.cache !== false,
    };
    return acc;
  }, {} as Record<string, ApiRoute>);

  // Helper function to safely check if we're in development mode
  const isDevelopment = () => {
    try {
      return process.env.NODE_ENV === 'development' ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost');
    } catch {
      return false;
    }
  };

  const minderConfig: MinderConfig = {
    apiBaseUrl: config.apiBaseUrl,
    routes,
    // dynamic is optional - only needed for Next.js code-splitting
    auth: config.features?.auth ? {
      storage: StorageType.MEMORY, // Secure default (was localStorage)
      tokenKey: 'auth_token',
    } : undefined,
    cache: config.features?.cache ? {
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true
    } : undefined,
    websocket: config.features?.websocket ? {
      url: config.apiBaseUrl.replace(/^http/, 'ws'),
      protocols: ['v1'],
      reconnect: true
    } : undefined,
    debug: config.features?.debug ? {
      enabled: true,
      logLevel: LogLevel.ERROR,
    } : undefined,
    httpClient, // Use light HTTP client instead of Axios
  };

  // Validate the configuration
  const validation = validateConfig(minderConfig, {
    validateRoutes: true,
    validateSecurity: true,
    checkDeprecated: true
  });

  // Return configuration with validation results
  return {
    ...minderConfig,
    validation
  };
}