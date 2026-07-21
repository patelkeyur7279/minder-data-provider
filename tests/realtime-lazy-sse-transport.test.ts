/**
 * LazySseTransport — defers loading the real SseTransport module (P4) until
 * connect() is actually called, while behaving as a drop-in RealtimeTransport
 * synchronously (subscriptions registered before load are buffered and
 * replayed). Internal wiring detail for MinderDataProvider (Spec 5.2 §4.8),
 * not part of the public `./realtime` surface.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { LazySseTransport } from '../src/core/realtime/LazySseTransport';
import type { RealtimeTransport, ResolvedRealtimeConfig } from '../src/core/realtime/types';
import type { AuthManager } from '../src/core/AuthManager';

const config: ResolvedRealtimeConfig = {
  url: 'https://api.test/events',
  auth: true,
  reconnect: { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
  stallTimeoutMs: 45000,
  lastEventIdHeader: 'Last-Event-ID',
  withCredentials: false,
};

function makeFakeRealTransport() {
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  const instance: RealtimeTransport & { emit: (event: string, data: unknown) => void } = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    isConnected: jest.fn(() => true),
    subscribe: jest.fn((event: string, cb: (d: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    }),
    emit(event: string, data: unknown) {
      listeners.get(event)?.forEach((cb) => cb(data));
    },
  };
  return instance;
}

describe('LazySseTransport', () => {
  it('does not call the loader until connect() is invoked (P4 — 0 eager bytes)', () => {
    const loader = jest.fn(async () => ({ SseTransport: jest.fn() as any }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);
    expect(loader).not.toHaveBeenCalled();
  });

  it('connect() loads the module exactly once, constructs SseTransport with the given args, and delegates connect()', async () => {
    const real = makeFakeRealTransport();
    const SseTransportCtor = jest.fn(() => real);
    const loader = jest.fn(async () => ({ SseTransport: SseTransportCtor as any }));
    const authManager = {} as AuthManager;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, authManager, undefined, true);
    await lazy.connect();
    await lazy.connect(); // idempotent — must not re-load or re-construct

    expect(loader).toHaveBeenCalledTimes(1);
    expect(SseTransportCtor).toHaveBeenCalledTimes(1);
    expect(SseTransportCtor).toHaveBeenCalledWith(config, authManager, undefined, true);
    expect(real.connect).toHaveBeenCalledTimes(2);
  });

  it('buffers subscribe() calls made before load completes and replays them once loaded', async () => {
    const real = makeFakeRealTransport();
    let resolveLoader: (mod: { SseTransport: any }) => void;
    const loader = jest.fn(
      () =>
        new Promise<{ SseTransport: any }>((resolve) => {
          resolveLoader = resolve;
        })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);

    const cb = jest.fn();
    const unsubscribe = lazy.subscribe('resync', cb);

    const connectPromise = lazy.connect();
    // Module hasn't resolved yet — subscribe() must have gone through the
    // buffering path (loader was called, but real.subscribe was not, since
    // `real` doesn't exist yet).
    expect(real.subscribe).not.toHaveBeenCalled();

    resolveLoader!({ SseTransport: jest.fn(() => real) as any });
    await connectPromise;

    expect(real.subscribe).toHaveBeenCalledWith('resync', cb);
    real.emit('resync', { ok: true });
    expect(cb).toHaveBeenCalledWith({ ok: true });

    unsubscribe();
    real.emit('resync', { ok: false });
    expect(cb).toHaveBeenCalledTimes(1); // unsubscribe worked post-load too
  });

  it('an unsubscribe called BEFORE load completes removes the buffered entry (no replay, no leak)', async () => {
    const real = makeFakeRealTransport();
    const loader = jest.fn(async () => ({ SseTransport: jest.fn(() => real) as any }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);

    const cb = jest.fn();
    const unsubscribe = lazy.subscribe('resync', cb);
    unsubscribe(); // before connect() / load ever happens

    await lazy.connect();
    expect(real.subscribe).not.toHaveBeenCalledWith('resync', cb);
  });

  it('disconnect() before the module ever loaded skips loading entirely', () => {
    const loader = jest.fn(async () => ({ SseTransport: jest.fn() as any }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);

    lazy.disconnect();
    expect(loader).not.toHaveBeenCalled();
    expect(lazy.isConnected()).toBe(false);
  });

  it('disconnect() after load delegates to the real transport', async () => {
    const real = makeFakeRealTransport();
    const loader = jest.fn(async () => ({ SseTransport: jest.fn(() => real) as any }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);

    await lazy.connect();
    lazy.disconnect();
    expect(real.disconnect).toHaveBeenCalledTimes(1);
  });

  it('isConnected()/send() are safe no-ops before the module loads', () => {
    const loader = jest.fn(async () => ({ SseTransport: jest.fn() as any }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lazy = new LazySseTransport(loader as any, config, {} as AuthManager, undefined, false);
    expect(lazy.isConnected()).toBe(false);
    expect(() => lazy.send('ping', {})).not.toThrow();
  });
});
