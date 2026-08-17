import type { MinderConfig, WebSocketConfig } from '../types.js';
import type { ResolvedRealtimeConfig } from './types.js';

export type RealtimeTransportKind = 'ws' | 'sse' | null;

/**
 * Deterministic transport-selection precedence — Spec 5.2 §3.1:
 *  1. `realtime` is an object with `transport: 'sse'` AND `enabled !== false` → SSE.
 *  2. `realtime` object with `transport: 'ws'` (or omitted), `enabled !== false` → WS.
 *  3. `realtime === true` (legacy boolean) or `websocket` set, no `realtime` object → WS
 *     (today's path, unchanged).
 *  4. Nothing set → no transport.
 *
 * WS stays the default (P1) — `SseTransport` is only ever selected by explicit opt-in.
 */
export function selectRealtimeTransport(config: MinderConfig): RealtimeTransportKind {
  const realtime = config.realtime;

  if (realtime && typeof realtime === 'object') {
    if (realtime.enabled === false) {
      return null;
    }
    return realtime.transport === 'sse' ? 'sse' : 'ws';
  }

  if (realtime === true || config.websocket) {
    return 'ws';
  }

  return null;
}

/**
 * Resolves the `WebSocketConfig` used to construct `WebSocketManager` for the
 * 'ws' branch. When `realtime` is an object, its `url` takes precedence over
 * `websocket.url` (§3.1 rule 2: "using realtime.url ?? websocket.url"); the
 * legacy path (`realtime: true` / `websocket` only, rule 3) is untouched —
 * `websocket` config passes through exactly as before.
 */
export function resolveWebSocketConfigForSelection(config: MinderConfig): WebSocketConfig {
  const realtime = config.realtime;

  if (realtime && typeof realtime === 'object') {
    const url = realtime.url ?? config.websocket?.url;
    return { ...(config.websocket ?? {}), url };
  }

  return config.websocket ?? {};
}

/** Defaults applied to `RealtimeConfig` — Spec 5.2 §3.1. */
const DEFAULT_RECONNECT = {
  maxAttempts: 10,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
} as const;

/** Resolves the full, defaulted config `SseTransport` consumes for the 'sse' branch. */
export function resolveRealtimeConfig(config: MinderConfig): ResolvedRealtimeConfig {
  const realtime = config.realtime && typeof config.realtime === 'object' ? config.realtime : undefined;

  return {
    url: realtime?.url ?? config.websocket?.url ?? '',
    auth: realtime?.auth ?? true,
    reconnect: {
      maxAttempts: realtime?.reconnect?.maxAttempts ?? DEFAULT_RECONNECT.maxAttempts,
      baseDelayMs: realtime?.reconnect?.baseDelayMs ?? DEFAULT_RECONNECT.baseDelayMs,
      maxDelayMs: realtime?.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs,
      jitter: realtime?.reconnect?.jitter ?? DEFAULT_RECONNECT.jitter,
    },
    stallTimeoutMs: realtime?.stallTimeoutMs ?? 45000,
    lastEventIdHeader: realtime?.lastEventIdHeader ?? 'Last-Event-ID',
    withCredentials: realtime?.withCredentials ?? false,
  };
}
