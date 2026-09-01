import { Logger, LogLevel } from '../../utils/Logger.js';
import type { AuthManager } from '../AuthManager.js';
import type { DebugManager } from '../../debug/DebugManager.js';
import { DebugLogType } from '../../constants/enums.js';
import { MinderError } from '../../errors/MinderError.js';
import { SseParser } from './SseParser.js';
import type { RealtimeTransport, ResolvedRealtimeConfig } from './types.js';

const logger = /*#__PURE__*/ new Logger('SseTransport', { level: LogLevel.WARN });

/** HTTP statuses that must NOT trigger a reconnect (Spec 5.2 §4.2). */
function isPermanentStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 204;
}

/**
 * Managed, reconnecting Server-Sent Events transport — Spec 5.2.
 *
 * Presents the same subscribe/emit surface as `WebSocketManager`
 * (`RealtimeTransport`), built on `fetch` + `ReadableStream` (deliberately NOT
 * native `EventSource`, which cannot set request headers — see §4.3). Promotes
 * the one-shot `StreamClient` primitive into a managed source with jittered
 * exponential backoff, `Last-Event-ID` resume, stall detection, and permanent
 * vs. transient failure classification.
 *
 * `maxAttempts` semantics: counts total failed CONNECTION ATTEMPTS (the initial
 * `connect()` call counts as attempt 1, same as every reconnect) — after the
 * `maxAttempts`-th failure the transport gives up and emits a terminal
 * `__closed` event; it never issues a further fetch (§4.9, acceptance 7).
 */
export class SseTransport implements RealtimeTransport {
  private readonly config: ResolvedRealtimeConfig;
  private readonly authManager: AuthManager;
  private readonly debugManager?: DebugManager;
  private readonly enableLogs: boolean;

  private readonly parser = new SseParser();
  private readonly listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  private abortController: AbortController | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private attempt = 0;
  private epoch = 0;
  private destroyed = true; // not connected until connect() is called
  private connected = false;

  private pendingConnect: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  /** The in-flight connect() promise, if an initial connection is still being established. */
  private connectPromise: Promise<void> | null = null;

  constructor(
    config: ResolvedRealtimeConfig,
    authManager: AuthManager,
    debugManager?: DebugManager,
    enableLogs = false
  ) {
    this.config = config;
    this.authManager = authManager;
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
  }

