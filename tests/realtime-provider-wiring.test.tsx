/**
 * @jest-environment jsdom
 *
 * MinderDataProvider realtime wiring — Spec 5.2 §4.8 (transport selection
 * glue + lazy SSE load) and §4.6 (the resync-nudge glue: 'resync' ->
 * offlineManager.sync() + invalidateQueries(); 'invalidate' -> invalidateQueries
 * for specific keys). The transport itself carries no offline import — this
 * wiring lives in MinderDataProvider, so it's exercised at the provider level.
 */
import { TextEncoder, TextDecoder } from 'node:util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { MinderConfig } from '../src/core/types';

// ── Mock WebSocketManager so we can drive its dispatch surface directly,
// without needing the real platform WebSocket adapter machinery. ──
jest.mock('../src/core/WebSocketManager', () => {
  class MockWebSocketManager {
    static instances: MockWebSocketManager[] = [];
    listeners = new Map<string, Set<(d: unknown) => void>>();
    args: unknown[];
    constructor(...args: unknown[]) {
      this.args = args;
      MockWebSocketManager.instances.push(this);
    }
    connect = jest.fn(async () => undefined);
    disconnect = jest.fn();
    isConnected = jest.fn(() => false);
    subscribe = jest.fn((event: string, cb: (d: unknown) => void) => {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(cb);
      return () => this.listeners.get(event)?.delete(cb);
    });
    emit(event: string, data: unknown) {
      this.listeners.get(event)?.forEach((cb) => cb(data));
    }
  }
  return { WebSocketManager: MockWebSocketManager };
});

// ── Mock the offline registry leaf module so we can assert the resync glue
// calls into it, without standing up a real OfflineManager. ──
jest.mock('../src/platform/offline/registry', () => ({
  getActiveOfflineManager: jest.fn(),
}));

import { MinderDataProvider, useMinderContext } from '../src/core/MinderDataProvider';
import { useMinder } from '../src/hooks/useMinder';
import { WebSocketManager } from '../src/core/WebSocketManager';
import { getActiveOfflineManager } from '../src/platform/offline/registry';
import { LazySseTransport } from '../src/core/realtime/LazySseTransport';

const MockWebSocketManager = WebSocketManager as unknown as {
  instances: Array<InstanceType<typeof WebSocketManager> & { emit: (e: string, d: unknown) => void; args: unknown[] }>;
};

function wrapperFor(config: MinderConfig) {
  return ({ children }: { children: React.ReactNode }) => (
    <MinderDataProvider config={config}>{children}</MinderDataProvider>
  );
}

const base: MinderConfig = { apiBaseUrl: 'https://api.test', routes: {} };

