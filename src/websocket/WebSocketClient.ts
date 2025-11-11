/**
 * 🔌 WebSocketClient - Production-ready WebSocket implementation
 * 
 * Features:
 * - ✅ Auto-reconnection with exponential backoff
 * - ✅ Heartbeat/ping-pong for connection health
 * - ✅ Message queue for offline scenarios
 * - ✅ Event subscription system
 * - ✅ TypeScript-first with full type safety
 * - ✅ Error handling and logging
 * - ✅ Connection state management
 * 
 * @example
 * const ws = new WebSocketClient({
 *   url: 'wss://api.example.com/ws',
 *   reconnect: true,
 *   heartbeat: 30000
 * });
 * 
 * ws.connect();
 * ws.subscribe('message', (data) => console.log(data));
 * ws.send('chat', { text: 'Hello!' });
 */

import type { WebSocketConfig } from '../core/types.js';
import type { DebugManager } from '../debug/DebugManager.js';
import { DebugLogType } from '../constants/enums.js';

// ============================================================================
// TYPES
// ============================================================================

export enum WebSocketState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

export interface WebSocketMessage {
  event: string;
  data: any;
  timestamp?: number;
}

export interface WebSocketEventHandler {
  (data: any): void;
}

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
}

// ============================================================================
// WEBSOCKET CLIENT
// ============================================================================

export class WebSocketClient {
  private config: Required<WebSocketConfig>;
  private ws: WebSocket | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private eventHandlers: Map<string, Set<WebSocketEventHandler>> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private debugManager?: DebugManager;
  private lastPingTime: number = 0;
  private isManualDisconnect: boolean = false;

  constructor(config: WebSocketConfig, debugManager?: DebugManager) {
    this.config = {
      url: config.url,
      protocols: config.protocols || [],
      reconnect: config.reconnect ?? true,
      heartbeat: config.heartbeat || 30000 // Default 30 seconds
    };
    this.debugManager = debugManager;
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.log('WebSocket already connected');
          resolve();
          return;
        }

        this.isManualDisconnect = false;
        this.state = WebSocketState.CONNECTING;
        this.log(`Connecting to ${this.config.url}...`);

        // Create WebSocket instance
        this.ws = new WebSocket(this.config.url, this.config.protocols);

        // Setup event listeners
        this.ws.onopen = () => {
          this.state = WebSocketState.CONNECTED;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.log('✅ WebSocket connected');

          // Start heartbeat
          this.startHeartbeat();

          // Process queued messages
          this.processMessageQueue();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.state = WebSocketState.ERROR;
          this.log('❌ WebSocket error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.state = WebSocketState.DISCONNECTED;
          this.stopHeartbeat();
          
          this.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);

          // Auto-reconnect if enabled and not manual disconnect
          if (this.config.reconnect && !this.isManualDisconnect) {
            this.attemptReconnect();
          }
        };

      } catch (error) {
        this.state = WebSocketState.ERROR;
        this.log('❌ Failed to create WebSocket connection', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    this.state = WebSocketState.DISCONNECTING;
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = WebSocketState.DISCONNECTED;
    this.log('Disconnected from WebSocket');
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('❌ Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    this.state = WebSocketState.RECONNECTING;

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        this.log('Reconnection failed', error);
      });
    }, delay);
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Send message to server
   */
  send(event: string, data: any): void {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: Date.now()
    };

    if (this.state !== WebSocketState.CONNECTED || !this.ws) {
      // Queue message for later
      this.messageQueue.push({
        event,
        data,
        timestamp: Date.now()
      });
      this.log(`Message queued (not connected): ${event}`, data);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      this.log(`📤 Sent: ${event}`, data);
    } catch (error) {
      this.log('❌ Failed to send message', error);
      // Queue for retry
      this.messageQueue.push({
        event,
        data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.log(`📥 Received: ${message.event}`, message.data);

      // Handle special ping/pong for heartbeat
      if (message.event === 'pong') {
        this.lastPingTime = Date.now();
        return;
      }

      // Trigger event handlers
      this.trigger(message.event, message.data);

      // Also trigger wildcard handlers
      this.trigger('*', message);

    } catch (error) {
      this.log('❌ Failed to parse message', error);
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    this.log(`Processing ${this.messageQueue.length} queued messages...`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(({ event, data }) => {
      this.send(event, data);
    });
  }

  // ============================================================================
  // EVENT SUBSCRIPTION
  // ============================================================================

  /**
   * Subscribe to event
   */
  subscribe(event: string, handler: WebSocketEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);
    this.log(`Subscribed to event: ${event}`);

    // Return unsubscribe function
    return () => this.unsubscribe(event, handler);
  }

  /**
   * Subscribe to event (alias for subscribe)
   */
  on(event: string, handler: WebSocketEventHandler): () => void {
    return this.subscribe(event, handler);
  }

  /**
   * Unsubscribe from event
   */
  unsubscribe(event: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
      this.log(`Unsubscribed from event: ${event}`);
    }
  }

  /**
   * Unsubscribe from event (alias)
   */
  off(event: string, handler: WebSocketEventHandler): void {
    this.unsubscribe(event, handler);
  }

  /**
   * Trigger event handlers
   */
  private trigger(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers || handlers.size === 0) return;

    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        this.log(`❌ Error in event handler for ${event}`, error);
      }
    });
  }

  // ============================================================================
  // HEARTBEAT (Keep-Alive)
  // ============================================================================

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (!this.config.heartbeat || this.config.heartbeat <= 0) return;

    this.stopHeartbeat(); // Clear any existing interval

    this.heartbeatInterval = setInterval(() => {
      if (this.state === WebSocketState.CONNECTED && this.ws) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, this.config.heartbeat);

    this.log(`Heartbeat started (${this.config.heartbeat}ms)`);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log('Heartbeat stopped');
    }
  }

  // ============================================================================
  // STATE & UTILITIES
  // ============================================================================

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if connecting
   */
  isConnecting(): boolean {
    return this.state === WebSocketState.CONNECTING ||
           this.state === WebSocketState.RECONNECTING;
  }

  /**
   * Get message queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
    this.log('Message queue cleared');
  }

  /**
   * Get connection info
   */
  getInfo(): {
    state: WebSocketState;
    url: string;
    connected: boolean;
    queueSize: number;
    reconnectAttempts: number;
  } {
    return {
      state: this.state,
      url: this.config.url,
      connected: this.isConnected(),
      queueSize: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.disconnect();
    this.eventHandlers.clear();
    this.messageQueue = [];
    this.log('WebSocketClient destroyed');
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: any): void {
    if (this.debugManager) {
      this.debugManager.log(DebugLogType.WEBSOCKET, message, data);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocket] ${message}`, data || '');
    }
  }
}

/**
 * Create WebSocket client instance
 */
export function createWebSocketClient(
  config: WebSocketConfig,
  debugManager?: DebugManager
): WebSocketClient {
  return new WebSocketClient(config, debugManager);
}
