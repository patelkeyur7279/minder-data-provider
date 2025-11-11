import { promises as fs } from 'fs';
import path from 'path';
import type { ApiRoute } from '../core/types.js';
import { HttpMethod } from '../constants/enums.js';

/**
 * Framework-specific route scanning configurations
 */
export interface FrameworkConfig {
  /** File patterns to match route files */
  filePatterns: RegExp[];
  /** Directory patterns to scan */
  dirPatterns: RegExp[];
  /** How to extract routes from files */
  extractor: RouteExtractor;
  /** Default file extensions */
  extensions: string[];
  /** Base URL pattern for the framework */
  baseUrlPattern: string;
}

/**
 * Route extraction function type
 */
export type RouteExtractor = (filePath: string, content: string, relativePath: string) => Promise<RouteInfo[]>;

/**
 * Extracted route information
 */
export interface RouteInfo {
  name: string;
  route: ApiRoute;
  filePath: string;
  lineNumber?: number;
}

/**
 * Route scanning utilities for different frameworks
 */
export class RouteScanner {
  private static readonly FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
    nextjs: {
      filePatterns: [/^api\/.*$/, /^pages\/api\/.*$/],
      dirPatterns: [/^api$/, /^pages\/api$/],
      extensions: ['.ts', '.js', '.tsx', '.jsx'],
      baseUrlPattern: '/api',
      extractor: RouteScanner.extractNextJsRoutes
    },

    express: {
      filePatterns: [/^routes\/.*$/, /^controllers\/.*$/],
      dirPatterns: [/^routes$/, /^controllers$/],
      extensions: ['.ts', '.js'],
      baseUrlPattern: '/api',
      extractor: RouteScanner.extractExpressRoutes
    },

    fastify: {
      filePatterns: [/^routes\/.*$/, /^plugins\/.*$/],
      dirPatterns: [/^routes$/, /^plugins$/],
      extensions: ['.ts', '.js'],
      baseUrlPattern: '/api',
      extractor: RouteScanner.extractFastifyRoutes
    },

    nestjs: {
      filePatterns: [/^src\/.*\.controller\..*$/],
      dirPatterns: [/^src$/],
      extensions: ['.ts', '.js'],
      baseUrlPattern: '/api',
      extractor: RouteScanner.extractNestJsRoutes
    },

