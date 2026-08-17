/**
 * SseTransport tests — Spec 5.2 §7 (b, c, d, e, f, g, h, i, j, l, m).
 *
 * `fetch` is mocked directly (matching this repo's existing pattern in
 * tests/network-adapters.test.ts) — plain objects shaped like `Response`, no
 * real DOM Fetch/Streams needed. `TextEncoder`/`TextDecoder` are polyfilled
 * locally (jsdom's test environment doesn't provide them) since `SseTransport`
 * decodes real `Uint8Array` chunks.
 */
import { TextEncoder, TextDecoder } from 'node:util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SseTransport } from '../src/core/realtime/SseTransport';
import { WebSocketManager } from '../src/core/WebSocketManager';
import type { ResolvedRealtimeConfig } from '../src/core/realtime/types';
import type { AuthManager } from '../src/core/AuthManager';

function makeConfig(overrides: Partial<ResolvedRealtimeConfig> = {}): ResolvedRealtimeConfig {
  return {
    url: 'https://api.example.com/events',
    auth: true,
    stallTimeoutMs: 45000,
    lastEventIdHeader: 'Last-Event-ID',
    withCredentials: false,
    ...overrides,
    reconnect: {
      maxAttempts: 10,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitter: false,
      ...(overrides.reconnect ?? {}),
    },
  };
}

function fakeAuthManager(token: string | null = 'test-token'): AuthManager {
  return { getTokenAsync: jest.fn(async () => token) } as unknown as AuthManager;
}

/** A one-read-at-a-time controllable stream reader, fed on demand by the test. */
function makePushableReader() {
  type QueueItem = { done: boolean; value?: Uint8Array } | { __error: unknown };
  const queue: QueueItem[] = [];
  let waiter: { resolve: (v: any) => void; reject: (e: unknown) => void } | null = null;
  const encoder = new TextEncoder();

  return {
    push(chunk: string) {
      const item: QueueItem = { done: false, value: encoder.encode(chunk) };
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.resolve(item);
      } else {
        queue.push(item);
      }
    },
    end() {
      const item: QueueItem = { done: true, value: undefined };
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.resolve(item);
      } else {
        queue.push(item);
      }
    },
    fail(err: unknown) {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.reject(err);
      } else {
        queue.push({ __error: err });
      }
    },
    read(): Promise<{ done: boolean; value?: Uint8Array }> {
      return new Promise((resolve, reject) => {
        if (queue.length) {
          const item = queue.shift()!;
          if ('__error' in item) {
            reject(item.__error);
          } else {
            resolve(item);
          }
          return;
        }
        waiter = { resolve, reject };
      });
    },
  };
}

function makeStreamResponse(
  reader: ReturnType<typeof makePushableReader>,
  opts: { status?: number; headers?: Record<string, string> } = {}
) {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => opts.headers?.[name] ?? null },
    body: { getReader: () => reader, cancel: jest.fn(async () => undefined) },
  };
}

