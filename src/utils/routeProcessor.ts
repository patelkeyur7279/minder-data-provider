import { promises as fs } from 'fs';
import path from 'path';
import type { ApiRoute } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';

/**
 * Route scanning options
 */
export interface RouteScanOptions {
  /** Base directory to scan for routes */
  baseDir: string;
  /** Framework type for route detection */
  framework: 'nextjs' | 'express' | 'fastify' | 'custom';
  /** File extensions to scan */
  extensions?: string[];
  /** Custom route patterns */
  patterns?: RegExp[];
  /** Whether to include dynamic routes */
  includeDynamic?: boolean;
  /** Base URL prefix for routes */
  baseUrl?: string;
}

/**
 * Route processing result
 */
export interface RouteProcessingResult {
  routes: Record<string, ApiRoute>;
  warnings: string[];
  errors: string[];
}

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
 * Automatic route processor for generating API routes from file system
 */
export class RouteProcessor {
  private static readonly DEFAULT_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];
  private static readonly FRAMEWORK_PATTERNS = {
    nextjs: [/^api\/.*$/, /^pages\/api\/.*$/],
    express: [/^routes\/.*$/, /^controllers\/.*$/],
    fastify: [/^routes\/.*$/, /^plugins\/.*$/],
    custom: []
  };

  /**
   * Generate routes from API directory structure
   */
  static async generateFromDirectory(options: RouteScanOptions): Promise<RouteProcessingResult> {
    const result: RouteProcessingResult = {
      routes: {},
      warnings: [],
      errors: []
    };

    try {
      const files = await this.scanDirectory(options.baseDir, options);
      const routeFiles = this.filterRouteFiles(files, options);

      for (const file of routeFiles) {
        try {
          const routeInfo = await this.processRouteFile(file, options);
          if (routeInfo) {
            result.routes[routeInfo.name] = routeInfo.route;
          }
        } catch (error) {
          result.errors.push(`Failed to process ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Validate generated routes
      const validation = this.validateRoutes(result.routes);
      result.warnings.push(...validation.warnings);
      result.errors.push(...validation.errors);

    } catch (error) {
      result.errors.push(`Directory scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Scan directory recursively for route files
   */
  private static async scanDirectory(dir: string, options: RouteScanOptions): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip common non-route directories
          if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const extensions = options.extensions || RouteProcessor.DEFAULT_EXTENSIONS;

          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scan(dir);
    return files;
  }

  /**
   * Filter files based on framework patterns
   */
  private static filterRouteFiles(files: string[], options: RouteScanOptions): string[] {
    const patterns = options.patterns || this.FRAMEWORK_PATTERNS[options.framework] || [];

    return files.filter(file => {
      const relativePath = path.relative(options.baseDir, file);
      return patterns.some(pattern => pattern.test(relativePath));
    });
  }

  /**
   * Process individual route file
   */
  private static async processRouteFile(
    filePath: string,
    options: RouteScanOptions
  ): Promise<{ name: string; route: ApiRoute } | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(options.baseDir, filePath);
    const routeName = this.generateRouteName(relativePath, options.framework);
    const url = this.generateRouteUrl(relativePath, options);

    // Detect HTTP methods from file content
    const methods = this.detectHttpMethods(content, options.framework);

    if (methods.length === 0) {
      // Default to GET if no methods detected
      methods.push(HttpMethod.GET);
    }

    // Create route configuration
    const route: ApiRoute = {
      method: methods[0]!, // Primary method (guaranteed to exist)
      url,
      headers: {},
      timeout: 30000
    };

    // Add additional methods as separate routes if multiple
    if (methods.length > 1) {
      return {
        name: routeName,
        route: {
          ...route,
          method: methods[0]! // Use first method as primary
        }
      };
    }

    return { name: routeName, route };
  }

  /**
   * Generate route name from file path
   */
  private static generateRouteName(relativePath: string, framework: string): string {
    let name = relativePath
      .replace(/\.(ts|js|tsx|jsx)$/, '') // Remove extension
      .replace(/\[([^\]]+)\]/g, ':$1') // Convert Next.js dynamic routes
      .replace(/\\/g, '/') // Normalize path separators
      .replace(/\/index$/, '') // Remove index suffix
      .replace(/^\//, ''); // Remove leading slash

    // Framework-specific naming
    switch (framework) {
      case 'nextjs':
        name = name.replace(/^api\//, '').replace(/^pages\/api\//, '');
        break;
      case 'express':
        name = name.replace(/^routes\//, '');
        break;
      case 'fastify':
        name = name.replace(/^routes\//, '');
        break;
    }

    return name || 'root';
  }

  /**
   * Generate route URL from file path
   */
  private static generateRouteUrl(relativePath: string, options: RouteScanOptions): string {
    let url = relativePath
      .replace(/\.(ts|js|tsx|jsx)$/, '') // Remove extension
      .replace(/\[([^\]]+)\]/g, ':$1') // Convert Next.js dynamic routes
      .replace(/\\/g, '/') // Normalize path separators
      .replace(/\/index$/, '') // Remove index suffix
      .replace(/^\//, '/'); // Ensure leading slash

    // Framework-specific URL generation
    switch (options.framework) {
      case 'nextjs':
        url = url.replace(/^\/api/, '').replace(/^\/pages\/api/, '');
        if (!url.startsWith('/')) {
          url = '/' + url;
        }
        break;
      case 'express':
        url = url.replace(/^\/routes/, '');
        break;
      case 'fastify':
        url = url.replace(/^\/routes/, '');
        break;
    }

    // Add base URL if specified
    if (options.baseUrl) {
      url = path.join(options.baseUrl, url).replace(/\\/g, '/');
    }

    return url || '/';
  }

  /**
   * Detect HTTP methods from file content
   */
  private static detectHttpMethods(content: string, framework: string): HttpMethod[] {
    const methods: HttpMethod[] = [];
    const methodPatterns = {
      [HttpMethod.GET]: /\bGET\b|\.get\(/i,
      [HttpMethod.POST]: /\bPOST\b|\.post\(/i,
      [HttpMethod.PUT]: /\bPUT\b|\.put\(/i,
      [HttpMethod.DELETE]: /\bDELETE\b|\.delete\(/i,
      [HttpMethod.PATCH]: /\bPATCH\b|\.patch\(/i,
      [HttpMethod.HEAD]: /\bHEAD\b|\.head\(/i,
      [HttpMethod.OPTIONS]: /\bOPTIONS\b|\.options\(/i
    };

    // Framework-specific method detection
    switch (framework) {
      case 'nextjs':
        // Next.js API routes export named functions
        if (content.includes('export default')) {
          methods.push(HttpMethod.GET);
        }
        if (content.includes('export async function GET')) {
          methods.push(HttpMethod.GET);
        }
        if (content.includes('export async function POST')) {
          methods.push(HttpMethod.POST);
        }
        if (content.includes('export async function PUT')) {
          methods.push(HttpMethod.PUT);
        }
        if (content.includes('export async function DELETE')) {
          methods.push(HttpMethod.DELETE);
        }
        if (content.includes('export async function PATCH')) {
          methods.push(HttpMethod.PATCH);
        }
        break;

      case 'express':
        // Express.js route definitions
        Object.entries(methodPatterns).forEach(([method, pattern]) => {
          if (pattern.test(content)) {
            methods.push(method as HttpMethod);
          }
        });
        break;

      case 'fastify':
        // Fastify route definitions
        Object.entries(methodPatterns).forEach(([method, pattern]) => {
          if (pattern.test(content)) {
            methods.push(method as HttpMethod);
          }
        });
        break;

      default:
        // Generic detection
        Object.entries(methodPatterns).forEach(([method, pattern]) => {
          if (pattern.test(content)) {
            methods.push(method as HttpMethod);
          }
        });
    }

    return [...new Set(methods)]; // Remove duplicates
  }

  /**
   * Validate generated routes
   */
  static validateRoutes(routes: Record<string, ApiRoute>): RouteValidationResult {
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

      // Method validation
      if (route.method && !Object.values(HttpMethod).includes(route.method)) {
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

  /**
   * Merge route processing results
   */
  static mergeResults(...results: RouteProcessingResult[]): RouteProcessingResult {
    const merged: RouteProcessingResult = {
      routes: {},
      warnings: [],
      errors: []
    };

    results.forEach(result => {
      Object.assign(merged.routes, result.routes);
      merged.warnings.push(...result.warnings);
      merged.errors.push(...result.errors);
    });

    return merged;
  }
}