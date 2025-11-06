import { Logger, LogLevel } from '../utils/Logger.js';
import type { MinderConfig } from '../core/types.js';

const logger = new Logger('SSR', { level: LogLevel.WARN });

export interface SSROptions {
  prefetch?: string[];
  hydrate?: boolean;
  fallback?: any;
}

export function createSSRConfig(config: MinderConfig, options: SSROptions = {}) {
  return {
    ...config,
    ssr: {
      enabled: true,
      prefetch: options.prefetch || [],
      hydrate: options.hydrate !== false,
      fallback: options.fallback
    }
  };
}

export async function prefetchData(config: MinderConfig, routes: string[]) {
  const data: Record<string, any> = {};
  
  for (const routeName of routes) {
    const route = config.routes[routeName];
    if (route && route.method === 'GET') {
      try {
        const url = `${config.apiBaseUrl}${route.url}`;
        const response = await fetch(url);
        data[routeName] = await response.json();
      } catch (error) {
        logger.warn(`Failed to prefetch ${routeName}:`, error);
      }
    }
  }
  
  return data;
}

export function withSSR<T = any>(routeName: string, fallback?: T) {
  return {
    routeName,
    fallback,
    ssr: true
  };
}

export function withCSR<T = any>(routeName: string) {
  return {
    routeName,
    ssr: false
  };
}