describe('SseTransport', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------
  // (d) structural parity with WebSocketManager
  // -------------------------------------------------------------------
  it('exposes the same connect/disconnect/subscribe/isConnected arities as WebSocketManager', () => {
    expect(typeof SseTransport.prototype.connect).toBe('function');
    expect(SseTransport.prototype.connect.length).toBe(WebSocketManager.prototype.connect.length);
    expect(SseTransport.prototype.disconnect.length).toBe(WebSocketManager.prototype.disconnect.length);
    expect(SseTransport.prototype.subscribe.length).toBe(WebSocketManager.prototype.subscribe.length);
    expect(SseTransport.prototype.isConnected.length).toBe(WebSocketManager.prototype.isConnected.length);
  });

  it('subscribe() returns a working unsubscribe — callback stops firing once unsubscribed', async () => {
    const reader = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader));
    const transport = new SseTransport(makeConfig(), fakeAuthManager());

    const cb = jest.fn();
    const unsubscribe = transport.subscribe('ping', cb);

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    reader.push('event: ping\ndata: 1\n\n');
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();

    reader.push('event: ping\ndata: 2\n\n');
    await jest.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });

  // -------------------------------------------------------------------
  // double-connect guard — a second connect() while connecting must NOT
  // start a second fetch / stall timer / orphan the first abortController.
  // -------------------------------------------------------------------
  it('connect() while already connecting returns the same promise and issues only one fetch', async () => {
    const reader = makePushableReader();
    fetchMock.mockResolvedValue(makeStreamResponse(reader));
    const transport = new SseTransport(makeConfig(), fakeAuthManager());

    const p1 = transport.connect();
    const p2 = transport.connect(); // second call while the first is still connecting
    expect(p2).toBe(p1); // same in-flight promise — no parallel attempt started

    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // exactly one fetch despite two connect() calls

    reader.push('event: ping\ndata: 1\n\n');
    await jest.advanceTimersByTimeAsync(0);
    await Promise.all([p1, p2]);
    expect(transport.isConnected()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    transport.disconnect();
  });

  // -------------------------------------------------------------------
  // (e) auth header, never URL; token re-read on reconnect
  // -------------------------------------------------------------------
  it('attaches Authorization: Bearer <token> and never puts the token in the URL', async () => {
    const reader = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader));
    const auth = fakeAuthManager('secret-token');
    const transport = new SseTransport(makeConfig(), auth);

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/events');
    expect(url).not.toContain('token=');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
  });

  it('re-reads the token on every reconnect (a rotated token is picked up automatically)', async () => {
    const reader1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader1));
    let tokenCallCount = 0;
    const auth = {
      getTokenAsync: jest.fn(async () => {
        tokenCallCount += 1;
        return `token-${tokenCallCount}`;
      }),
    } as unknown as AuthManager;

    const transport = new SseTransport(makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, jitter: false } }), auth);
    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token-1' });

    const reader2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader2));
    reader1.fail(new Error('connection dropped'));
    await jest.advanceTimersByTimeAsync(10);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token-2' });
  });

  // -------------------------------------------------------------------
  // (b) Last-Event-ID: absent on first connect, present (with configured
  //     header name) on reconnect (also covers acceptance 13).
  // -------------------------------------------------------------------
  it('sends no Last-Event-ID on the first connect, then sends it on reconnect after an id: line', async () => {
    const reader1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader1));
    const transport = new SseTransport(
      makeConfig({ lastEventIdHeader: 'Last-Event-ID', reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, jitter: false } }),
      fakeAuthManager()
    );

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    const firstHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(firstHeaders['Last-Event-ID']).toBeUndefined();

    reader1.push('id: 42\ndata: hello\n\n');
    await jest.advanceTimersByTimeAsync(0);

    const reader2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(reader2));
    reader1.fail(new Error('drop'));
    await jest.advanceTimersByTimeAsync(10);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(secondHeaders['Last-Event-ID']).toBe('42');
  });

  // -------------------------------------------------------------------
  // (c) backoff timing — jittered exponential, capped, resets after success
  // -------------------------------------------------------------------
  it('computes exponential backoff (no jitter) capped at maxDelayMs, resetting after a successful connect', async () => {
    const config = makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 100, maxDelayMs: 1000, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());

    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    // Failure #1 -> delay = base * 2^0 = 100
    const r2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r2));
    r1.fail(new Error('drop 1'));
    await jest.advanceTimersByTimeAsync(99);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not yet
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // fired at 100ms

    // Failure #2 -> delay = base * 2^1 = 200
    const r3 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r3));
    r2.fail(new Error('drop 2'));
    await jest.advanceTimersByTimeAsync(199);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The backoff counter resets on the first BYTE received (§4.2), not
    // merely on obtaining a reader — so deliver one before dropping again.
    // The NEXT failure then backs off from base again (100ms), not 400ms.
    r3.push('data: ping\n\n');
    await jest.advanceTimersByTimeAsync(0); // let the byte + r3's connect settle
    const r4 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r4));
    r3.fail(new Error('drop 3'));
    await jest.advanceTimersByTimeAsync(99);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('caps the computed delay at maxDelayMs', async () => {
    const config = makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 1500, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    // Failure #1: raw = 1000 * 2^0 = 1000 (under cap)
    const r2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r2));
    r1.fail(new Error('drop'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Failure #2: raw = 1000 * 2^1 = 2000, capped to 1500
    const r3 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r3));
    r2.fail(new Error('drop'));
    await jest.advanceTimersByTimeAsync(1499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('full-jitter delay stays within [0, raw] bounds', async () => {
    const config = makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    const r2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r2));
    r1.fail(new Error('drop'));
    // raw for attempt 1 = 1000ms; jittered delay is in [0, 1000). Advancing to
    // exactly 1000ms must have fired the reconnect by then either way.
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // (f) stall detection
  // -------------------------------------------------------------------
  it('aborts and reconnects when no bytes arrive within stallTimeoutMs', async () => {
    const config = makeConfig({ stallTimeoutMs: 5000, reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader(); // never pushes anything
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;
    expect(transport.isConnected()).toBe(true);

    const r2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r2));

    await jest.advanceTimersByTimeAsync(5000); // stall fires, schedules reconnect
    await jest.advanceTimersByTimeAsync(10); // reconnect delay elapses

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a keepalive comment within the stall window resets the timer (no reconnect)', async () => {
    const config = makeConfig({ stallTimeoutMs: 5000, reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    await jest.advanceTimersByTimeAsync(4000);
    r1.push(': keepalive\n'); // resets the stall timer
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(4000); // total 8000ms since connect, but only 4000ms since the keepalive

    expect(fetchMock).toHaveBeenCalledTimes(1); // still the original connection, no reconnect
  });

  // -------------------------------------------------------------------
  // (g) teardown / abort — disconnect() is idempotent and cancels pending work
  // -------------------------------------------------------------------
  it('disconnect() aborts an in-flight connection immediately', async () => {
    const config = makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 30000, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader();
    const abortSpy = jest.fn();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', abortSpy);
      return Promise.resolve(makeStreamResponse(r1));
    });

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;
    expect(transport.isConnected()).toBe(true);

    // The stream is still open (no drop yet) — disconnect() must abort it right away.
    transport.disconnect();
    expect(abortSpy).toHaveBeenCalled();
    expect(transport.isConnected()).toBe(false);

    expect(() => transport.disconnect()).not.toThrow(); // idempotent
    expect(transport.isConnected()).toBe(false);
  });

  it('disconnect() cancels a pending reconnect timer — it never fires', async () => {
    const config = makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 30000, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;
    expect(transport.isConnected()).toBe(true);

    // Drop the connection — a reconnect is now pending (scheduled ~1000ms out).
    r1.fail(new Error('drop'));
    await jest.advanceTimersByTimeAsync(0);
    expect(transport.isConnected()).toBe(false);

    transport.disconnect();

    // The pending reconnect (scheduled after the drop, before disconnect())
    // must not fire.
    await jest.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reconnect fetch ever happened

    // Idempotent.
    expect(() => transport.disconnect()).not.toThrow();
    expect(transport.isConnected()).toBe(false);
  });

  // -------------------------------------------------------------------
  // (h) give up after maxAttempts
  // -------------------------------------------------------------------
  it('gives up after maxAttempts failed connection attempts, emitting __closed, no further fetch', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    const config = makeConfig({ reconnect: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: false } });
    const transport = new SseTransport(config, fakeAuthManager());

    const closed = jest.fn();
    transport.subscribe('__closed', closed);

    const connectPromise = transport.connect();
    connectPromise.catch(() => undefined); // expected to reject once we give up

    await jest.advanceTimersByTimeAsync(0); // attempt 1 fails, schedules attempt 2 (delay 10ms)
    await jest.advanceTimersByTimeAsync(10); // attempt 2 fails, schedules attempt 3 (delay 20ms)
    await jest.advanceTimersByTimeAsync(20); // attempt 3 fails -> give up

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(closed).toHaveBeenCalledWith({ reason: 'max_attempts', attempts: 3 });
    expect(transport.isConnected()).toBe(false);

    await jest.advanceTimersByTimeAsync(100000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // no 4th fetch, ever

    await expect(connectPromise).rejects.toBeInstanceOf(Error);
  });

  // -------------------------------------------------------------------
  // (i) permanent vs transient HTTP classification
  // -------------------------------------------------------------------
  it.each([401, 403, 404, 204])(
    'HTTP %i stops permanently — no reconnect, terminal __closed event',
    async (status) => {
      fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader(), { status }));
      const transport = new SseTransport(
        makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 50, jitter: false } }),
        fakeAuthManager()
      );
      const closed = jest.fn();
      transport.subscribe('__closed', closed);

      const connectPromise = transport.connect();
      connectPromise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      expect(closed).toHaveBeenCalledWith(expect.objectContaining({ reason: `HTTP ${status}` }));
      expect(transport.isConnected()).toBe(false);

      await jest.advanceTimersByTimeAsync(100000);
      expect(fetchMock).toHaveBeenCalledTimes(1); // never retried
    }
  );

  it.each([429, 500, 503])('HTTP %i is transient — reconnects', async (status) => {
    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader(), { status }));
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 50, jitter: false } }),
      fakeAuthManager()
    );
    const connectPromise = transport.connect();
    connectPromise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(0);

    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader()));
    await jest.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a network drop mid-stream reconnects (transient)', async () => {
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 50, jitter: false } }),
      fakeAuthManager()
    );
    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader()));
    r1.fail(new Error('ECONNRESET'));
    await jest.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('runs under a minimal edge-runtime-shaped global (fetch present, no process/XMLHttpRequest) without touching Node-only APIs (P5)', async () => {
    const originalProcess = (global as any).process;
    const originalXHR = (global as any).XMLHttpRequest;
    // Simulate an edge worker global shape for the duration of this test.
    delete (global as any).XMLHttpRequest;

    try {
      const r1 = makePushableReader();
      fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
      const transport = new SseTransport(makeConfig(), fakeAuthManager());
      const messages: unknown[] = [];
      transport.subscribe('message', (d) => messages.push(d));

      const connectPromise = transport.connect();
      await jest.advanceTimersByTimeAsync(0);
      await connectPromise;

      r1.push('data: {"edge":true}\n\n');
      await jest.advanceTimersByTimeAsync(0);

      expect(messages).toEqual([{ edge: true }]);
    } finally {
      (global as any).process = originalProcess;
      (global as any).XMLHttpRequest = originalXHR;
    }
  });

  // -------------------------------------------------------------------
  // (j) resync-nudge integration (transport side — dispatch only; the
  //     offline/query wiring itself lives in MinderDataProvider, tested in
  //     tests/realtime-transport-selection.test.ts)
  // -------------------------------------------------------------------
  it('dispatches a "resync" event to subscribers exactly like any other named event', async () => {
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const transport = new SseTransport(makeConfig(), fakeAuthManager());
    const onResync = jest.fn();
    transport.subscribe('resync', onResync);

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    r1.push('event: resync\ndata: {}\n\n');
    await jest.advanceTimersByTimeAsync(0);

    expect(onResync).toHaveBeenCalledWith({});
  });

  // -------------------------------------------------------------------
  // (l) Retry-After honored (seconds and HTTP-date forms; absent falls back)
  // -------------------------------------------------------------------
  it('derives the reconnect delay from a Retry-After header in seconds form', async () => {
    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader(), { status: 429, headers: { 'Retry-After': '5' } }));
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 30000, jitter: false } }),
      fakeAuthManager()
    );
    const connectPromise = transport.connect();
    connectPromise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(0);

    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader()));
    await jest.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); // exactly 5000ms
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('derives the reconnect delay from a Retry-After header in HTTP-date form, clamped to maxDelayMs', async () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const futureDate = new Date('2026-01-01T00:00:10.000Z').toUTCString(); // 10s out
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse(makePushableReader(), { status: 503, headers: { 'Retry-After': futureDate } })
    );
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 1000, maxDelayMs: 8000, jitter: false } }),
      fakeAuthManager()
    );
    const connectPromise = transport.connect();
    connectPromise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(0);

    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader()));
    // 10s away, clamped to maxDelayMs = 8000ms.
    await jest.advanceTimersByTimeAsync(7999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to computed backoff when Retry-After is absent on a 429', async () => {
    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader(), { status: 429 }));
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 250, maxDelayMs: 30000, jitter: false } }),
      fakeAuthManager()
    );
    const connectPromise = transport.connect();
    connectPromise.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(0);

    fetchMock.mockResolvedValueOnce(makeStreamResponse(makePushableReader()));
    await jest.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); // base * 2^0 = 250ms
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------
  // (m) no delivery during the reconnect gap; buffered event arrives once on reconnect
  // -------------------------------------------------------------------
  it('delivers nothing while disconnected between attempts, then the reconnect event exactly once', async () => {
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const transport = new SseTransport(
      makeConfig({ reconnect: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, jitter: false } }),
      fakeAuthManager()
    );
    const messages: unknown[] = [];
    transport.subscribe('message', (d) => messages.push(d));

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    r1.push('id: 7\ndata: "before-drop"\n\n');
    await jest.advanceTimersByTimeAsync(0);
    expect(messages).toEqual(['before-drop']);

    // Drop the connection — a reconnect is now pending. No bytes can arrive
    // during this gap by construction (nothing is being read).
    r1.fail(new Error('drop'));
    await jest.advanceTimersByTimeAsync(0); // let the rejection propagate
    expect(transport.isConnected()).toBe(false);
    expect(messages).toEqual(['before-drop']); // unchanged during the gap

    const r2 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r2));
    await jest.advanceTimersByTimeAsync(10); // reconnect fires

    // Reconnect fetch carries the Last-Event-ID from before the drop.
    const headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers['Last-Event-ID']).toBe('7');

    // The server "replays" the buffered event on reconnect.
    r2.push('id: 8\ndata: "buffered-event"\n\n');
    await jest.advanceTimersByTimeAsync(0);

    expect(messages).toEqual(['before-drop', 'buffered-event']);
  });

  // -------------------------------------------------------------------
  // RN/Expo guard (P5) — response.body has no getReader
  // -------------------------------------------------------------------
  it('fails fast with a clear error when the platform has no readable response body (RN/Expo)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null }, body: {} });
    const transport = new SseTransport(makeConfig(), fakeAuthManager());
    const closed = jest.fn();
    transport.subscribe('__closed', closed);

    await expect(transport.connect()).rejects.toThrow(/ReadableStream/);
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ reason: 'unsupported' }));
    expect(transport.isConnected()).toBe(false);

    // Not retried — this is a permanent environment limitation, not a transient failure.
    await jest.advanceTimersByTimeAsync(100000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // send() is a receive-only no-op (§4.7)
  // -------------------------------------------------------------------
  it('send() is a no-op and never throws', () => {
    const transport = new SseTransport(makeConfig(), fakeAuthManager());
    expect(() => transport.send('ping', { at: Date.now() })).not.toThrow();
  });

  it('malformed JSON in a data: payload is delivered as the raw string, and does not kill the stream', async () => {
    const r1 = makePushableReader();
    fetchMock.mockResolvedValueOnce(makeStreamResponse(r1));
    const transport = new SseTransport(makeConfig(), fakeAuthManager());
    const messages: unknown[] = [];
    transport.subscribe('message', (d) => messages.push(d));

    const connectPromise = transport.connect();
    await jest.advanceTimersByTimeAsync(0);
    await connectPromise;

    r1.push('data: not-json{{\n\n');
    r1.push('data: {"ok":true}\n\n');
    await jest.advanceTimersByTimeAsync(0);

    expect(messages).toEqual(['not-json{{', { ok: true }]);
  });
});
