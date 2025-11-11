/**
 * Utility to analyze application complexity and provide optimized configurations
 */

import { CacheRequirements, DataSize, CacheType, PrefetchStrategy, LogLevel } from '../constants/enums.js';

export interface ComplexityMetrics {
  routeCount: number;
  hasAuthentication: boolean;
  hasFileUploads: boolean;
  hasWebSockets: boolean;
  hasSSR: boolean;
  estimatedDataSize: DataSize;
  cacheRequirements: CacheRequirements;
}

export interface OptimizedConfig {
  cacheStrategy: {
    type: CacheType;
    ttl: number;
    maxSize: number;
  };
  prefetchStrategy: PrefetchStrategy;
  batchingStrategy: boolean;
  compressionEnabled: boolean;
  optimisticUpdates: boolean;
  backgroundSync: boolean;
  debugLevel: LogLevel;
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
      type: metrics.cacheRequirements === CacheRequirements.ADVANCED ? CacheType.HYBRID : CacheType.MEMORY,
      ttl: metrics.estimatedDataSize === DataSize.LARGE ? 300000 : 600000, // 5-10 minutes
      maxSize: calculateMaxCacheSize(metrics.estimatedDataSize),
    },
    prefetchStrategy: determinePrefetchStrategy(metrics),
    batchingStrategy: metrics.routeCount > 10,
    compressionEnabled: metrics.estimatedDataSize === DataSize.LARGE,
    optimisticUpdates: metrics.estimatedDataSize !== DataSize.LARGE,
    backgroundSync: metrics.hasWebSockets || metrics.routeCount > 5,
    debugLevel: determineDebugLevel(metrics),
  };
}

/**
 * Estimates the data size based on configuration
 */
function calculateDataSizeEstimate(config: any): DataSize {
  const routeCount = Object.keys(config.routes || {}).length;
  const hasFileUploads = Object.values(config.routes || {}).some((route: any) => 
    route.method === 'POST' && route.contentType?.includes('multipart/form-data'));
  
  if (routeCount <= 5 && !hasFileUploads) return DataSize.SMALL;
  if (routeCount <= 15 && !hasFileUploads) return DataSize.MEDIUM;
  return DataSize.LARGE;
}

/**
 * Determines appropriate cache requirements
 */
function determineCacheRequirements(config: any): CacheRequirements {
  const needsAdvancedCache = 
    config.websocket || 
    config.ssr?.enabled || 
    Object.keys(config.routes || {}).length > 10;
  
  return needsAdvancedCache ? CacheRequirements.ADVANCED : CacheRequirements.BASIC;
}

/**
 * Calculates maximum cache size based on estimated data size
 */
function calculateMaxCacheSize(dataSize: DataSize): number {
  switch (dataSize) {
    case DataSize.SMALL: return 100; // Cache up to 100 items
    case DataSize.MEDIUM: return 500; // Cache up to 500 items
    case DataSize.LARGE: return 1000; // Cache up to 1000 items
    default: return 100;
  }
}

/**
 * Determines appropriate prefetch strategy
 */
function determinePrefetchStrategy(metrics: ComplexityMetrics): PrefetchStrategy {
  if (metrics.estimatedDataSize === DataSize.LARGE) return PrefetchStrategy.NONE;
  if (metrics.hasSSR) return PrefetchStrategy.ESSENTIAL;
  return metrics.routeCount <= 5 ? PrefetchStrategy.AGGRESSIVE : PrefetchStrategy.ESSENTIAL;
}

/**
 * Determines appropriate debug level
 */
function determineDebugLevel(metrics: ComplexityMetrics): LogLevel {
  if (metrics.estimatedDataSize === DataSize.LARGE) return LogLevel.ERROR;
  if (metrics.routeCount > 15) return LogLevel.WARN;
  return LogLevel.INFO;
}