describe('MinderDataProvider realtime transport selection (Spec 5.2 §7k)', () => {
  beforeEach(() => {
    MockWebSocketManager.instances.length = 0;
  });

  it('transport: "sse" -> realtimeManager is a LazySseTransport, websocketManager is undefined', () => {
    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, realtime: { transport: 'sse', url: 'https://api.test/events' } }),
    });
    expect(result.current.realtimeManager).toBeInstanceOf(LazySseTransport);
    expect(result.current.websocketManager).toBeUndefined();
  });

  it('transport: "ws" -> websocketManager is constructed, realtimeManager aliases it', () => {
    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, realtime: { transport: 'ws', url: 'wss://api.test/ws' } }),
    });
    expect(result.current.websocketManager).toBeDefined();
    expect(result.current.realtimeManager).toBe(result.current.websocketManager);
  });

  it('websocket set, no realtime object -> websocketManager constructed (unchanged legacy path)', () => {
    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, websocket: { url: 'wss://api.test/ws' } }),
    });
    expect(result.current.websocketManager).toBeDefined();
    expect(result.current.realtimeManager).toBe(result.current.websocketManager);
  });

  it('legacy realtime: true -> websocketManager constructed', () => {
    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, realtime: true }),
    });
    expect(result.current.websocketManager).toBeDefined();
    expect(result.current.realtimeManager).toBe(result.current.websocketManager);
  });

  it('nothing set -> neither websocketManager nor realtimeManager', () => {
    const { result } = renderHook(() => useMinderContext(), { wrapper: wrapperFor({ ...base }) });
    expect(result.current.websocketManager).toBeUndefined();
    expect(result.current.realtimeManager).toBeUndefined();
  });

  it('the SSE branch actually loads and attempts to connect the real SseTransport on connect()', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      body: { cancel: jest.fn(async () => undefined) },
    }));
    (global as any).fetch = fetchMock;

    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, realtime: { transport: 'sse', url: 'https://api.test/events' } }),
    });

    await result.current.realtimeManager!.connect().catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/events');
  });

  it('useMinder().websocket.connect()/disconnect() route to the SSE transport via the public hook (transport:"sse")', async () => {
    // Regression: before the fix, useMinder().websocket.* only touched
    // context.websocketManager, which is undefined under transport:'sse' — so
    // apps on SSE could never open the stream (and the §4.6 resync glue would
    // never fire in real use). The hook must route through realtimeManager.
    // Behavioral proof: driving connect() through the public hook must cause
    // the SSE transport to fetch the SSE URL. 0 fetches == the unreachable bug.
    const cancel = jest.fn(async () => undefined);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      // A never-resolving reader keeps the stream "open" so connect() resolves
      // at markConnected without a reconnect/reject storm.
      body: { getReader: () => ({ read: () => new Promise(() => undefined), cancel }), cancel },
    }));
    (global as any).fetch = fetchMock;

    // A VALID route is required so useMinder returns its real result (the
    // invalid-route path returns a no-op websocket stub, unrelated to routing).
    const { result } = renderHook(() => useMinder('getUsers', { autoFetch: false }), {
      wrapper: wrapperFor({
        ...base,
        routes: { getUsers: { url: '/api/users', method: 'GET' } },
        realtime: { transport: 'sse', url: 'https://api.test/events' },
      }),
    });

    // Fire through the public hook (fire-and-forget, like the WS surface).
    result.current.websocket.connect();

    // Poll (real timers) until the lazy import + fetch have run.
    const start = Date.now();
    while (fetchMock.mock.calls.length === 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/events');

    // disconnect() is likewise routed to the SSE transport (no throw).
    expect(() => result.current.websocket.disconnect()).not.toThrow();
  });
});

describe('MinderDataProvider resync-nudge glue (Spec 5.2 §4.6 / §7j)', () => {
  beforeEach(() => {
    MockWebSocketManager.instances.length = 0;
    (getActiveOfflineManager as jest.Mock).mockReset();
  });

  it('a "resync" event triggers offlineManager.sync() and a full invalidateQueries()', () => {
    const sync = jest.fn();
    (getActiveOfflineManager as jest.Mock).mockReturnValue({ sync });

    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, websocket: { url: 'wss://api.test/ws' } }),
    });
    const invalidateSpy = jest.spyOn(result.current.queryClient, 'invalidateQueries');

    const instance = MockWebSocketManager.instances[0];
    instance.emit('resync', {});

    expect(sync).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it('an "invalidate" event invalidates the specific keys carried on the payload', () => {
    (getActiveOfflineManager as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, websocket: { url: 'wss://api.test/ws' } }),
    });
    const invalidateSpy = jest.spyOn(result.current.queryClient, 'invalidateQueries');

    const instance = MockWebSocketManager.instances[0];
    instance.emit('invalidate', { keys: ['users', 1] });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users', 1] });
  });

  it('does not throw when no offline manager is active', () => {
    (getActiveOfflineManager as jest.Mock).mockReturnValue(null);
    const { result } = renderHook(() => useMinderContext(), {
      wrapper: wrapperFor({ ...base, websocket: { url: 'wss://api.test/ws' } }),
    });
    const instance = MockWebSocketManager.instances[0];
    expect(() => instance.emit('resync', {})).not.toThrow();
  });
});
