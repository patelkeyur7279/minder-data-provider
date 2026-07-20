/**
 * @jest-environment jsdom
 *
 * WebSocket hardening (bounded — no layer consolidation). Adds unit coverage for
 * the two previously-untested public layers:
 *   1. WebSocketClient (`minder-data-provider/websocket`) — connect/disconnect,
 *      subscribe/dispatch, message queueing, reconnect-on-close with exponential
 *      backoff, and the error path — driven against a controllable mock WebSocket.
 *   2. the `useWebSocket` hook — delegates to the provider's manager and leaks no
 *      sockets/listeners across mount/unmount.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ── Controllable mock WebSocket (open/message/close/error driven manually) ──
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string, public protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code = 1000, reason = ''): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
  _open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  _serverClose(code = 1006, reason = 'abnormal'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
  _message(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }
  _error(): void {
    this.onerror?.(new Event('error'));
  }
  static latest(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

import { WebSocketClient } from '../src/websocket/WebSocketClient';

describe('WebSocketClient (public /websocket layer)', () => {
  let originalWS: any;

  beforeEach(() => {
    originalWS = (global as any).WebSocket;
    (global as any).WebSocket = MockWebSocket as any;
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    (global as any).WebSocket = originalWS;
  });

  it('connect() resolves on open and reports connected', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: false, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;
    expect(client.isConnected()).toBe(true);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('dispatches messages to subscribers (and wildcard), unsubscribe stops delivery', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: false, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;

    const chat = jest.fn();
    const wildcard = jest.fn();
    const unsub = client.subscribe('chat', chat);
    client.subscribe('*', wildcard);

    MockWebSocket.latest()._message({ event: 'chat', data: { text: 'hi' } });
    expect(chat).toHaveBeenCalledWith({ text: 'hi' });
    expect(wildcard).toHaveBeenCalledTimes(1);

    unsub();
    MockWebSocket.latest()._message({ event: 'chat', data: { text: 'again' } });
    expect(chat).toHaveBeenCalledTimes(1); // no further delivery after unsubscribe
  });

  it('queues sends while disconnected and flushes them on open', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: false, heartbeat: 0 });
    client.send('early', { n: 1 }); // not connected yet -> queued
    expect(client.getQueueSize()).toBe(1);

    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;

    expect(client.getQueueSize()).toBe(0);
    expect(MockWebSocket.latest().sent.some((s) => s.includes('early'))).toBe(true);
  });

  it('reconnects on unexpected close with exponential backoff', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: true, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;
    expect(MockWebSocket.instances).toHaveLength(1);

    // Server drops the connection -> schedules a reconnect (attempt 1 -> 1000ms).
    MockWebSocket.latest()._serverClose();
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1); // not yet
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2); // reconnected

    // The reconnect socket never opens, then also drops: backoff compounds
    // (attempt 2 -> 2000ms) since there was no successful open to reset it.
    MockWebSocket.latest()._serverClose();
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(MockWebSocket.instances).toHaveLength(2); // still backing off
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(3);

    // A successful open resets backoff: the next drop reconnects at 1000ms again.
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._serverClose();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('manual disconnect() does NOT reconnect', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: true, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;

    client.disconnect();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(client.isConnected()).toBe(false);
  });

  it('gives up after maxReconnectAttempts and stops scheduling reconnects', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: true, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open(); // resets reconnectAttempts to 0
    await p;

    // Drive many close cycles. The internal cap is 10 (private maxReconnectAttempts);
    // the reconnect socket never opens, so backoff never resets. Advancing 30s (the
    // max backoff) each cycle fires whichever reconnect timer is pending.
    for (let i = 0; i < 15; i++) {
      MockWebSocket.latest()._serverClose();
      act(() => {
        jest.advanceTimersByTime(30_000);
      });
    }

    // 1 initial socket + exactly 10 reconnect sockets = 11; then it gave up.
    expect(MockWebSocket.instances).toHaveLength(11);
    expect(client.getInfo().reconnectAttempts).toBe(10);

    // Further time passes with no new socket — proves it stopped scheduling.
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(MockWebSocket.instances).toHaveLength(11);
  });

  it('destroy() while a reconnect is SCHEDULED cancels the pending timer (no reconnect fires)', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: true, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;
    expect(MockWebSocket.instances).toHaveLength(1);

    // Unexpected close schedules a reconnect timer (1000ms) but does not fire yet.
    MockWebSocket.latest()._serverClose();
    expect(MockWebSocket.instances).toHaveLength(1);

    // Destroy BEFORE the scheduled timer elapses — it must clear the pending timer.
    client.destroy();
    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    // No reconnect socket was ever created after destroy.
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(client.isConnected()).toBe(false);
  });

  it('surfaces the error path (connect rejects on socket error)', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: false, heartbeat: 0 });
    const p = client.connect();
    MockWebSocket.latest()._error();
    await expect(p).rejects.toBeDefined();
  });

  it('destroy() stops the heartbeat timer (no leaked ping sends after teardown)', async () => {
    const client = new WebSocketClient({ url: 'wss://x/ws', reconnect: false, heartbeat: 1000 });
    const p = client.connect();
    MockWebSocket.latest()._open();
    await p;
    const ws = MockWebSocket.latest();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const pingsBefore = ws.sent.filter((s) => s.includes('ping')).length;
    expect(pingsBefore).toBeGreaterThanOrEqual(1);

    client.destroy();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    const pingsAfter = ws.sent.filter((s) => s.includes('ping')).length;
    expect(pingsAfter).toBe(pingsBefore); // heartbeat cleared — no further pings
  });
});

// ── useWebSocket hook: delegation + no leaked listeners across mount/unmount ──
const mockManager = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  send: jest.fn(),
  subscribe: jest.fn(() => jest.fn()),
  isConnected: jest.fn(() => true),
};
jest.mock('../src/core/MinderContext', () => ({
  useMinderContext: () => ({ websocketManager: mockManager }),
}));

import { useWebSocket } from '../src/hooks/index';

describe('useWebSocket hook (delegation + cleanup)', () => {
  beforeEach(() => {
    Object.values(mockManager).forEach((fn) => (fn as jest.Mock).mockClear());
  });

  it('mount/unmount opens no socket and registers no listeners (no leak)', () => {
    let api: ReturnType<typeof useWebSocket> | null = null;
    function C() {
      api = useWebSocket();
      return null;
    }
    const { unmount } = render(<C />);
    // The hook is a pure delegator: it must not auto-connect or auto-subscribe.
    expect(mockManager.connect).not.toHaveBeenCalled();
    expect(mockManager.subscribe).not.toHaveBeenCalled();
    unmount();
    // Nothing to tear down -> still nothing called.
    expect(mockManager.disconnect).not.toHaveBeenCalled();
    expect(api).not.toBeNull();
  });

  it('delegates connect/disconnect/send/subscribe/isConnected to the manager', () => {
    let api: ReturnType<typeof useWebSocket> | null = null;
    function C() {
      api = useWebSocket();
      return null;
    }
    render(<C />);

    act(() => {
      api!.connect();
      api!.send('chat', { t: 1 });
    });
    expect(mockManager.connect).toHaveBeenCalledTimes(1);
    expect(mockManager.send).toHaveBeenCalledWith('chat', { t: 1 });

    const handler = jest.fn();
    const unsub = api!.subscribe('evt', handler);
    expect(mockManager.subscribe).toHaveBeenCalledWith('evt', handler);
    // subscribe returns the manager's unsubscribe function.
    expect(typeof unsub).toBe('function');
    expect(api!.isConnected()).toBe(true);
  });
});
