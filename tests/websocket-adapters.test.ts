/**
 * WebSocket Adapters Tests
 * 
 * Tests for platform-specific WebSocket implementations.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  WebSocketAdapter,
  WebSocketState,
  WebSocketConfig,
} from '../src/platform/adapters/websocket/WebSocketAdapter';
import {
  WebWebSocketAdapter,
  createWebWebSocket,
} from '../src/platform/adapters/websocket/WebWebSocketAdapter';
import {
  NativeWebSocketAdapter,
  createNativeWebSocket,
} from '../src/platform/adapters/websocket/NativeWebSocketAdapter';
import {
  createWebSocketAdapter,
  createWebSocketAdapterWithFallback,
  getAvailableWebSocketAdapters,
  isWebSocketAdapterAvailable,
} from '../src/platform/adapters/websocket/WebSocketAdapterFactory';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  protocols?: string | string[];
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: any): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({
          code: code ?? 1000,
          reason: reason ?? '',
          wasClean: true,
        } as CloseEvent);
      }
    }, 10);
  }

  // Helper to simulate receiving a message
  simulateMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage({
        data: typeof data === 'string' ? data : JSON.stringify(data),
      } as MessageEvent);
    }
  }

  // Helper to simulate error
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Set global WebSocket
(global as any).WebSocket = MockWebSocket;

describe('WebSocketAdapter', () => {
  let adapter: WebWebSocketAdapter;
  let config: WebSocketConfig;

  beforeEach(() => {
    config = {
      url: 'ws://localhost:8080',
      autoReconnect: false, // Disable for tests
      enableHeartbeat: false, // Disable for tests
    };
    adapter = new WebWebSocketAdapter(config);
  });

  afterEach(async () => {
    if (adapter) {
      adapter.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getState()).toBe(WebSocketState.OPEN);
    });

    it('should handle connection with protocols', async () => {
      const adapterWithProtocol = new WebWebSocketAdapter({
        url: 'ws://localhost:8080',
        protocols: ['v1', 'v2'],
      });

      await adapterWithProtocol.connect();
      expect(adapterWithProtocol.isConnected()).toBe(true);
      adapterWithProtocol.disconnect();
    });

    it('should call onOpen callback', async () => {
      const onOpen = jest.fn();
      const customAdapter = new WebWebSocketAdapter({
        ...config,
        onOpen,
      });

      await customAdapter.connect();
      expect(onOpen).toHaveBeenCalled();
      customAdapter.disconnect();
    });

    it('should not connect if already connected', async () => {
      await adapter.connect();
      const firstState = adapter.getState();

      await adapter.connect(); // Second call
      const secondState = adapter.getState();

      expect(firstState).toBe(secondState);
    });
  });

  describe('Disconnection', () => {
    it('should disconnect successfully', async () => {
      await adapter.connect();
      adapter.disconnect();

      // Wait for close event
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getState()).toBe(WebSocketState.CLOSED);
    });

    it('should call onClose callback', async () => {
      const onClose = jest.fn();
      const customAdapter = new WebWebSocketAdapter({
        ...config,
        onClose,
      });

      await customAdapter.connect();
      customAdapter.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onClose).toHaveBeenCalled();
    });

    it('should accept custom close code and reason', async () => {
      const onClose = jest.fn();
      const customAdapter = new WebWebSocketAdapter({
        ...config,
        onClose,
      });

      await customAdapter.connect();
      customAdapter.disconnect(4000, 'Custom reason');

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 4000,
          reason: 'Custom reason',
        })
      );
    });
  });

  describe('Sending Messages', () => {
    it('should send string messages', async () => {
      await adapter.connect();
      expect(() => adapter.send('Hello')).not.toThrow();
    });

    it('should send JSON messages', async () => {
      await adapter.connect();
      const message = { type: 'test', data: 'value' };
      expect(() => adapter.send(message)).not.toThrow();
    });

    it('should throw error when sending while disconnected', () => {
      const noQueueAdapter = new WebWebSocketAdapter({
        ...config,
        queueMessages: false, // Disable queueing
      });
      
      expect(() => noQueueAdapter.send('test')).toThrow('WebSocket is not connected');
      noQueueAdapter.disconnect();
    });

    it('should queue messages when queueMessages is enabled', () => {
      const queueAdapter = new WebWebSocketAdapter({
        ...config,
        queueMessages: true,
      });

      queueAdapter.send('message1');
      queueAdapter.send('message2');

      expect(queueAdapter.getQueueSize()).toBe(2);
      queueAdapter.disconnect();
    });

    it('should respect max queue size', () => {
      const queueAdapter = new WebWebSocketAdapter({
        ...config,
        queueMessages: true,
        maxQueueSize: 3,
      });

      for (let i = 0; i < 5; i++) {
        queueAdapter.send(`message${i}`);
      }

      expect(queueAdapter.getQueueSize()).toBe(3);
      queueAdapter.disconnect();
    });
  });

  describe('Receiving Messages', () => {
    it('should receive string messages', async () => {
      const onMessage = jest.fn();
      const customAdapter = new WebWebSocketAdapter({
        ...config,
        onMessage,
      });

      await customAdapter.connect();

      // Access the underlying WebSocket and simulate message
      const ws = (customAdapter as any).ws as MockWebSocket;
      ws.simulateMessage('Hello from server');

      expect(onMessage).toHaveBeenCalledWith('Hello from server');
      customAdapter.disconnect();
    });

    it('should receive and parse JSON messages', async () => {
      const onMessage = jest.fn();
      const customAdapter = new WebWebSocketAdapter({
        ...config,
        onMessage,
      });

      await customAdapter.connect();

      const ws = (customAdapter as any).ws as MockWebSocket;
      const message = { type: 'update', data: 'value' };
      ws.simulateMessage(JSON.stringify(message));

      expect(onMessage).toHaveBeenCalledWith(message);
      customAdapter.disconnect();
    });
  });

  describe('Message Queue', () => {
    it('should flush queue when connected', async () => {
      const queueAdapter = new WebWebSocketAdapter({
        ...config,
        queueMessages: true,
      });

      // Queue messages while disconnected
      queueAdapter.send('message1');
      queueAdapter.send('message2');

      expect(queueAdapter.getQueueSize()).toBe(2);

      await queueAdapter.connect();

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(queueAdapter.getQueueSize()).toBe(0);
      queueAdapter.disconnect();
    });

    it('should clear queue manually', () => {
      const queueAdapter = new WebWebSocketAdapter({
        ...config,
        queueMessages: true,
      });

      queueAdapter.send('message1');
      queueAdapter.send('message2');

      expect(queueAdapter.getQueueSize()).toBe(2);

      queueAdapter.clearQueue();

      expect(queueAdapter.getQueueSize()).toBe(0);
      queueAdapter.disconnect();
    });
  });

  describe('Reconnection', () => {
    it('should attempt reconnection on unexpected disconnect', async () => {
      const onReconnecting = jest.fn();
      const reconnectAdapter = new WebWebSocketAdapter({
        ...config,
        autoReconnect: true,
        maxReconnectAttempts: 2,
        reconnectDelay: 100,
        onReconnecting,
      });

      await reconnectAdapter.connect();

      // Simulate unexpected disconnect
      const ws = (reconnectAdapter as any).ws as MockWebSocket;
      ws.close(1006); // Abnormal closure

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onReconnecting).toHaveBeenCalled();
      reconnectAdapter.disconnect();
    });

    it('should not reconnect on manual disconnect', async () => {
      const onReconnecting = jest.fn();
      const reconnectAdapter = new WebWebSocketAdapter({
        ...config,
        autoReconnect: true,
        onReconnecting,
      });

      await reconnectAdapter.connect();
      reconnectAdapter.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onReconnecting).not.toHaveBeenCalled();
    });

    it('should call onReconnected callback', async () => {
      const onReconnected = jest.fn();
      const reconnectAdapter = new WebWebSocketAdapter({
        ...config,
        autoReconnect: true,
        maxReconnectAttempts: 2,
        reconnectDelay: 50,
        onReconnected,
      });

      await reconnectAdapter.connect();

      // Simulate unexpected disconnect
      const ws = (reconnectAdapter as any).ws as MockWebSocket;
      ws.close(1006);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onReconnected).toHaveBeenCalled();
      reconnectAdapter.disconnect();
    });
  });

  describe('State Management', () => {
    it('should track connection state correctly', async () => {
      expect(adapter.getState()).toBe(WebSocketState.CLOSED);

      const connectPromise = adapter.connect();
      expect(adapter.getState()).toBe(WebSocketState.CONNECTING);

      await connectPromise;
      expect(adapter.getState()).toBe(WebSocketState.OPEN);

      adapter.disconnect();
      // State changes async
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(adapter.getState()).toBe(WebSocketState.CLOSED);
    });

    it('should check connection status', async () => {
      expect(adapter.isConnected()).toBe(false);

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      adapter.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(adapter.isConnected()).toBe(false);
    });
  });
});

describe('WebWebSocketAdapter', () => {
  it('should create web WebSocket adapter', () => {
    const adapter = createWebWebSocket({ url: 'ws://localhost:8080' });
    expect(adapter).toBeInstanceOf(WebWebSocketAdapter);
    adapter.disconnect();
  });

  it('should check if WebSocket is supported', () => {
    expect(WebWebSocketAdapter.isSupported()).toBe(true);
  });
});

describe('NativeWebSocketAdapter', () => {
  it('should create native WebSocket adapter', () => {
    const adapter = createNativeWebSocket({ url: 'ws://localhost:8080' });
    expect(adapter).toBeInstanceOf(NativeWebSocketAdapter);
    adapter.disconnect();
  });

  it('should check if WebSocket is supported', () => {
    expect(NativeWebSocketAdapter.isSupported()).toBe(true);
  });
});

describe('WebSocketAdapterFactory', () => {
  it('should create adapter based on platform', () => {
    const adapter = createWebSocketAdapter({ url: 'ws://localhost:8080' });
    expect(adapter).toBeInstanceOf(WebSocketAdapter);
    adapter.disconnect();
  });

  it('should create adapter with fallback', () => {
    const adapter = createWebSocketAdapterWithFallback({ url: 'ws://localhost:8080' });
    expect(adapter).toBeInstanceOf(WebSocketAdapter);
    adapter.disconnect();
  });

  it('should get available adapters', () => {
    const adapters = getAvailableWebSocketAdapters();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters.length).toBeGreaterThan(0);
  });

  it('should check adapter availability', () => {
    expect(isWebSocketAdapterAvailable('web')).toBe(true);
  });
});
