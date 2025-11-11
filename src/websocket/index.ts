// Modular WebSocket exports
// Export WebSocket client
export { WebSocketClient, createWebSocketClient, WebSocketState } from './WebSocketClient.js';
export type { WebSocketMessage, WebSocketEventHandler } from './WebSocketClient.js';

// Export the useWebSocket hook
export { useWebSocket } from '../hooks/index.js';

// Export WebSocket configuration types
export type { WebSocketConfig } from '../core/types.js';