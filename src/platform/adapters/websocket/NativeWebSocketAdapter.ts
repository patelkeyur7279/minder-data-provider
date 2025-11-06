/**
 * NativeWebSocketAdapter - React Native WebSocket implementation
 * 
 * Uses React Native's WebSocket polyfill or native implementation.
 * 
 * @module NativeWebSocketAdapter
 */

import { Logger, LogLevel } from '../../../utils/Logger.js';
import { WebSocketAdapter, type WebSocketConfig } from './WebSocketAdapter.js';
import { MinderWebSocketError } from '../../../errors/index.js';

const logger = new Logger('NativeWebSocketAdapter', { level: LogLevel.WARN });

/**
 * React Native WebSocket Adapter
 */
export class NativeWebSocketAdapter extends WebSocketAdapter {
  constructor(config: WebSocketConfig) {
    super(config);
  }

  /**
   * Create React Native WebSocket
   */
  protected createWebSocket(url: string, protocols?: string | string[]): WebSocket {
    // React Native provides global WebSocket
    if (typeof WebSocket === 'undefined') {
      throw new MinderWebSocketError('WebSocket is not available in React Native environment');
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
 * Create Native WebSocket adapter
 */
export function createNativeWebSocket(config: WebSocketConfig): NativeWebSocketAdapter {
  return new NativeWebSocketAdapter(config);
}
