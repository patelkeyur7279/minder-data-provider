import type { SseFrame } from './types.js';

/**
 * Buffered, stateful SSE (text/event-stream) parser — Spec 5.2 §4.1.
 *
 * Extracted and shared by `SseTransport` and (via a thin refactor) `StreamClient`,
 * fixing real gaps in the latter's inline `split('\n')` loop:
 *  - G1: an event whose `data:` line spans two network reads no longer gets
 *    corrupted — the trailing partial line is buffered until a terminator arrives.
 *  - G4/G7: `event:`, `id:`, `retry:` are recognized (not just `data:`), and the
 *    optional single leading space after the colon is honored either way
 *    (`data:x` and `data: x` both parse to `"x"`).
 *
 * Pure and I/O-free — no fetch, no timers — so it is unit-testable in isolation.
 */
export class SseParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];
  private blockId: string | undefined;
  private hasData = false;

  private _lastEventId: string | undefined;
  private _retryMs: number | undefined;

  /** The most recently seen `id:` value — persists across dispatches/reconnects (drives `Last-Event-ID`). */
  get lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /** The most recently seen `retry:` value in ms, if any (server-suggested backoff base). */
  get retryMs(): number | undefined {
    return this._retryMs;
  }

  /**
   * Discards the in-progress line buffer and any partially-accumulated event
   * block. Called at the start of every fresh connection attempt — a dropped
   * TCP/fetch stream may have left a half-written line that belongs to nothing.
   * Does NOT reset `lastEventId`/`retryMs`: those persist across reconnects by
   * design (§4.5) — the very first connect() never had one to send, but a
   * reconnect must.
   */
  resetBuffer(): void {
    this.buffer = '';
    this.eventName = '';
    this.dataLines = [];
    this.blockId = undefined;
    this.hasData = false;
  }

  /** Feed a decoded string chunk; returns zero or more fully-formed frames. */
  feed(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let i = 0;

    while (i < this.buffer.length) {
      const nl = this.buffer.indexOf('\n', i);
      const cr = this.buffer.indexOf('\r', i);
      let sepIndex: number;
      let sepLen: number;

      if (cr !== -1 && (nl === -1 || cr < nl)) {
        if (cr === this.buffer.length - 1) {
          // Trailing lone \r — could be the first half of a \r\n split across
          // chunk boundaries. Wait for more data before deciding.
          break;
        }
        sepIndex = cr;
        sepLen = this.buffer[cr + 1] === '\n' ? 2 : 1;
      } else if (nl !== -1) {
        sepIndex = nl;
        sepLen = 1;
      } else {
        // No terminator yet — keep the tail buffered (fixes G1).
        break;
      }

      const line = this.buffer.slice(i, sepIndex);
      this.processLine(line, frames);
      i = sepIndex + sepLen;
    }

    this.buffer = this.buffer.slice(i);
    return frames;
  }

  private processLine(line: string, out: SseFrame[]): void {
    if (line === '') {
      this.dispatch(out);
      return;
    }

    if (line.startsWith(':')) {
      out.push({ type: 'comment' });
      return;
    }

    if (line.startsWith('data:')) {
      this.dataLines.push(stripFieldValue(line, 5));
      this.hasData = true;
      return;
    }

    if (line.startsWith('event:')) {
      this.eventName = stripFieldValue(line, 6);
      return;
    }

    if (line.startsWith('id:')) {
      const value = stripFieldValue(line, 3);
      this.blockId = value;
      this._lastEventId = value;
      return;
    }

    if (line.startsWith('retry:')) {
      const value = stripFieldValue(line, 6);
      const ms = Number(value);
      if (!Number.isNaN(ms) && value.trim() !== '') {
        this._retryMs = ms;
      }
      return;
    }

    // Unknown field name — ignored per the SSE spec.
  }

  private dispatch(out: SseFrame[]): void {
    if (!this.hasData) {
      // A blank line with no data: field(s) (comment-only / id-only / retry-only
      // block) dispatches nothing (§4.1).
      this.eventName = '';
      this.blockId = undefined;
      this.hasData = false;
      this.dataLines = [];
      return;
    }

    const data = this.dataLines.join('\n');
    const event = this.eventName || 'message';
    const id = this.blockId;

    this.eventName = '';
    this.blockId = undefined;
    this.hasData = false;
    this.dataLines = [];

    if (data === '[DONE]') {
      out.push({ type: 'done' });
      return;
    }

    out.push({ type: 'event', event, data, id });
  }
}

/** Strip the field-name prefix and one optional leading space from the value. */
function stripFieldValue(line: string, prefixLength: number): string {
  let value = line.slice(prefixLength);
  if (value.startsWith(' ')) {
    value = value.slice(1);
  }
  return value;
}
