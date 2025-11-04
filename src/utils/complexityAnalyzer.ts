/**
 * Utility to analyze application complexity and provide optimized configurations
 */

export interface ComplexityMetrics {
  routeCount: number;
  hasAuthentication: boolean;
  hasFileUploads: boolean;
  hasWebSockets: boolean;
  hasSSR: boolean;
  estimatedDataSize: 'small' | 'medium' | 'large';
  cacheRequirements: 'basic' | 'advanced';
}

export interface OptimizedConfig {
  cacheStrategy: {
    type: 'memory' | 'persistent' | 'hybrid';
    ttl: number;
    maxSize: number;
  };
  prefetchStrategy: 'none' | 'essential' | 'aggressive';
  batchingStrategy: boolean;
  compressionEnabled: boolean;
  optimisticUpdates: boolean;
  backgroundSync: boolean;
  debugLevel: 'none' | 'error' | 'warning' | 'info' | 'debug';
}

/**
 * Analyzes the configuration to determine application complexity
 */
export function analyzeComplexity(config: any): ComplexityMetrics {
  return {
    routeCount: Object.keys(config.routes || {}).length,
    hasAuthentication: !!config.auth,
    hasFileUploads: Object.values(config.routes || {}).some((route: any) => 
      route.method === 'POST' && route.contentType?.includes('multipart/form-data')),
    hasWebSockets: !!config.websocket,
    hasSSR: !!config.ssr?.enabled,
    estimatedDataSize: calculateDataSizeEstimate(config),
    cacheRequirements: determineCacheRequirements(config)
  };
}

/**
 * Generates optimized configuration based on complexity analysis
 */
export function generateOptimizedConfig(metrics: ComplexityMetrics): OptimizedConfig {
  return {
    cacheStrategy: {
      type: metrics.cacheRequirements === 'advanced' ? 'hybrid' : 'memory',
      ttl: metrics.estimatedDataSize === 'large' ? 300000 : 600000, // 5-10 minutes
      maxSize: calculateMaxCacheSize(metrics.estimatedDataSize),
    },
    prefetchStrategy: determinePrefetchStrategy(metrics),
    batchingStrategy: metrics.routeCount > 10,
    compressionEnabled: metrics.estimatedDataSize === 'large',
    optimisticUpdates: metrics.estimatedDataSize !== 'large',
    backgroundSync: metrics.hasWebSockets || metrics.routeCount > 5,
    debugLevel: determineDebugLevel(metrics),
  };
}

/**
 * Estimates the data size based on configuration
 */
function calculateDataSizeEstimate(config: any): 'small' | 'medium' | 'large' {
  const routeCount = Object.keys(config.routes || {}).length;
  const hasFileUploads = Object.values(config.routes || {}).some((route: any) => 
    route.method === 'POST' && route.contentType?.includes('multipart/form-data'));
  
  if (routeCount <= 5 && !hasFileUploads) return 'small';
  if (routeCount <= 15 && !hasFileUploads) return 'medium';
  return 'large';
}

/**
 * Determines appropriate cache requirements
 */
function determineCacheRequirements(config: any): 'basic' | 'advanced' {
  const needsAdvancedCache = 
    config.websocket || 
    config.ssr?.enabled || 
    Object.keys(config.routes || {}).length > 10;
  
  return needsAdvancedCache ? 'advanced' : 'basic';
}

/**
 * Calculates maximum cache size based on estimated data size
 */
function calculateMaxCacheSize(dataSize: 'small' | 'medium' | 'large'): number {
  switch (dataSize) {
    case 'small': return 100; // Cache up to 100 items
    case 'medium': return 500; // Cache up to 500 items
    case 'large': return 1000; // Cache up to 1000 items
    default: return 100;
  }
}

/**
 * Determines appropriate prefetch strategy
 */
function determinePrefetchStrategy(metrics: ComplexityMetrics): 'none' | 'essential' | 'aggressive' {
  if (metrics.estimatedDataSize === 'large') return 'none';
  if (metrics.hasSSR) return 'essential';
  return metrics.routeCount <= 5 ? 'aggressive' : 'essential';
}

/**
 * Determines appropriate debug level
 */
function determineDebugLevel(metrics: ComplexityMetrics): 'none' | 'error' | 'warning' | 'info' | 'debug' {
  if (metrics.estimatedDataSize === 'large') return 'error';
  if (metrics.routeCount > 15) return 'warning';
  return 'info';
}