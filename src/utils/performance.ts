/**
 * Performance Optimization Utilities for minder-data-provider
 * Provides memoization, request batching, bundle analysis, and monitoring
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DependencyList } from 'react';

// ============================================================================
// REQUEST BATCHING
// ============================================================================

interface BatchedRequest {
  route: string;
  resolve: (data: any) => void;
  reject: (error: any) => void;
}

/**
 * Request Batcher - Batches multiple API requests into a single call
 * Reduces network overhead and improves performance
 */
export class RequestBatcher {
  private queue: Map<string, BatchedRequest[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private batchDelay: number;

  constructor(batchDelay: number = 10) {
    this.batchDelay = batchDelay;
  }

  /**
   * Add request to batch queue
   */
  add(route: string, executor: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.queue.has(route)) {
        this.queue.set(route, []);
      }

      this.queue.get(route)!.push({ route, resolve, reject });

      // Clear existing timer
      if (this.timers.has(route)) {
        clearTimeout(this.timers.get(route)!);
      }

      // Set new timer to execute batch
      const timer = setTimeout(() => {
        this.flush(route, executor);
      }, this.batchDelay);

      this.timers.set(route, timer);
    });
  }

  /**
   * Execute batched requests
   */
  private async flush(route: string, executor: () => Promise<any>) {
    const requests = this.queue.get(route) || [];
    if (requests.length === 0) return;

    this.queue.delete(route);
    this.timers.delete(route);

    try {
      const result = await executor();
      
      // Resolve all pending requests with the same result
      requests.forEach(req => req.resolve(result));
    } catch (error) {
      // Reject all pending requests
      requests.forEach(req => req.reject(error));
    }
  }

  /**
   * Clear all batched requests
   */
  clear() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.queue.clear();
    this.timers.clear();
  }
}

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

/**
 * Request Deduplicator - Prevents duplicate simultaneous requests
 * Returns cached promise for identical concurrent requests
 */
export class RequestDeduplicator {
  private pending: Map<string, PendingRequest> = new Map();
  private maxAge: number;

  constructor(maxAge: number = 5000) {
    this.maxAge = maxAge;
  }

  /**
   * Get or create request
   */
  async deduplicate<T>(key: string, executor: () => Promise<T>): Promise<T> {
    // Check if we have a pending request
    const existing = this.pending.get(key);
    const now = Date.now();

    if (existing && (now - existing.timestamp) < this.maxAge) {
      return existing.promise as Promise<T>;
    }

    // Create new request
    const promise = executor();
    this.pending.set(key, {
      promise,
      timestamp: now,
    });

    // Clean up after completion
    promise.finally(() => {
      const current = this.pending.get(key);
      if (current?.promise === promise) {
        this.pending.delete(key);
      }
    });

    return promise;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.pending.clear();
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export interface PerformanceMetrics {
  requestCount: number;
  averageLatency: number;
  cacheHitRate: number;
  errorRate: number;
  slowestRequests: Array<{ route: string; duration: number }>;
  memoryUsage?: number;
}

/**
 * Performance Monitor - Tracks and analyzes performance metrics
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private errors: number = 0;
  private totalRequests: number = 0;

  /**
   * Record request latency
   */
  recordLatency(route: string, duration: number) {
    if (!this.metrics.has(route)) {
      this.metrics.set(route, []);
    }
    this.metrics.get(route)!.push(duration);
    this.totalRequests++;
  }

  /**
   * Record cache hit
   */
  recordCacheHit() {
    this.cacheHits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss() {
    this.cacheMisses++;
  }

  /**
   * Record error
   */
  recordError() {
    this.errors++;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const allLatencies: number[] = [];
    const slowestRequests: Array<{ route: string; duration: number }> = [];

    this.metrics.forEach((latencies, route) => {
      allLatencies.push(...latencies);
      const maxLatency = Math.max(...latencies);
      slowestRequests.push({ route, duration: maxLatency });
    });

    slowestRequests.sort((a, b) => b.duration - a.duration);

    const averageLatency = allLatencies.length > 0
      ? allLatencies.reduce((sum, lat) => sum + lat, 0) / allLatencies.length
      : 0;

    const totalCacheAttempts = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheAttempts > 0
      ? (this.cacheHits / totalCacheAttempts) * 100
      : 0;

    const errorRate = this.totalRequests > 0
      ? (this.errors / this.totalRequests) * 100
      : 0;

    return {
      requestCount: this.totalRequests,
      averageLatency: Math.round(averageLatency),
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      slowestRequests: slowestRequests.slice(0, 10),
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Get memory usage (if available)
   */
  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);
    }
    return undefined;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.errors = 0;
    this.totalRequests = 0;
  }
}

// ============================================================================
// REACT HOOKS FOR PERFORMANCE
// ============================================================================

/**
 * useMemoizedCallback - Memoize callback with deep dependency comparison
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: DependencyList
): T {
  const ref = useRef<T>();
  const depsRef = useRef<DependencyList>();

  if (!depsRef.current || !deepEqual(deps, depsRef.current)) {
    ref.current = callback;
    depsRef.current = deps;
  }

  return useCallback((...args: any[]) => {
    return ref.current!(...args);
  }, []) as T;
}

/**
 * useDebounce - Debounce value changes
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useThrottle - Throttle value changes
 */
export function useThrottle<T>(value: T, limit: number = 500): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * usePerformanceMonitor - Hook to monitor component performance
 */
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();
  });

  useEffect(() => {
    const endTime = performance.now();
    const duration = endTime - startTime.current;
    
    renderCount.current++;
    renderTimes.current.push(duration);

    // Keep only last 100 renders
    if (renderTimes.current.length > 100) {
      renderTimes.current.shift();
    }

    if (process.env.NODE_ENV === 'development') {
      const avgRenderTime = renderTimes.current.reduce((sum, time) => sum + time, 0) / renderTimes.current.length;
      
      if (avgRenderTime > 16) { // More than one frame (60fps)
        console.warn(
          `[Performance] ${componentName} is rendering slowly (${avgRenderTime.toFixed(2)}ms avg). ` +
          `Renders: ${renderCount.current}`
        );
      }
    }
  });

  return {
    renderCount: renderCount.current,
    averageRenderTime: renderTimes.current.length > 0
      ? renderTimes.current.reduce((sum, time) => sum + time, 0) / renderTimes.current.length
      : 0,
  };
}

