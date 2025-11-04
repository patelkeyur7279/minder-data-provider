/**
 * WebSocketAdapterFactory - Auto-selects appropriate WebSocket adapter
 * 
 * Detects platform and creates the correct adapter.
 * 
 * @module WebSocketAdapterFactory
 */

import { PlatformDetector } from '../../PlatformDetector.js';
import type { WebSocketAdapter, WebSocketConfig } from './WebSocketAdapter.js';
import { WebWebSocketAdapter } from './WebWebSocketAdapter.js';
import { NativeWebSocketAdapter } from './NativeWebSocketAdapter.js';

/**
 * Create WebSocket adapter based on current platform
 */
export function createWebSocketAdapter(config: WebSocketConfig): WebSocketAdapter {
  const platform = PlatformDetector.detect();

  switch (platform) {
    case 'web':
    case 'nextjs':
    case 'electron':
      return new WebWebSocketAdapter(config);

    case 'react-native':
    case 'expo':
      return new NativeWebSocketAdapter(config);

    case 'node':
      throw new Error('WebSocket adapter not available for Node.js server environment');

    default:
      // Fallback to web adapter
      return new WebWebSocketAdapter(config);
  }
}

/**
 * Create WebSocket adapter with fallback
 */
export function createWebSocketAdapterWithFallback(
  config: WebSocketConfig
): WebSocketAdapter {
  try {
    return createWebSocketAdapter(config);
  } catch (error) {
    console.warn('Failed to create platform-specific WebSocket adapter, using fallback:', error);
    return new WebWebSocketAdapter(config);
  }
}

/**
 * Create specific WebSocket adapter by name
 */
export function createWebSocketAdapterByName(
  name: 'web' | 'native',
  config: WebSocketConfig
): WebSocketAdapter {
  switch (name) {
    case 'web':
      return new WebWebSocketAdapter(config);
    case 'native':
      return new NativeWebSocketAdapter(config);
    default:
      throw new Error(`Unknown WebSocket adapter: ${name}`);
  }
}

/**
 * Get available WebSocket adapters
 */
export function getAvailableWebSocketAdapters(): string[] {
  const adapters: string[] = [];

  if (WebWebSocketAdapter.isSupported()) {
    adapters.push('web');
  }

  if (NativeWebSocketAdapter.isSupported()) {
    adapters.push('native');
  }

  return adapters;
}

/**
 * Check if specific WebSocket adapter is available
 */
export function isWebSocketAdapterAvailable(name: 'web' | 'native'): boolean {
  switch (name) {
    case 'web':
      return WebWebSocketAdapter.isSupported();
    case 'native':
      return NativeWebSocketAdapter.isSupported();
    default:
      return false;
  }
}
