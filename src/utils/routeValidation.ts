import type { ApiRoute } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';
import { normalizeHttpMethod } from '../core/apiClient/resolveRequest.js';

/**
 * Route validation result
 */
export interface RouteValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Validate generated routes
 */
export function validateRoutes(routes: Record<string, ApiRoute>): RouteValidationResult {
  const result: RouteValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };

  Object.entries(routes).forEach(([name, route]) => {
    // Required fields
    if (!route.method) {
      result.errors.push(`Route "${name}" is missing method`);
      result.isValid = false;
    }

    if (!route.url) {
      result.errors.push(`Route "${name}" is missing url`);
      result.isValid = false;
    }

    // URL validation
    if (route.url) {
      if (!route.url.startsWith('/')) {
        result.errors.push(`Route "${name}" URL must start with "/"`);
        result.isValid = false;
      }

      // Check for duplicate parameters
      const params = route.url.match(/:(\w+)/g) || [];
      const uniqueParams = [...new Set(params)];
      if (params.length !== uniqueParams.length) {
        result.errors.push(`Route "${name}" has duplicate parameters`);
        result.isValid = false;
      }
    }

    // Method validation. fix-2.2.0-blockers (item 7, adversarial re-probe):
    // the SAME case-sensitive `HttpMethod` membership check the ResolvedRequest
    // redesign already fixed at the dispatch/comparison sites (resolveRequest.ts,
    // useMinder.helpers.ts) — a hand-written route (never passed through
    // configureMinder()'s own boundary normalization) carrying `method: 'get'`/
    // `'Get'`/`'POST '` is a perfectly valid, dispatchable route, but a bare
    // `Object.values(HttpMethod).includes(route.method)` flagged it as invalid
    // config. Normalize (trim + uppercase) before comparing — mirrors
    // `normalizeHttpMethod`'s own doc comment on exactly this human-authored-config
    // scenario.
    if (route.method && !Object.values(HttpMethod).includes(normalizeHttpMethod(route.method) as HttpMethod)) {
      result.errors.push(`Route "${name}" has invalid method "${route.method}"`);
      result.isValid = false;
    }

    // Timeout validation
    if (route.timeout && (route.timeout < 1000 || route.timeout > 300000)) {
      result.warnings.push(`Route "${name}" timeout ${route.timeout}ms is outside recommended range (1000-300000ms)`);
    }

    // Header validation
    if (route.headers) {
      Object.entries(route.headers).forEach(([key, value]) => {
        if (!key || typeof key !== 'string') {
          result.errors.push(`Route "${name}" has invalid header key`);
          result.isValid = false;
        }
        if (value !== undefined && typeof value !== 'string') {
          result.warnings.push(`Route "${name}" header "${key}" should be a string`);
        }
      });
    }
  });

  // Check for duplicate routes
  const urls = Object.values(routes).map(r => `${r.method}:${r.url}`);
  const duplicates = urls.filter((url, index) => urls.indexOf(url) !== index);
  if (duplicates.length > 0) {
    result.errors.push(`Duplicate URLs found: ${duplicates.join(', ')}`);
    result.isValid = false;
  }

  // Suggestions
  const routeCount = Object.keys(routes).length;
  if (routeCount === 0) {
    result.suggestions.push('Consider adding API routes to enable automatic processing');
  } else if (routeCount > 50) {
    result.suggestions.push('Consider organizing routes into subdirectories for better maintainability');
  }

  // Check for common REST patterns
  const hasCrudRoutes = Object.keys(routes).some(name =>
    name.includes('create') || name.includes('update') || name.includes('delete')
  );
  if (!hasCrudRoutes && routeCount > 5) {
    result.suggestions.push('Consider using CRUD route naming conventions for consistency');
  }

  return result;
}