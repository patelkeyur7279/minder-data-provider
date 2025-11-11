/**
 * WebSocketManager Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketManager } from '../src/core/WebSocketManager';
import { AuthManager } from '../src/core/AuthManager';
import { DebugManager } from '../src/debug/DebugManager';
import type { WebSocketConfig } from '../src/core/types';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(public url: string, public protocols?: string | string[]) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string): void {
    // Mock send
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateError(error: Error): void {
    this.onerror?.(new ErrorEvent('error', { error }));
  }
}

// Set up global WebSocket mock
(global as any).WebSocket = MockWebSocket;

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let authManager: AuthManager;
  let debugManager: DebugManager;
  let wsConfig: WebSocketConfig;
  let originalWebSocket: any;

  beforeEach(() => {
    // Save original mock
    originalWebSocket = (global as any).WebSocket;
    // Reset to MockWebSocket before each test
    (global as any).WebSocket = MockWebSocket;

    authManager = {
      getToken: jest.fn(() => 'test-token'),
    } as any;

    debugManager = {
      log: jest.fn(),
    } as any;

    wsConfig = {
      url: 'ws://localhost:8080',
      protocols: ['v1'],
      reconnect: true,
      heartbeat: 30000,
    };
  });

  afterEach(() => {
    if (wsManager) {
      wsManager.disconnect();
    }
    // Restore WebSocket mock after each test
    (global as any).WebSocket = originalWebSocket;
  });

  describe('Constructor', () => {
    it('should create WebSocketManager with config', () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      expect(wsManager).toBeDefined();
      expect(wsManager.isConnected()).toBe(false);
    });

    it('should create with debug manager', () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      expect(wsManager).toBeDefined();
    });

    it('should create without debug manager', () => {
      wsManager = new WebSocketManager(wsConfig, authManager, undefined, false);
      expect(wsManager).toBeDefined();
    });
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      await expect(wsManager.connect()).resolves.not.toThrow();
      expect(wsManager.isConnected()).toBe(true);
    });

    it('should connect with token in URL', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      await wsManager.connect();
      
      expect(authManager.getToken).toHaveBeenCalled();
    });

    it('should connect without token', async () => {
      (authManager.getToken as jest.Mock).mockReturnValue(null);
      
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      expect(wsManager.isConnected()).toBe(true);
    });

    it('should log connection with debug manager', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      
      await wsManager.connect();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '🔌 WS CONNECTING',
        expect.any(Object)
      );
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '✅ WS CONNECTED',
        expect.any(Object)
      );
    });

    it('should not log without enableLogs', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, false);
      
      await wsManager.connect();
      
      expect(debugManager.log).not.toHaveBeenCalled();
    });

    it('should handle connection error', async () => {
      // Mock WebSocket to throw error
      const originalWebSocket = (global as any).WebSocket;
      (global as any).WebSocket = class {
        constructor() {
          throw new Error('Connection failed');
        }
      };

      wsManager = new WebSocketManager(wsConfig, authManager);
      
      await expect(wsManager.connect()).rejects.toThrow('Connection failed');

      // Restore
      (global as any).WebSocket = originalWebSocket;
    });
  });

  describe('Disconnection', () => {
    it('should disconnect successfully', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      expect(wsManager.isConnected()).toBe(true);
      
      wsManager.disconnect();
      
      expect(wsManager.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      expect(() => wsManager.disconnect()).not.toThrow();
    });

    it('should log disconnect with debug manager', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();
      
      wsManager.disconnect();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '🔌 WS DISCONNECT',
        {}
      );
    });

    it('should stop heartbeat on disconnect', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      // Heartbeat should be running
      wsManager.disconnect();
      
      // Should not throw after disconnect
      expect(() => wsManager.disconnect()).not.toThrow();
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
    });

    it('should send message successfully', () => {
      expect(() => wsManager.send('test-event', { data: 'test' })).not.toThrow();
    });

    it('should not send when disconnected', () => {
      wsManager.disconnect();
      
      expect(() => wsManager.send('test-event', { data: 'test' })).not.toThrow();
    });

    it('should log sent message with debug manager', async () => {
      wsManager.disconnect();
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();
      
      wsManager.send('test-event', { data: 'test' });
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '📤 WS SEND',
        expect.objectContaining({
          type: 'test-event',
          dataSize: expect.any(Number),
        })
      );
    });
  });

  describe('Message Receiving', () => {
    it('should receive and parse messages', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();

      const callback = jest.fn();
      wsManager.subscribe('test-event', callback);

      // Simulate message through adapter
      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'test-event', data: { value: 123 } }));

      expect(callback).toHaveBeenCalledWith({ value: 123 });
    });

    it('should handle invalid JSON messages', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();

      const adapter = (wsManager as any).adapter;

      // Simulate invalid JSON - should not throw
      expect(() => {
        adapter.config.onMessage?.('invalid json');
      }).not.toThrow();
    });

    it('should log received message with debug manager', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();

      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'test-event', data: { value: 123 } }));

      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '📨 WS MESSAGE',
        expect.objectContaining({
          type: 'test-event',
          dataSize: expect.any(Number),
        })
      );
    });
  });

  describe('Event Subscription', () => {
    beforeEach(async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
    });

    it('should subscribe to events', () => {
      const callback = jest.fn();
      const unsubscribe = wsManager.subscribe('test-event', callback);
      
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call subscribed callback on message', async () => {
      const callback = jest.fn();
      wsManager.subscribe('test-event', callback);

      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'test-event', data: { value: 123 } }));

      expect(callback).toHaveBeenCalledWith({ value: 123 });
    });

    it('should support multiple subscribers', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      wsManager.subscribe('test-event', callback1);
      wsManager.subscribe('test-event', callback2);

      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'test-event', data: { value: 123 } }));

      expect(callback1).toHaveBeenCalledWith({ value: 123 });
      expect(callback2).toHaveBeenCalledWith({ value: 123 });
    });

    it('should unsubscribe correctly', async () => {
      const callback = jest.fn();
      const unsubscribe = wsManager.subscribe('test-event', callback);

      unsubscribe();

      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'test-event', data: { value: 123 } }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle unsubscribe multiple times', () => {
      const callback = jest.fn();
      const unsubscribe = wsManager.subscribe('test-event', callback);
      
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should log subscription with debug manager', async () => {
      wsManager.disconnect();
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();
      
      const callback = jest.fn();
      wsManager.subscribe('test-event', callback);
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '👂 WS SUBSCRIBE',
        expect.objectContaining({
          event: 'test-event',
          listenerCount: expect.any(Number),
        })
      );
    });

    it('should log unsubscription with debug manager', async () => {
      wsManager.disconnect();
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();
      
      const callback = jest.fn();
      const unsubscribe = wsManager.subscribe('test-event', callback);
      
      unsubscribe();
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '🔇 WS UNSUBSCRIBE',
        expect.objectContaining({
          event: 'test-event',
          listenerCount: expect.any(Number),
        })
      );
    });
  });

  describe('Heartbeat', () => {
    it('should start heartbeat on connect', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      // Heartbeat should be running
      const heartbeatInterval = (wsManager as any).heartbeatInterval;
      expect(heartbeatInterval).toBeTruthy();
    });

    it('should not start heartbeat if disabled', async () => {
      const configWithoutHeartbeat = { ...wsConfig, heartbeat: undefined };
      wsManager = new WebSocketManager(configWithoutHeartbeat, authManager);
      await wsManager.connect();
      
      const heartbeatInterval = (wsManager as any).heartbeatInterval;
      expect(heartbeatInterval).toBeNull();
    });

    it('should stop heartbeat on disconnect', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      wsManager.disconnect();
      
      const heartbeatInterval = (wsManager as any).heartbeatInterval;
      expect(heartbeatInterval).toBeNull();
    });
  });

  describe('Reconnection', () => {
    it('should attempt reconnection on close', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();

      const adapter = (wsManager as any).adapter;
      adapter.config.onClose?.(new CloseEvent('close', { code: 1000, reason: 'Normal closure' }));

      // Should schedule reconnection
      const reconnectAttempts = (wsManager as any).reconnectAttempts;
      expect(reconnectAttempts).toBeGreaterThan(0);
    });

    it('should not reconnect if disabled', async () => {
      const configNoReconnect = { ...wsConfig, reconnect: false };
      wsManager = new WebSocketManager(configNoReconnect, authManager);
      await wsManager.connect();

      const adapter = (wsManager as any).adapter;
      adapter.config.onClose?.(new CloseEvent('close', { code: 1000, reason: 'Normal closure' }));

      // Should not increment reconnect attempts
      await new Promise(resolve => setTimeout(resolve, 50));
      const reconnectAttempts = (wsManager as any).reconnectAttempts;
      expect(reconnectAttempts).toBe(0);
    });

    it('should stop reconnecting after max attempts', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      (wsManager as any).maxReconnectAttempts = 2;

      await wsManager.connect();

      const adapter = (wsManager as any).adapter;

      // Simulate multiple closes
      adapter.config.onClose?.(new CloseEvent('close', { code: 1000, reason: 'Close 1' }));
      await new Promise(resolve => setTimeout(resolve, 50));

      if ((wsManager as any).adapter) {
        ((wsManager as any).adapter).config.onClose?.(new CloseEvent('close', { code: 1000, reason: 'Close 2' }));
      }

      const reconnectAttempts = (wsManager as any).reconnectAttempts;
      expect(reconnectAttempts).toBeLessThanOrEqual(2);
    });

    it('should log close event with debug manager', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      await wsManager.connect();

      const adapter = (wsManager as any).adapter;
      adapter.config.onClose?.(new CloseEvent('close', { code: 1000, reason: 'Test close' }));

      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '🔌 WS CLOSED',
        expect.objectContaining({
          code: 1000,
          reason: 'Test close',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket errors', async () => {
      // Create a mock that errors immediately
      (global as any).WebSocket = class {
        public readyState: number = 0;
        public onopen: ((event: Event) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            this.onerror?.(new ErrorEvent('error', { error: new Error('Connection error') }));
          }, 5);
        }
        
        send() {}
        close() {}
      };

      wsManager = new WebSocketManager(wsConfig, authManager);
      
      await expect(wsManager.connect()).rejects.toBeDefined();
    });

    it('should log errors with debug manager', async () => {
      // Create a mock that errors immediately
      (global as any).WebSocket = class {
        public readyState: number = 0;
        public onopen: ((event: Event) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            this.onerror?.(new ErrorEvent('error', { error: new Error('Test error') }));
          }, 5);
        }
        
        send() {}
        close() {}
      };

      wsManager = new WebSocketManager(wsConfig, authManager, debugManager, true);
      
      try {
        await wsManager.connect();
      } catch (error) {
        // Expected error
      }
      
      expect(debugManager.log).toHaveBeenCalledWith(
        'websocket',
        '❌ WS ERROR',
        expect.any(Object)
      );
    });
  });

  describe('Connection State', () => {
    it('should report connected state correctly', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      expect(wsManager.isConnected()).toBe(false);
      
      await wsManager.connect();
      expect(wsManager.isConnected()).toBe(true);
      
      wsManager.disconnect();
      expect(wsManager.isConnected()).toBe(false);
    });

    it('should handle state check when ws is null', () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      expect(wsManager.isConnected()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple connect calls', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      
      await wsManager.connect();
      await wsManager.connect();
      
      expect(wsManager.isConnected()).toBe(true);
    });

    it('should handle subscribe to non-existent event type', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();

      const callback = jest.fn();
      wsManager.subscribe('non-existent', callback);

      const adapter = (wsManager as any).adapter;
      adapter.config.onMessage?.(JSON.stringify({ type: 'other-event', data: {} }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle sending complex data types', async () => {
      wsManager = new WebSocketManager(wsConfig, authManager);
      await wsManager.connect();
      
      const complexData = {
        nested: { value: 123 },
        array: [1, 2, 3],
        string: 'test',
      };
      
      expect(() => wsManager.send('complex', complexData)).not.toThrow();
    });
  });
});
