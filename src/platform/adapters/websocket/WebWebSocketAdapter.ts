/**
 * WebWebSocketAdapter - Browser native WebSocket implementation
 * 
 * Uses native browser WebSocket API.
 * 
 * @module WebWebSocketAdapter
 */

import { WebSocketAdapter, WebSocketConfig } from './WebSocketAdapter.js';

/**
 * Web (Browser) WebSocket Adapter
 */
export class WebWebSocketAdapter extends WebSocketAdapter {
  constructor(config: WebSocketConfig) {
    super(config);
  }

  /**
   * Create native browser WebSocket
   */
  protected createWebSocket(url: string, protocols?: string | string[]): WebSocket {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not supported in this environment');
    }

    return new WebSocket(url, protocols);
  }

  /**
   * Check if WebSocket is supported
   */
  static isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  }
}

/**
 * Create Web WebSocket adapter
 */
export function createWebWebSocket(config: WebSocketConfig): WebWebSocketAdapter {
  return new WebWebSocketAdapter(config);
}
