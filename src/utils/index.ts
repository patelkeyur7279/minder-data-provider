// Utility functions for the package

// Export security utilities
export * from './security.js';

// Export performance utilities
export * from './performance.js';

// Export Logger class (but not the default instance)
export { Logger, LogLevel, createLogger } from './Logger.js';

// Export route processor
export { RouteProcessor } from './routeProcessor.js';

// Generate configuration from Next.js API routes
export async function generateConfigFromApiRoutes(apiDir: string, options?: {
  framework?: 'nextjs' | 'express' | 'fastify' | 'custom';
  baseUrl?: string;
  includeDynamic?: boolean;
}): Promise<any> {
  // Dynamic import to avoid circular dependencies
  let RouteProcessor: any;
  try {
    RouteProcessor = (await import('./routeProcessor.js')).RouteProcessor;
  } catch (error) {
    // In test environments that don't support dynamic imports, try static import
    const routeProcessorModule = require('./routeProcessor.js');
    RouteProcessor = routeProcessorModule.RouteProcessor;
  }

  const scanOptions = {
    baseDir: apiDir,
    framework: options?.framework || 'nextjs',
    baseUrl: options?.baseUrl,
    includeDynamic: options?.includeDynamic ?? true,
    extensions: ['.ts', '.js', '.tsx', '.jsx']
  };

  const result = await RouteProcessor.generateFromDirectory(scanOptions);

  if (result.errors.length > 0) {
    console.warn('Route processing errors:', result.errors);
  }

  if (result.warnings.length > 0) {
    console.warn('Route processing warnings:', result.warnings);
  }

  return {
    routes: result.routes,
    processing: {
      errors: result.errors,
      warnings: result.warnings,
      routeCount: Object.keys(result.routes).length
    }
  };
}

// CORS helper
export function createCorsConfig(options?: {
  origin?: string | string[];
  credentials?: boolean;
  methods?: string[];
}): any {
  return {
    origin: options?.origin || '*',
    credentials: options?.credentials ?? true,
    methods: options?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
}

// Error formatter
export function formatApiError(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    if (err.response?.data?.message) {
      return err.response.data.message;
    }
    if (err.message) {
      return err.message;
    }
  }
  return 'An unknown error occurred';
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Deep merge objects
export function deepMerge<T extends Record<string, unknown> = Record<string, unknown>>(
  target: T, 
  source: Record<string, unknown>
): T {
  const output: Record<string, unknown> = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(
            target[key] as Record<string, unknown>, 
            source[key] as Record<string, unknown>
          );
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output as T;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}

// Generate unique ID
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Validate email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate URL
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Convert to camelCase
export function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace('-', '').replace('_', '');
  });
}

// Convert to snake_case
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Retry function with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError;
}