  connect(): Promise<void> {
    if (!this.destroyed) {
      // Already active: connecting (return the SAME in-flight promise),
      // connected, or auto-reconnecting after a drop. Never start a second
      // parallel fetch + stall timer, and never overwrite abortController
      // without aborting the first (double-connect race).
      return this.connectPromise ?? Promise.resolve();
    }

    this.destroyed = false;
    this.attempt = 0;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.pendingConnect = { resolve, reject };
      void this.attemptConnect();
    });

    // N3 (fix-2.2.0-blockers): guarantee at least one rejection handler is
    // attached to THIS promise, so a connect() failure (config_error, a
    // permanent HTTP status, a platform without ReadableStream support, or
    // exhausting reconnect attempts — see failInitial()'s call sites) can
    // never surface as an unhandled rejection — fatal to a Node-hosted
    // consumer (SSR, Electron main, the /node and /electron subpaths) and an
    // "Uncaught (in promise)" in browsers. `SseTransport` is exported
    // directly from the `./realtime` subpath (src/core/realtime/index.ts),
    // so a consumer can construct and `.connect()` it with NO hook and NO
    // `MinderContext` in between — `useWebSocket()`'s guard in
    // src/hooks/index.ts never runs for that call path. Same fix shape as
    // `WebSocketManager.connect()` (src/core/WebSocketManager.ts) — this is
    // a silent no-op that does NOT swallow or alter the rejection for a
    // caller that DOES attach its own `.catch()`/`await`: every handler
    // attached to a promise fires independently when the promise settles.
    this.connectPromise.catch(() => { /* see comment above */ });

    return this.connectPromise;
  }

  disconnect(): void {
    this.destroyed = true;
    this.connected = false;
    this.clearStallTimer();
    this.clearReconnectTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pendingConnect) {
      // A disconnect() before the first connection ever resolved shouldn't
      // leave connect()'s promise hanging forever.
      this.pendingConnect.resolve();
      this.pendingConnect = null;
    }
    this.connectPromise = null;

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '🔌 SSE DISCONNECT', {});
    }
  }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  isConnected(): boolean {
    return this.connected && !this.destroyed;
  }

  /** SSE is receive-only (§4.7) — never throws, so WS-authored call sites keep working. */
  send(_type: string, _data: unknown): void {
    logger.warn(
      "SSE transport is receive-only; send() ignored — use REST/mutations for client→server, or transport:'ws' for bidirectional."
    );
  }

  // ---------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------

  private async attemptConnect(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const myEpoch = ++this.epoch;

    if (!this.config.url) {
      this.failInitial(new MinderError('SSE URL is required', 'SSE_URL_REQUIRED'));
      this.emitClosed('config_error');
      this.destroyed = true;
      return;
    }

    this.parser.resetBuffer();

    const controller = new AbortController();
    this.abortController = controller;
    this.armStallTimer();

    let response: Response;
    try {
      const headers = await this.buildHeaders();
      if (myEpoch !== this.epoch || this.destroyed) {
        return;
      }
      response = await fetch(this.config.url, {
        headers,
        signal: controller.signal,
        credentials: this.config.withCredentials ? 'include' : 'omit',
      });
    } catch (error) {
      if (myEpoch !== this.epoch) {
        return;
      }
      if (this.destroyed || (error as { name?: string })?.name === 'AbortError') {
        return;
      }
      this.handleTransientFailure(undefined, error);
      return;
    }

    if (myEpoch !== this.epoch || this.destroyed) {
      return;
    }

    if (isPermanentStatus(response.status)) {
      void response.body?.cancel?.().catch(() => undefined);
      this.handlePermanentFailure(`HTTP ${response.status}`);
      return;
    }

    if (!response.ok) {
      void response.body?.cancel?.().catch(() => undefined);
      this.handleTransientFailure(response);
      return;
    }

    const reader = response.body?.getReader?.();
    if (!reader) {
      // RN/Expo fetch does not implement a readable response body (P5) — fail
      // fast and clearly instead of a silently-dead stream.
      this.destroyed = true;
      this.clearStallTimer();
      this.failInitial(
        new MinderError('SSE requires ReadableStream; unavailable on this platform', 'SSE_STREAM_UNSUPPORTED')
      );
      this.emitClosed('unsupported');
      return;
    }

    this.markConnected();
    await this.readLoop(reader, myEpoch);
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>, myEpoch: number): Promise<void> {
    const decoder = new TextDecoder();

    while (true) {
      if (myEpoch !== this.epoch || this.destroyed) {
        return;
      }

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        if (myEpoch !== this.epoch) {
          return;
        }
        if (this.destroyed || (error as { name?: string })?.name === 'AbortError') {
          return;
        }
        this.handleTransientFailure(undefined, error);
        return;
      }

      if (myEpoch !== this.epoch || this.destroyed) {
        return;
      }

      const { done, value } = result;
      if (done) {
        this.handleTransientFailure();
        return;
      }

      this.resetStallTimer();
      // Backoff resets on the first BYTE received (§4.2), not merely on
      // obtaining a reader — a connection that opens (2xx, reader obtained)
      // but drops before ever delivering a byte must NOT reset the exponential
      // backoff, or a flapping server that always accepts-then-drops would
      // defeat backoff entirely. Idempotent — cheap to set on every read.
      this.attempt = 0;

      const text = decoder.decode(value, { stream: true });
      const frames = this.parser.feed(text);

      for (const frame of frames) {
        if (frame.type === 'event') {
          this.dispatch(frame.event, tryParseJson(frame.data));
        }
        // 'comment' frames are keepalives (already reset the stall timer above);
        // 'done' ([DONE]) is a StreamClient convention with no meaning for the
        // managed transport's generic pub/sub surface — both are no-ops here.
      }
    }
  }

  // ---------------------------------------------------------------------
  // Failure handling / reconnect
  // ---------------------------------------------------------------------

  private handleTransientFailure(response?: Response, error?: unknown): void {
    if (this.destroyed) {
      return;
    }

    this.connected = false;
    this.clearStallTimer();
    this.abortController = null;
    this.attempt += 1;

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '⚠️ SSE TRANSIENT FAILURE', {
        attempt: this.attempt,
        status: response?.status,
        error: error instanceof Error ? error.message : error,
      });
    }

    if (this.config.reconnect.maxAttempts > 0 && this.attempt >= this.config.reconnect.maxAttempts) {
      this.giveUp();
      return;
    }

    const retryAfterMs = response ? parseRetryAfter(response, this.config.reconnect.maxDelayMs) : undefined;
    const delay = retryAfterMs ?? this.computeBackoffDelay();
    this.scheduleReconnect(delay);
  }

  private handlePermanentFailure(reason: string): void {
    this.connected = false;
    this.clearStallTimer();
    this.clearReconnectTimer();
    this.abortController = null;
    this.destroyed = true;

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '🛑 SSE PERMANENT CLOSE', { reason });
    }

    this.failInitial(new MinderError(`SSE connection closed permanently: ${reason}`, 'SSE_PERMANENT_CLOSE'));
    this.emitClosed(reason, this.attempt);
  }

  private giveUp(): void {
    this.clearReconnectTimer();
    this.clearStallTimer();
    this.destroyed = true;

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '🛑 SSE GIVE UP', { attempts: this.attempt });
    }

    this.failInitial(new MinderError(`SSE reconnect gave up after ${this.attempt} attempts`, 'SSE_MAX_ATTEMPTS'));
    this.emitClosed('max_attempts', this.attempt);
  }

  private scheduleReconnect(delay: number): void {
    if (this.destroyed) {
      return;
    }
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) {
        return;
      }
      void this.attemptConnect();
    }, delay);
  }

  private computeBackoffDelay(): number {
    const { baseDelayMs, maxDelayMs, jitter } = this.config.reconnect;
    const base = this.parser.retryMs ?? baseDelayMs;
    const raw = Math.min(maxDelayMs, base * Math.pow(2, this.attempt - 1));
    return jitter ? Math.random() * raw : raw;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private markConnected(): void {
    this.connected = true;
    // NOTE: `attempt` is deliberately NOT reset here — see the comment in
    // `readLoop` (§4.2: backoff resets on the first byte received, not on
    // merely obtaining a reader/stream).

    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.WEBSOCKET, '✅ SSE CONNECTED', { url: this.config.url });
    }

    if (this.pendingConnect) {
      this.pendingConnect.resolve();
      this.pendingConnect = null;
    }
    this.connectPromise = null;
  }

  private failInitial(error: unknown): void {
    if (this.pendingConnect) {
      this.pendingConnect.reject(error);
      this.pendingConnect = null;
    }
    this.connectPromise = null;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };

    if (this.config.auth) {
      // Async so RN/Expo's async token stores work too; re-read on every
      // (re)connect so a refreshed token is picked up automatically (§4.3).
      const token = await this.authManager.getTokenAsync();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // The first connect() never has a lastEventId yet (fresh parser); only a
    // reconnect after an `id:` line sends one (acceptance 13).
    const lastEventId = this.parser.lastEventId;
    if (lastEventId) {
      headers[this.config.lastEventIdHeader] = lastEventId;
    }

    return headers;
  }

  private dispatch(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const callback of set) {
      callback(data);
    }
  }

  private emitClosed(reason: string, attempts: number = this.attempt): void {
    this.dispatch('__closed', { reason, attempts });
  }

  private armStallTimer(): void {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.destroyed) {
        return;
      }
      this.abortController?.abort();
      this.abortController = null;
      this.handleTransientFailure(undefined, new MinderError('SSE stream stalled', 'SSE_STALL_TIMEOUT'));
    }, this.config.stallTimeoutMs);
  }

  private resetStallTimer(): void {
    if (this.destroyed) {
      return;
    }
    this.armStallTimer();
  }

  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Derives the next reconnect delay from a `Retry-After` response header
 * (seconds form or HTTP-date form), clamped to `maxDelayMs`. Returns
 * `undefined` when the header is absent or unparsable — the caller falls back
 * to the computed jittered backoff (acceptance 12).
 */
function parseRetryAfter(response: Response, maxDelayMs: number): number | undefined {
  const header = response.headers?.get?.('Retry-After');
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return Math.min(maxDelayMs, Math.max(0, seconds * 1000));
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.min(maxDelayMs, Math.max(0, dateMs - Date.now()));
  }

  return undefined;
}