    koa: {
      filePatterns: [/^routes\/.*$/, /^controllers\/.*$/],
      dirPatterns: [/^routes$/, /^controllers$/],
      extensions: ['.ts', '.js'],
      baseUrlPattern: '/api',
      extractor: RouteScanner.extractKoaRoutes
    }
  };

  /**
   * Scan routes for a specific framework
   */
  static async scanFramework(
    baseDir: string,
    framework: keyof typeof RouteScanner.FRAMEWORK_CONFIGS,
    options: { includeDynamic?: boolean; baseUrl?: string } = {}
  ): Promise<RouteInfo[]> {
    const config = this.FRAMEWORK_CONFIGS[framework];
    if (!config) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    const routes: RouteInfo[] = [];
    const scannedFiles = await this.scanDirectory(baseDir, config);

    for (const filePath of scannedFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(baseDir, filePath);

        if (this.matchesFilePattern(relativePath, config)) {
          const fileRoutes = await config.extractor(filePath, content, relativePath);
          routes.push(...fileRoutes);
        }
      } catch (error) {
        console.warn(`Failed to process ${filePath}:`, error);
      }
    }

    // Apply options
    return routes.map(route => ({
      ...route,
      route: {
        ...route.route,
        url: options.baseUrl
          ? path.join(options.baseUrl, route.route.url).replace(/\\/g, '/')
          : route.route.url
      }
    })).filter(route => options.includeDynamic !== false || !route.route.url.includes(':'));
  }

  /**
   * Auto-detect framework from project structure
   */
  static async detectFramework(baseDir: string): Promise<keyof typeof RouteScanner.FRAMEWORK_CONFIGS | null> {
    const packageJsonPath = path.join(baseDir, 'package.json');

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (dependencies['next']) return 'nextjs';
      if (dependencies['@nestjs/core']) return 'nestjs';
      if (dependencies['fastify']) return 'fastify';
      if (dependencies['koa'] || dependencies['koa-router']) return 'koa';
      if (dependencies['express']) return 'express';

      // If package.json exists but no known frameworks, don't do file-based detection
      return null;

    } catch (error) {
      // Package.json not found or invalid, try file-based detection
    }

    // File-based detection only when package.json is not available
    for (const [framework, config] of Object.entries(this.FRAMEWORK_CONFIGS)) {
      const hasMatchingFiles = await this.hasMatchingFiles(baseDir, config);
      if (hasMatchingFiles) {
        return framework as keyof typeof RouteScanner.FRAMEWORK_CONFIGS;
      }
    }

    return null;
  }

  /**
   * Extract Next.js API routes
   */
  private static async extractNextJsRoutes(
    filePath: string,
    content: string,
    relativePath: string
  ): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Extract named exports (GET, POST, PUT, DELETE, etc.)
    const methodRegex = /^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/gm;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() as HttpMethod;
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const routeName = RouteScanner.generateRouteName(relativePath, 'nextjs');
      const url = RouteScanner.generateRouteUrl(relativePath, 'nextjs');

      if (method) {
        routes.push({
          name: `${method.toLowerCase()}${routeName.charAt(0).toUpperCase() + routeName.slice(1)}`,
          route: {
            method,
            url,
            timeout: 30000
          },
          filePath,
          lineNumber
        });
      }
    }

    // If no named exports, check for default export (assumes GET)
    if (routes.length === 0 && content.includes('export default')) {
      const routeName = RouteScanner.generateRouteName(relativePath, 'nextjs');
      const url = RouteScanner.generateRouteUrl(relativePath, 'nextjs');

      routes.push({
        name: routeName,
        route: {
          method: HttpMethod.GET,
          url,
          timeout: 30000
        },
        filePath
      });
    }

    return routes;
  }

  /**
   * Extract Express.js routes
   */
  private static async extractExpressRoutes(
    filePath: string,
    content: string,
    relativePath: string
  ): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Match router.method() calls
    const methodRegex = /(?:router|app)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      const methodStr = match[1];
      const url = match[2];

      if (methodStr && url) {
        const method = methodStr.toUpperCase() as HttpMethod;
        const lineNumber = content.substring(0, match.index).split('\n').length;

        const routeName = RouteScanner.generateRouteName(relativePath, 'express')
          .replace(/Router$/, '') // Remove Router suffix
          .replace(/Routes$/, ''); // Remove Routes suffix

        routes.push({
          name: `${method.toLowerCase()}${routeName}${url.replace(/[^a-zA-Z0-9]/g, '')}`,
          route: {
            method,
            url,
            timeout: 30000
          },
          filePath,
          lineNumber
        });
      }
    }

    return routes;
  }

  /**
   * Extract Fastify routes
   */
  private static async extractFastifyRoutes(
    filePath: string,
    content: string,
    relativePath: string
  ): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Match fastify.route() or app.route() calls
    const routeRegex = /(?:fastify|app)\.route\s*\(\s*\{[^}]*method\s*:\s*['"`]([^'"`]+)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      const methodStr = match[1];
      const url = match[2];

      if (methodStr && url) {
        const method = methodStr.toUpperCase() as HttpMethod;
        const lineNumber = content.substring(0, match.index).split('\n').length;

        const routeName = RouteScanner.generateRouteName(relativePath, 'fastify');

        routes.push({
          name: `${method.toLowerCase()}${routeName}${url.replace(/[^a-zA-Z0-9]/g, '')}`,
          route: {
            method,
            url,
            timeout: 30000
          },
          filePath,
          lineNumber
        });
      }
    }

    return routes;
  }

  /**
   * Extract NestJS routes
   */
  private static async extractNestJsRoutes(
    filePath: string,
    content: string,
    relativePath: string
  ): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Match @Get, @Post, etc. decorators
    const decoratorRegex = /@(Get|Post|Put|Delete|Patch|Head|Options)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gi;
    let match;

    while ((match = decoratorRegex.exec(content)) !== null) {
      const methodStr = match[1];
      const url = match[2];

      if (methodStr && url) {
        const method = methodStr.toUpperCase() as HttpMethod;
        const lineNumber = content.substring(0, match.index).split('\n').length;

        // Extract class name for route naming
        const classMatch = content.match(/export\s+class\s+(\w+)/);
        const className = classMatch?.[1]?.replace(/Controller$/, '') || 'Unknown';

        routes.push({
          name: `${method.toLowerCase()}${className}${url.replace(/[^a-zA-Z0-9]/g, '')}`,
          route: {
            method,
            url,
            timeout: 30000
          },
          filePath,
          lineNumber
        });
      }
    }

    return routes;
  }

  /**
   * Extract Koa routes
   */
  private static async extractKoaRoutes(
    filePath: string,
    content: string,
    relativePath: string
  ): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    // Match router.method() calls (similar to Express)
    const methodRegex = /router\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      const methodStr = match[1];
      const url = match[2];

      if (methodStr && url) {
        const method = methodStr.toUpperCase() as HttpMethod;
        const lineNumber = content.substring(0, match.index).split('\n').length;

        const routeName = RouteScanner.generateRouteName(relativePath, 'koa');

        routes.push({
          name: `${method.toLowerCase()}${routeName}${url.replace(/[^a-zA-Z0-9]/g, '')}`,
          route: {
            method,
            url,
            timeout: 30000
          },
          filePath,
          lineNumber
        });
      }
    }

    return routes;
  }

  /**
   * Helper methods
   */
  private static async scanDirectory(baseDir: string, config: FrameworkConfig): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile() && config.extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    }

    await scan(baseDir);
    return files;
  }

  private static matchesFilePattern(relativePath: string, config: FrameworkConfig): boolean {
    return config.filePatterns.some(pattern => pattern.test(relativePath));
  }

  private static async hasMatchingFiles(baseDir: string, config: FrameworkConfig): Promise<boolean> {
    try {
      const files = await this.scanDirectory(baseDir, config);
      return files.some(file => this.matchesFilePattern(path.relative(baseDir, file), config));
    } catch {
      return false;
    }
  }

  private static generateRouteName(relativePath: string, framework: string): string {
    return relativePath
      .replace(/\.(ts|js|tsx|jsx)$/, '')
      .replace(/\[([^\]]+)\]/g, '$1') // Convert Next.js dynamic routes
      .replace(/\\/g, '/')
      .replace(/\/index$/, '')
      .replace(/^\//, '')
      .replace(new RegExp(`^${framework}/`), '')
      .replace(/^api\//, '')
      .replace(/^pages\/api\//, '')
      .replace(/^routes\//, '')
      .replace(/^controllers\//, '')
      .replace(/^src\//, '')
      .split('/')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private static generateRouteUrl(relativePath: string, framework: string): string {
    let url = relativePath
      .replace(/\.(ts|js|tsx|jsx)$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1') // Convert Next.js dynamic routes
      .replace(/\\/g, '/')
      .replace(/\/index$/, '')
      .replace(/^\//, '/');

    // Framework-specific URL generation
    switch (framework) {
      case 'nextjs':
        url = url.replace(/^\/api/, '').replace(/^\/pages\/api/, '');
        break;
      case 'express':
      case 'fastify':
      case 'koa':
        url = url.replace(/^\/routes/, '').replace(/^\/controllers/, '');
        break;
      case 'nestjs':
        url = url.replace(/^\/src/, '');
        break;
    }

    return url || '/';
  }
}