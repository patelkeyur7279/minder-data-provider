/**
 * WebSocket Adapters Module
 * 
 * Platform-specific WebSocket implementations with automatic
 * reconnection, heartbeat, and message queuing.
 * 
 * @module platform/adapters/websocket
 */

export * from './WebSocketAdapter.js';
export * from './WebWebSocketAdapter.js';
export * from './NativeWebSocketAdapter.js';
export * from './WebSocketAdapterFactory.js';

// Re-export factory functions for convenience
export {
  createWebSocketAdapter,
  createWebSocketAdapterWithFallback,
  createWebSocketAdapterByName,
  getAvailableWebSocketAdapters,
  isWebSocketAdapterAvailable,
} from './WebSocketAdapterFactory.js';

export {
  createWebWebSocket,
} from './WebWebSocketAdapter.js';

export {
  createNativeWebSocket,
} from './NativeWebSocketAdapter.js';
