/**
 * Realtime transport selection & wiring — Spec 5.2 §7k (config selection ws vs
 * sse, all five precedence branches) and §7j (the resync-nudge glue lives in
 * MinderDataProvider, not the transport).
 */
import { describe, it, expect } from '@jest/globals';
import {
  selectRealtimeTransport,
  resolveWebSocketConfigForSelection,
  resolveRealtimeConfig,
} from '../src/core/realtime/selectTransport';
import type { MinderConfig } from '../src/core/types';

const base: MinderConfig = { apiBaseUrl: 'https://api.test', routes: {} };

describe('selectRealtimeTransport — precedence table (Spec 5.2 §3.1)', () => {
  it('branch 1: realtime:{transport:"sse"} -> sse', () => {
    expect(selectRealtimeTransport({ ...base, realtime: { transport: 'sse', url: 'https://api.test/events' } })).toBe(
      'sse'
    );
  });

  it('branch 2: realtime:{transport:"ws"} -> ws', () => {
    expect(selectRealtimeTransport({ ...base, realtime: { transport: 'ws' } })).toBe('ws');
  });

  it('branch 2b: realtime object with transport omitted defaults to ws', () => {
    expect(selectRealtimeTransport({ ...base, realtime: { url: 'wss://api.test/ws' } })).toBe('ws');
  });

  it('branch 3a: websocket set, no realtime object -> ws (today\'s path, unchanged)', () => {
    expect(selectRealtimeTransport({ ...base, websocket: { url: 'wss://api.test/ws' } })).toBe('ws');
  });

  it('branch 3b: legacy realtime:true -> ws', () => {
    expect(selectRealtimeTransport({ ...base, realtime: true })).toBe('ws');
  });

  it('branch 4: nothing set -> no transport', () => {
    expect(selectRealtimeTransport({ ...base })).toBeNull();
  });

  it('an explicit realtime.enabled:false disables the transport entirely', () => {
    expect(selectRealtimeTransport({ ...base, realtime: { transport: 'sse', enabled: false } })).toBeNull();
  });
});

describe('resolveWebSocketConfigForSelection', () => {
  it('uses realtime.url over websocket.url when both are present (ws branch)', () => {
    const cfg = resolveWebSocketConfigForSelection({
      ...base,
      realtime: { transport: 'ws', url: 'wss://from-realtime' },
      websocket: { url: 'wss://from-websocket' },
    });
    expect(cfg.url).toBe('wss://from-realtime');
  });

  it('falls back to websocket.url when realtime.url is omitted', () => {
    const cfg = resolveWebSocketConfigForSelection({
      ...base,
      realtime: { transport: 'ws' },
      websocket: { url: 'wss://from-websocket', heartbeat: 30000 },
    });
    expect(cfg.url).toBe('wss://from-websocket');
    expect(cfg.heartbeat).toBe(30000);
  });

  it('legacy realtime:true / websocket-only path passes websocket config through untouched', () => {
    const websocket = { url: 'wss://legacy', reconnect: true };
    expect(resolveWebSocketConfigForSelection({ ...base, realtime: true, websocket })).toEqual(websocket);
    expect(resolveWebSocketConfigForSelection({ ...base, websocket })).toEqual(websocket);
  });
});

describe('resolveRealtimeConfig — defaults (Spec 5.2 §3.1)', () => {
  it('applies every documented default', () => {
    const resolved = resolveRealtimeConfig({ ...base, realtime: { transport: 'sse', url: 'https://api.test/events' } });
    expect(resolved).toEqual({
      url: 'https://api.test/events',
      auth: true,
      reconnect: { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
      stallTimeoutMs: 45000,
      lastEventIdHeader: 'Last-Event-ID',
      withCredentials: false,
    });
  });

  it('falls back to websocket.url when realtime.url is omitted (SSE endpoint fallback)', () => {
    const resolved = resolveRealtimeConfig({
      ...base,
      realtime: { transport: 'sse' },
      websocket: { url: 'https://fallback.test/events' },
    });
    expect(resolved.url).toBe('https://fallback.test/events');
  });

  it('honors every override', () => {
    const resolved = resolveRealtimeConfig({
      ...base,
      realtime: {
        transport: 'sse',
        url: 'https://api.test/events',
        auth: false,
        reconnect: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000, jitter: false },
        stallTimeoutMs: 10000,
        lastEventIdHeader: 'X-Last-Id',
        withCredentials: true,
      },
    });
    expect(resolved).toEqual({
      url: 'https://api.test/events',
      auth: false,
      reconnect: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000, jitter: false },
      stallTimeoutMs: 10000,
      lastEventIdHeader: 'X-Last-Id',
      withCredentials: true,
    });
  });
});
