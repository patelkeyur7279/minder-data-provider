/**
 * Network Adapter Factory
 * Auto-selects the appropriate network adapter based on platform
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { PlatformDetector } from '../../PlatformDetector.js';
import { NetworkAdapter, NetworkAdapterConfig } from './NetworkAdapter.js';
import { WebNetworkAdapter } from './WebNetworkAdapter.js';
import { NativeNetworkAdapter } from './NativeNetworkAdapter.js';

const logger = new Logger('NetworkAdapterFactory', { level: LogLevel.WARN });

export class NetworkAdapterFactory {
  /**
   * Create network adapter for current platform
   */
  static create(config?: NetworkAdapterConfig): NetworkAdapter {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'web':
      case 'nextjs':
      case 'electron':
        return new WebNetworkAdapter(config);

      case 'react-native':
      case 'expo':
        return new NativeNetworkAdapter(config);

      case 'node':
        // For Node.js, use Web adapter with node-fetch polyfill
        return new WebNetworkAdapter(config);

      default:
        // Fallback to Web adapter
        return new WebNetworkAdapter(config);
    }
  }

  /**
   * Create network adapter with fallback
   */
  static createWithFallback(
    config?: NetworkAdapterConfig
  ): NetworkAdapter {
    try {
      const adapter = this.create(config);
      
      if (adapter.isAvailable()) {
        return adapter;
      }

      // Fallback to web adapter
      return new WebNetworkAdapter(config);
    } catch (error) {
      logger.warn('Failed to create network adapter:', error);
      return new WebNetworkAdapter(config);
    }
  }

  /**
   * Create specific adapter by name
   */
  static createAdapter(
    name: 'web' | 'native',
    config?: NetworkAdapterConfig
  ): NetworkAdapter {
    switch (name) {
      case 'web':
        return new WebNetworkAdapter(config);
      case 'native':
        return new NativeNetworkAdapter(config);
      default:
        throw new Error(`Unknown adapter: ${name}`);
    }
  }

  /**
   * Get list of available adapters
   */
  static getAvailableAdapters(): string[] {
    const adapters: string[] = [];

    const webAdapter = new WebNetworkAdapter();
    if (webAdapter.isAvailable()) {
      adapters.push('web');
    }

    const nativeAdapter = new NativeNetworkAdapter();
    if (nativeAdapter.isAvailable()) {
      adapters.push('native');
    }

    return adapters;
  }

  /**
   * Check if a specific adapter is available
   */
  static isAdapterAvailable(name: 'web' | 'native'): boolean {
    try {
      const adapter = this.createAdapter(name);
      return adapter.isAvailable();
    } catch (error) {
      return false;
    }
  }
}

/**
 * Convenience function to create network adapter
 */
export function createNetworkAdapter(config?: NetworkAdapterConfig): NetworkAdapter {
  return NetworkAdapterFactory.create(config);
}
