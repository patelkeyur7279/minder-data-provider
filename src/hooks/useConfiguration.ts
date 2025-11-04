/**
 * Hook for managing Minder configuration
 * Allows runtime configuration updates and feature toggling
 */

import { useCallback, useEffect, useState } from 'react';
import { useMinderContext } from '../core/MinderDataProvider.js';
import type { MinderConfig } from '../core/types.js';
import { SmartConfigManager } from '../core/SmartConfig.js';

export interface ConfigurationOptions {
  /** Monitor performance metrics */
  monitorPerformance?: boolean;
  /** Monitor security metrics */
  monitorSecurity?: boolean;
  /** Enable automatic optimization */
  autoOptimize?: boolean;
  /** Callback when configuration changes */
  onConfigChange?: (newConfig: MinderConfig) => void;
}

export function useConfiguration(options: ConfigurationOptions = {}) {
  const context = useMinderContext();
  const [configManager] = useState(() => new SmartConfigManager(context.config, {
    mode: 'auto',
    performance: {
      autoOptimize: options.autoOptimize,
      enableCodeSplitting: true,
    },
  }));

  const [metrics, setMetrics] = useState({
    performance: {
      apiLatency: 0,
      cacheHitRate: 0,
      bundleSize: 0,
      memoryUsage: 0,
    },
    security: {
      failedAuthAttempts: 0,
      rateLimitHits: 0,
      suspiciousRequests: 0,
    },
  });

  // Listen for configuration updates
  useEffect(() => {
    const handleConfigUpdate = (event: CustomEvent<MinderConfig>) => {
      if (options.onConfigChange) {
        options.onConfigChange(event.detail);
      }
    };

    window.addEventListener('minder:config-update', handleConfigUpdate as EventListener);
    return () => {
      window.removeEventListener('minder:config-update', handleConfigUpdate as EventListener);
    };
  }, [options.onConfigChange]);

  // Collect metrics if enabled
  useEffect(() => {
    if (!options.monitorPerformance && !options.monitorSecurity) return;

    const interval = setInterval(() => {
      if (options.monitorPerformance) {
        // Collect performance metrics
        setMetrics(prev => ({
          ...prev,
          performance: {
            apiLatency: calculateApiLatency(),
            cacheHitRate: calculateCacheHitRate(),
            bundleSize: calculateBundleSize(),
            memoryUsage: calculateMemoryUsage(),
          },
        }));
      }

      if (options.monitorSecurity) {
        // Collect security metrics
        setMetrics(prev => ({
          ...prev,
          security: {
            failedAuthAttempts: getFailedAuthAttempts(),
            rateLimitHits: getRateLimitHits(),
            suspiciousRequests: getSuspiciousRequests(),
          },
        }));
      }
    }, 30000); // Collect metrics every 30 seconds

    return () => clearInterval(interval);
  }, [options.monitorPerformance, options.monitorSecurity]);

  const upgradeToFull = useCallback(() => {
    return configManager.upgradeToFull();
  }, [configManager]);

  const updateFeature = useCallback(<K extends keyof MinderConfig>(
    feature: K,
    config: Partial<MinderConfig[K]>
  ) => {
    configManager.updateFeature(feature, config);
  }, [configManager]);

  const optimizeForCurrentUsage = useCallback(() => {
    configManager.getCurrentConfig();
  }, [configManager]);

  return {
    /** Current configuration */
    config: configManager.getCurrentConfig(),
    /** Upgrade to full feature set */
    upgradeToFull,
    /** Update specific feature configuration */
    updateFeature,
    /** Optimize configuration for current usage patterns */
    optimizeForCurrentUsage,
    /** Current performance and security metrics */
    metrics,
  };
}

// Utility functions for metric collection
function calculateApiLatency(): number {
  // Implement API latency calculation
  return 0;
}

function calculateCacheHitRate(): number {
  // Implement cache hit rate calculation
  return 0;
}

function calculateBundleSize(): number {
  // Implement bundle size calculation
  return 0;
}

function calculateMemoryUsage(): number {
  // Implement memory usage calculation
  return 0;
}

function getFailedAuthAttempts(): number {
  // Implement failed auth attempts tracking
  return 0;
}

function getRateLimitHits(): number {
  // Implement rate limit hits tracking
  return 0;
}

function getSuspiciousRequests(): number {
  // Implement suspicious requests tracking
  return 0;
}