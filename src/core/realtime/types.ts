/**
 * Realtime transport types — Spec 5.2 (SSE Transport).
 *
 * `RealtimeTransport` is the shared subscribe/emit surface both `WebSocketManager`
 * (unchanged, structurally conforms) and the new `SseTransport` implement, so
 * `MinderDataProvider` can select either behind one consumer-facing shape.
 *
 * Kept dependency-free (no imports from `AuthManager`/`DebugManager`/offline) so
 * this file — and anything that only needs the *types* — never pulls transport
 * implementation code into a consumer's bundle (P4).
 */

/**
 * Consumer-facing surface a realtime transport must expose. `WebSocketManager`
 * already satisfies this structurally (verified by a test, not refactored — WS
 * stays untouched per Spec 5.2 scope).
 */
export interface RealtimeTransport {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(event: string, callback: (data: unknown) => void): () => void;
  isConnected(): boolean;
  /**
   * Optional — SSE is receive-only. `SseTransport` implements this as a no-op
   * that warns, so code written against the WS surface doesn't crash when
   * swapped to `transport: 'sse'` (§4.7).
   */
  send?(type: string, data: unknown): void;
}

/** Jittered exponential backoff / retry tuning for a realtime transport. */
export interface RealtimeReconnectConfig {
  /** Max reconnect attempts before giving up. 0 = unlimited. Default 10. */
  maxAttempts?: number;
  /** Base delay (ms) for exponential backoff. Default 1000. */
  baseDelayMs?: number;
  /** Backoff cap (ms). Default 30000. */
  maxDelayMs?: number;
  /** Full-jitter the computed delay. Default true. */
  jitter?: boolean;
}

/**
 * Config for the realtime transport layer. `MinderConfig.realtime` is widened
 * from `boolean` to `boolean | RealtimeConfig` — the boolean form is preserved
 * verbatim (superset widening, P1), so `FeatureLoader`'s `!!config.realtime`
 * legacy read keeps working unchanged for both shapes.
 */
export interface RealtimeConfig {
  /** Default: true when the object is present. Explicit `false` disables the transport entirely. */
  enabled?: boolean;
  /** Default: 'ws' — WS remains the default transport. */
  transport?: 'ws' | 'sse';
  /** Endpoint URL. Falls back to `websocket.url` when omitted. */
  url?: string;
  /** Attach `Authorization: Bearer <token>` (SSE) or the token query param (WS). Default true. */
  auth?: boolean;
  reconnect?: RealtimeReconnectConfig;
  /** No-bytes-received stall threshold (ms) before the SSE stream is treated as dead. Default 45000. */
  stallTimeoutMs?: number;
  /** Header name used to resume via `id:` on reconnect. Default 'Last-Event-ID'. */
  lastEventIdHeader?: string;
  /** Attach credentials (cookies) to the SSE fetch. Default false (`credentials: 'omit'`). */
  withCredentials?: boolean;
}

/** `RealtimeConfig` with every optional field defaulted — what `SseTransport` actually consumes. */
export interface ResolvedRealtimeConfig {
  url: string;
  auth: boolean;
  reconnect: Required<RealtimeReconnectConfig>;
  stallTimeoutMs: number;
  lastEventIdHeader: string;
  withCredentials: boolean;
}

/** A single parsed SSE frame produced by `SseParser.feed()`. */
export type SseFrame =
  | { type: 'event'; event: string; data: string; id?: string }
  | { type: 'comment' }
  | { type: 'done' };
