/**
 * Network Adapters Module
 * Platform-specific HTTP clients
 */

export * from './NetworkAdapter.js';
export * from './WebNetworkAdapter.js';
export * from './NativeNetworkAdapter.js';
export * from './NetworkAdapterFactory.js';

// Re-export main types
export type {
  HttpMethod,
  NetworkRequest,
  NetworkResponse,
  NetworkError,
  NetworkAdapterConfig,
} from './NetworkAdapter.js';

// Re-export classes
export {
  NetworkAdapter,
  createNetworkError,
} from './NetworkAdapter.js';

export {
  WebNetworkAdapter,
  createWebNetworkAdapter,
} from './WebNetworkAdapter.js';

export {
  NativeNetworkAdapter,
  createNativeNetworkAdapter,
} from './NativeNetworkAdapter.js';

export {
  NetworkAdapterFactory,
  createNetworkAdapter,
} from './NetworkAdapterFactory.js';
