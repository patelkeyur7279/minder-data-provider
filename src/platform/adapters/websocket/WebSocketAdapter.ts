/**
 * WebSocketAdapter - Base class for platform-specific WebSocket implementations
 * 
 * Provides common functionality:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping-pong mechanism
 * - Event handling (open, close, error, message)
 * - Message queue for offline messages
 * - Connection state management
 * 
 * @module WebSocketAdapter
 */

/**
 * WebSocket connection state
 */
export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

/**
 * WebSocket configuration
 */
export interface WebSocketConfig {
  /**
   * WebSocket URL
   */
  url: string;

  /**
   * Sub-protocols
   */
  protocols?: string | string[];

  /**
   * Enable automatic reconnection
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Maximum reconnection attempts
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * Initial reconnection delay (ms)
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum reconnection delay (ms)
   * @default 30000
   */
  maxReconnectDelay?: number;

  /**
   * Enable heartbeat/ping
   * @default true
   */
  enableHeartbeat?: boolean;

  /**
   * Heartbeat interval (ms)
   * @default 30000
   */
  heartbeatInterval?: number;

  /**
   * Heartbeat timeout (ms)
   * @default 5000
   */
  heartbeatTimeout?: number;

  /**
   * Custom heartbeat message
   * @default "ping"
   */
  heartbeatMessage?: string;

  /**
   * Expected pong response
   * @default "pong"
   */
  pongMessage?: string;

  /**
   * Queue messages when disconnected
   * @default true
   */
  queueMessages?: boolean;

  /**
   * Maximum queued messages
   * @default 100
   */
  maxQueueSize?: number;

  /**
   * Connection timeout (ms)
   * @default 10000
   */
  connectionTimeout?: number;

  /**
   * Callback when connection opens
   */
  onOpen?: (event: Event) => void;

  /**
   * Callback when connection closes
   */
  onClose?: (event: CloseEvent) => void;

  /**
   * Callback on error
   */
  onError?: (error: Error) => void;

  /**
   * Callback on message received
   */
  onMessage?: (data: any) => void;

  /**
   * Callback on reconnecting
   */
  onReconnecting?: (attempt: number) => void;

  /**
   * Callback on reconnected
   */
  onReconnected?: () => void;
}

/**
 * Message queue item
 */
interface QueuedMessage {
  data: any;
  timestamp: number;
}

/**
 * Abstract WebSocket Adapter
 */
export abstract class WebSocketAdapter {
  protected config: Required<Omit<WebSocketConfig, 'protocols' | 'onOpen' | 'onClose' | 'onError' | 'onMessage' | 'onReconnecting' | 'onReconnected'>> & {
    protocols?: string | string[];
    onOpen?: (event: Event) => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (error: Error) => void;
    onMessage?: (data: any) => void;
    onReconnecting?: (attempt: number) => void;
    onReconnected?: () => void;
  };

  protected ws: WebSocket | null = null;
  protected messageQueue: QueuedMessage[] = [];
  protected reconnectAttempts = 0;
  protected reconnectTimer: any = null;
  protected heartbeatTimer: any = null;
  protected heartbeatTimeoutTimer: any = null;
  protected lastPongTime = 0;
  protected isReconnecting = false;
  protected manualClose = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      protocols: config.protocols,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      enableHeartbeat: config.enableHeartbeat ?? true,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 5000,
      heartbeatMessage: config.heartbeatMessage ?? 'ping',
      pongMessage: config.pongMessage ?? 'pong',
      queueMessages: config.queueMessages ?? true,
      maxQueueSize: config.maxQueueSize ?? 100,
      connectionTimeout: config.connectionTimeout ?? 10000,
      onOpen: config.onOpen,
      onClose: config.onClose,
      onError: config.onError,
      onMessage: config.onMessage,
      onReconnecting: config.onReconnecting,
      onReconnected: config.onReconnected,
    };
  }

  /**
   * Create platform-specific WebSocket instance
   */
  protected abstract createWebSocket(url: string, protocols?: string | string[]): WebSocket;

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocketState.OPEN) {
      return;
    }

    this.manualClose = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = this.createWebSocket(this.config.url, this.config.protocols);

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocketState.OPEN) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.ws.onopen = (event) => {
          clearTimeout(connectionTimeout);
          this.handleOpen(event as Event);
          resolve();
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.handleClose(event);
        };

        this.ws.onerror = (event) => {
          clearTimeout(connectionTimeout);
          const error = new Error('WebSocket error');
          this.handleError(error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(code = 1000, reason = 'Normal closure'): void {
    this.manualClose = true;
    this.clearTimers();

    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }

  /**
   * Send message
   */
  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocketState.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
    } else if (this.config.queueMessages) {
      this.queueMessage(data);
    } else {
      throw new Error('WebSocket is not connected');
    }
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.ws?.readyState ?? WebSocketState.CLOSED;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocketState.OPEN;
  }

  /**
   * Get queued message count
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
  }

  /**
   * Handle connection open
   */
  protected handleOpen(event: Event): void {
    this.reconnectAttempts = 0;
    
    if (this.isReconnecting) {
      this.isReconnecting = false;
      this.config.onReconnected?.();
    }

    // Send queued messages
    this.flushQueue();

    // Start heartbeat
    if (this.config.enableHeartbeat) {
      this.startHeartbeat();
    }

    this.config.onOpen?.(event);
  }

  /**
   * Handle connection close
   */
  protected handleClose(event: CloseEvent): void {
    this.clearTimers();

    this.config.onClose?.(event);

    // Attempt reconnection if not manual close
    if (!this.manualClose && this.config.autoReconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle error
   */
  protected handleError(error: Error): void {
    this.config.onError?.(error);
  }

  /**
   * Handle incoming message
   */
  protected handleMessage(event: MessageEvent): void {
    const data = this.parseMessage(event.data);

    // Check if it's a pong response
    if (data === this.config.pongMessage) {
      this.lastPongTime = Date.now();
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }
      return;
    }

    this.config.onMessage?.(data);
  }

  /**
   * Parse incoming message
   */
  protected parseMessage(data: any): any {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  /**
   * Queue message for later sending
   */
  protected queueMessage(data: any): void {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }

    this.messageQueue.push({
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Send all queued messages
   */
  protected flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const { data } = this.messageQueue.shift()!;
      try {
        this.send(data);
      } catch (error) {
        // Re-queue if send fails
        this.queueMessage(data);
        break;
      }
    }
  }

  /**
   * Attempt to reconnect
   */
  protected attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.config.onError?.(new Error('Max reconnection attempts reached'));
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    this.config.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.config.onError?.(error);
      });
    }, delay);
  }

  /**
   * Start heartbeat timer
   */
  protected startHeartbeat(): void {
    this.clearHeartbeatTimers();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocketState.OPEN) {
        this.send(this.config.heartbeatMessage);

        // Start timeout timer
        this.heartbeatTimeoutTimer = setTimeout(() => {
          // No pong received, consider connection dead
          this.config.onError?.(new Error('Heartbeat timeout'));
          this.ws?.close();
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Clear all timers
   */
  protected clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.clearHeartbeatTimers();
  }

  /**
   * Clear heartbeat timers
   */
  protected clearHeartbeatTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}
