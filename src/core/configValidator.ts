import type { MinderConfig } from './types.js';
import type { ConfigValidationResult, ValidationOptions } from './config.types.js';

/**
 * Validates configuration and provides helpful error messages
 * @param config Configuration to validate
 * @param options Validation options
 */
export function validateConfig(
  config: MinderConfig,
  options: ValidationOptions = {}
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!config.apiBaseUrl) {
    errors.push('apiBaseUrl is required');
  } else if (!isValidUrl(config.apiBaseUrl)) {
    errors.push('apiBaseUrl must be a valid URL');
  }

  if (!config.routes || Object.keys(config.routes).length === 0) {
    errors.push('At least one route must be defined');
  }

  // Route validation
  if (options.validateRoutes) {
    Object.entries(config.routes || {}).forEach(([key, route]) => {
      if (!route.method) {
        errors.push(`Route "${key}" is missing method`);
      }
      if (!route.url) {
        errors.push(`Route "${key}" is missing url`);
      }
    });
  }

  // Security validation
  if (options.validateSecurity) {
    if (config.auth && !config.security?.csrfProtection) {
      warnings.push('CSRF protection is recommended when using authentication');
    }

    if (!config.security?.sanitization) {
      warnings.push('Data sanitization is recommended for security');
    }

    // HTTPS enforcement (production only)
    const isProduction = process.env.NODE_ENV === 'production';
    const httpsOnly = config.security?.httpsOnly !== false; // Default to true

    if (isProduction && httpsOnly && config.apiBaseUrl) {
      if (!config.apiBaseUrl.startsWith('https://')) {
        errors.push('HTTPS is required for production environments. Use https:// in apiBaseUrl');
      }
    }

    // Development warnings
    const showDevWarnings = config.security?.developmentWarnings !== false; // Default to true
    if (!isProduction && showDevWarnings) {
      if (config.apiBaseUrl && config.apiBaseUrl.startsWith('http://')) {
        warnings.push(
          '⚠️  SECURITY WARNING: Using HTTP in development. Switch to HTTPS before deploying to production.'
        );
      }
      
      if (config.auth && config.auth.storage === 'memory') {
        warnings.push(
          '⚠️  DEVELOPMENT MODE: Auth tokens stored in memory will be lost on refresh. Use sessionStorage or cookie for production.'
        );
      }

      if (!config.security?.csrfProtection) {
        warnings.push(
          '⚠️  SECURITY WARNING: CSRF protection is disabled. Enable it before deploying to production.'
        );
      }
    }
  }

  // Performance validation
  if (config.performance) {
    if (config.performance.retries && config.performance.retries > 5) {
      warnings.push('High retry count may impact performance');
    }

    if (config.performance.timeout && config.performance.timeout < 1000) {
      warnings.push('Timeout less than 1000ms may cause premature request termination');
    }
  }

  // Cache validation
  if (config.cache) {
    if (!config.cache.staleTime) {
      warnings.push('staleTime is recommended for optimal caching');
    }

    if (!config.cache.gcTime) {
      warnings.push('gcTime is recommended for proper cache cleanup');
    }
  }

  // WebSocket validation
  if (config.websocket) {
    if (!config.websocket.protocols) {
      warnings.push('WebSocket protocols are recommended for versioning');
    }

    if (!isValidUrl(config.websocket.url, true)) {
      errors.push('WebSocket URL must be valid and use ws:// or wss:// protocol');
    }
  }

  // Deprecated options check
  if (options.checkDeprecated) {
    checkDeprecatedOptions(config, warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Helper to check for valid URLs
 */
function isValidUrl(url: string, isWebSocket = false): boolean {
  try {
    const parsedUrl = new URL(url);
    if (isWebSocket) {
      return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
    }
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check for deprecated configuration options
 */
function checkDeprecatedOptions(config: any, warnings: string[]) {
  // Example deprecated options
  if ('oldAuthFormat' in config) {
    warnings.push('oldAuthFormat is deprecated, use auth.storage instead');
  }

  if ('globalCache' in config) {
    warnings.push('globalCache is deprecated, use cache.type instead');
  }

  // Check for deprecated nested options
  if (config.cache?.legacy) {
    warnings.push('cache.legacy is deprecated');
  }

  if (config.security?.oldSanitize) {
    warnings.push('security.oldSanitize is deprecated, use security.sanitization instead');
  }
}