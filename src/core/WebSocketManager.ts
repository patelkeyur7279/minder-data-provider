import { Logger, LogLevel } from '../utils/Logger.js';
import type { WebSocketConfig } from './types.js';
import { AuthManager } from './AuthManager.js';

const logger = new Logger('WebSocketManager', { level: LogLevel.WARN });

export class WebSocketManager {
  private config: WebSocketConfig;
  private authManager: AuthManager;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: any = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(config: WebSocketConfig, authManager: AuthManager) {
    this.config = config;
    this.authManager = authManager;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = this.authManager.getToken();
        const url = token ? `${this.config.url}?token=${token}` : this.config.url;
        
        this.ws = new WebSocket(url, this.config.protocols);

        this.ws.onopen = () => {
          logger.debug('connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            logger.error('Failed to parse message:', error);
          }
        };

        this.ws.onclose = (event) => {
          logger.debug('disconnected:', event.code, event.reason);
          this.stopHeartbeat();
          
          if (this.config.reconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (error) => {
          logger.error('error:', error);
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
    }
  }

  send(type: string, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback);
    
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
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