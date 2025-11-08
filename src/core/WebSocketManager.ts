import { Logger, LogLevel } from '../utils/Logger.js';
import type { WebSocketConfig } from './types.js';
import { AuthManager } from './AuthManager.js';
import type { DebugManager } from '../debug/DebugManager.js';

const logger = new Logger('WebSocketManager', { level: LogLevel.WARN });

export class WebSocketManager {
  private config: WebSocketConfig;
  private authManager: AuthManager;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: any = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private debugManager?: DebugManager;
  private enableLogs: boolean;

  constructor(config: WebSocketConfig, authManager: AuthManager, debugManager?: DebugManager, enableLogs: boolean = false) {
    this.config = config;
    this.authManager = authManager;
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = this.authManager.getToken();
        const url = token ? `${this.config.url}?token=${token}` : this.config.url;
        
        if (this.debugManager && this.enableLogs) {
          this.debugManager.log('websocket', '🔌 WS CONNECTING', {
            url: this.config.url,
            hasToken: !!token,
            protocols: this.config.protocols,
          });
        }
        
        this.ws = new WebSocket(url, this.config.protocols);

        this.ws.onopen = () => {
          logger.debug('connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          
          if (this.debugManager && this.enableLogs) {
            this.debugManager.log('websocket', '✅ WS CONNECTED', {
              url: this.config.url,
              readyState: this.ws?.readyState,
            });
          }
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (this.debugManager && this.enableLogs) {
              this.debugManager.log('websocket', '📨 WS MESSAGE', {
                type: data.type,
                dataSize: JSON.stringify(data).length,
              });
            }
            
            this.handleMessage(data);
          } catch (error) {
            logger.error('Failed to parse message:', error);
          }
        };

        this.ws.onclose = (event) => {
          logger.debug('disconnected:', event.code, event.reason);
          this.stopHeartbeat();
          
          if (this.debugManager && this.enableLogs) {
            this.debugManager.log('websocket', '🔌 WS CLOSED', {
              code: event.code,
              reason: event.reason,
              reconnectAttempts: this.reconnectAttempts,
            });
          }
          
          if (this.config.reconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (error) => {
          logger.error('error:', error);
          
          if (this.debugManager && this.enableLogs) {
            this.debugManager.log('websocket', '❌ WS ERROR', { error });
          }
          
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log('websocket', '🔌 WS DISCONNECT', {});
      }
    }
  }

  send(type: string, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = { type, data };
      this.ws.send(JSON.stringify(message));
      
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log('websocket', '📤 WS SEND', {
          type,
          dataSize: JSON.stringify(message).length,
        });
      }
    }
  }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log('websocket', '👂 WS SUBSCRIBE', {
        event,
        listenerCount: this.listeners.get(event)?.size || 0,
      });
    }
    
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
        
        if (this.debugManager && this.enableLogs) {
          this.debugManager.log('websocket', '🔇 WS UNSUBSCRIBE', {
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
    return this.ws?.readyState === WebSocket.OPEN;
  }
}