/**
 * useLazyLoad - Lazy load data when component becomes visible
 */
export function useLazyLoad<T>(
  loader: () => Promise<T>,
  options: {
    threshold?: number;
    rootMargin?: string;
  } = {}
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current || !elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !loadedRef.current) {
          loadedRef.current = true;
          setLoading(true);

          loader()
            .then(setData)
            .catch(setError)
            .finally(() => setLoading(false));
        }
      },
      {
        threshold: options.threshold || 0.1,
        rootMargin: options.rootMargin || '50px',
      }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loader, options.threshold, options.rootMargin]);

  return { data, loading, error };
}

// ============================================================================
// BUNDLE SIZE ANALYSIS
// ============================================================================

/**
 * Get approximate bundle size impact
 */
export function getBundleSizeImpact(features: string[]): {
  estimatedSize: number;
  recommendations: string[];
} {
  const sizeMap: Record<string, number> = {
    'crud': 15,
    'auth': 10,
    'cache': 8,
    'websocket': 12,
    'upload': 7,
    'debug': 5,
    'ssr': 6,
    'redux': 20,
    'tanstack-query': 25,
  };

  const estimatedSize = features.reduce((total, feature) => {
    return total + (sizeMap[feature] || 0);
  }, 0);

  const recommendations: string[] = [];

  if (features.includes('redux') && features.includes('tanstack-query')) {
    recommendations.push('Consider using only one state management solution');
  }

  if (estimatedSize > 100) {
    recommendations.push('Bundle size is large. Consider code splitting or removing unused features');
  }

  if (!features.includes('tree-shaking')) {
    recommendations.push('Enable tree-shaking in your bundler configuration');
  }

  return { estimatedSize, recommendations };
}

// ============================================================================
// MEMORY LEAK PREVENTION
// ============================================================================

/**
 * useUnmountCleanup - Ensure cleanup on component unmount
 */
export function useUnmountCleanup(cleanup: () => void) {
  useEffect(() => {
    return cleanup;
  }, []);
}

/**
 * useAbortController - Create abort controller that auto-cancels on unmount
 */
export function useAbortController(): AbortController {
  const controllerRef = useRef<AbortController>();

  if (!controllerRef.current) {
    controllerRef.current = new AbortController();
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return controllerRef.current;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Deep equality check for dependencies
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

// Fix React import
import React from 'react';
