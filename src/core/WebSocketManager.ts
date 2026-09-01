import { Logger, LogLevel } from '../utils/Logger.js';
import type { WebSocketConfig } from './types.js';
import { AuthManager } from './AuthManager.js';
import type { DebugManager } from '../debug/DebugManager.js';
import { DebugLogType } from '../constants/enums.js';
import { createWebSocketAdapterWithFallback } from '../platform/adapters/websocket/WebSocketAdapterFactory.js';
import type { WebSocketAdapter } from '../platform/adapters/websocket/WebSocketAdapter.js';

const logger = /*#__PURE__*/ new Logger('WebSocketManager', { level: LogLevel.WARN });

export class WebSocketManager {
  private config: WebSocketConfig;
  private authManager: AuthManager;
  private adapter: WebSocketAdapter | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private debugManager?: DebugManager;
  private enableLogs: boolean;

  private offlineQueue: Array<{ type: string; data: unknown }> = [];

  constructor(config: WebSocketConfig, authManager: AuthManager, debugManager?: DebugManager, enableLogs: boolean = false) {
    this.config = config;
    this.authManager = authManager;
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
  }

  connect(): Promise<void> {
    const connectPromise = new Promise<void>((resolve, reject) => {
      try {
        if (!this.config.url) {
          reject(new Error('WebSocket URL is required'));
          return;
        }

        const token = this.authManager.getToken();
        const url = token ? `${this.config.url}?token=${token}` : this.config.url;

        if (this.debugManager && this.enableLogs) {
          this.debugManager.log(DebugLogType.WEBSOCKET, '🔌 WS CONNECTING', {
            url: this.config.url,
            hasToken: !!token,
            protocols: this.config.protocols,
          });
        }

        // Create platform-specific adapter with enhanced config
        const adapterConfig = {
          url,
          protocols: this.config.protocols,
          autoReconnect: this.config.reconnect ?? true,
          maxReconnectAttempts: this.maxReconnectAttempts,
          enableHeartbeat: !!this.config.heartbeat,
          heartbeatInterval: this.config.heartbeat || 30000,
          onOpen: () => {
            logger.debug('connected');
            this.reconnectAttempts = 0;
            this.startHeartbeat();

            if (this.debugManager && this.enableLogs) {
              this.debugManager.log(DebugLogType.WEBSOCKET, '✅ WS CONNECTED', {
                url: this.config.url,
                readyState: this.adapter?.getState(),
              });
            }

            // Flush offline queue
            this.flushOfflineQueue();

            resolve();
          },
          onClose: (event: CloseEvent) => {
            logger.debug('disconnected:', event.code, event.reason);
            this.stopHeartbeat();

            if (this.debugManager && this.enableLogs) {
              this.debugManager.log(DebugLogType.WEBSOCKET, '🔌 WS CLOSED', {
                code: event.code,
                reason: event.reason,
                reconnectAttempts: this.reconnectAttempts,
              });
            }

            if (this.config.reconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
            }
          },
          onError: (error: Error) => {
            logger.error('error:', error);

            if (this.debugManager && this.enableLogs) {
              this.debugManager.log(DebugLogType.WEBSOCKET, '❌ WS ERROR', { error });
            }

            reject(error);
          },
          onMessage: (data: any) => {
            try {
              const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

              if (this.debugManager && this.enableLogs) {
                this.debugManager.log(DebugLogType.WEBSOCKET, '📨 WS MESSAGE', {
                  type: parsedData.type,
                  dataSize: JSON.stringify(parsedData).length,
                });
              }

              this.handleMessage(parsedData);
            } catch (error) {
              logger.error('Failed to parse message:', error);
            }
          },
        };

        this.adapter = createWebSocketAdapterWithFallback(adapterConfig);
        this.adapter.connect().catch(reject);

      } catch (error) {
        reject(error);
      }
    });

    // N3 (fix-2.2.0-blockers): guarantee at least one rejection handler is
    // attached to THIS promise, so a connect() failure (dead port, restarted
    // server, network blip, missing URL, adapter error, ...) can never
    // surface as an unhandled rejection — fatal to a Node-hosted consumer
    // (SSR, Electron main, the /node and /electron subpaths) and an
    // "Uncaught (in promise)" in browsers. Reproduced two ways: the public
    // `useWebSocket().connect()` (src/hooks/index.ts) previously discarded
    // this promise entirely, and the `onClose` reconnect path just below
    // (`setTimeout(() => this.connect(), ...)`) does the identical discard
    // internally on every automatic reconnect attempt. Same bug class as F5
    // (src/utils/performance.ts's RequestDeduplicator, src/core/ApiClient.ts's
    // GET auto-fetch path). This handler is a silent no-op — it does NOT
    // swallow or alter the rejection for a caller that DOES attach its own
    // `.catch()`/`await`: every handler attached to a promise fires
    // independently when the promise settles, so `connect().catch(...)` at
    // the call site still observes the real error.
    connectPromise.catch(() => { /* see comment above */ });

    return connectPromise;
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.adapter) {
      this.adapter.disconnect();
      this.adapter = null;

      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.WEBSOCKET, '🔌 WS DISCONNECT', {});
      }
    }
  }

  send(type: string, data: unknown): void {
    if (this.adapter && this.adapter.isConnected()) {
      const message = { type, data };
      this.adapter.send(JSON.stringify(message));

      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.WEBSOCKET, '📤 WS SEND', {
          type,
          dataSize: JSON.stringify(message).length,
        });
      }
    } else {
      // Queue message if offline
      this.offlineQueue.push({ type, data });

      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.WEBSOCKET, '📥 WS QUEUED (OFFLINE)', {
          type,
          queueSize: this.offlineQueue.length,
        });
      }
    }
  }

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length > 0) {
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.WEBSOCKET, '🚀 WS FLUSHING QUEUE', {
          count: this.offlineQueue.length,
        });
      }

      while (this.offlineQueue.length > 0) {
        const item = this.offlineQueue.shift();
        if (item) {
          this.send(item.type, item.data);
        }
      }
    }
  }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback);

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '👂 WS SUBSCRIBE', {
        event,
        listenerCount: this.listeners.get(event)?.size || 0,
      });
    }

    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);

        if (this.debugManager && this.enableLogs) {
          this.debugManager.log(DebugLogType.WEBSOCKET, '🔇 WS UNSUBSCRIBE', {
            event,
            listenerCount: eventListeners.size,
          });
        }
      }
    };
  }

  private handleMessage(message: { type: string; data: unknown }): void {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach(callback => callback(message.data));
    }
  }

  private startHeartbeat(): void {
    if (this.config.heartbeat) {
      this.heartbeatInterval = setInterval(() => {
        this.send('ping', { timestamp: Date.now() });
      }, this.config.heartbeat);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isConnected(): boolean {
    return this.adapter?.isConnected() ?? false;
  }
}