/**
 * SseParser tests — Spec 5.2 §7a.
 *
 * Pure, I/O-free parser: fed decoded string chunks, returns fully-formed
 * frames. Covers the buffered cross-chunk fix (G1), multi-field/multi-line
 * parsing (G4/G7), comment keepalives, and the `[DONE]` sentinel.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { SseParser } from '../src/core/realtime/SseParser';

describe('SseParser', () => {
  let parser: SseParser;

  beforeEach(() => {
    parser = new SseParser();
  });

  it('parses a well-formed data: event terminated by a blank line', () => {
    const frames = parser.feed('data: {"a":1}\n\n');
    expect(frames).toEqual([{ type: 'event', event: 'message', data: '{"a":1}', id: undefined }]);
  });

  it('buffers a data: line split across two feed() calls (fixes G1)', () => {
    // The payload is split mid-line across two network reads — the old inline
    // `chunk.split('\n')` loop would treat each half as a separate (corrupt)
    // line. The buffered parser must reassemble it into one intact event.
    const firstHalf = parser.feed('data: {"hello":"wo');
    expect(firstHalf).toEqual([]); // nothing dispatched yet — no terminator seen

    const rest = parser.feed('rld"}\n\n');
    expect(rest).toEqual([{ type: 'event', event: 'message', data: '{"hello":"world"}', id: undefined }]);
  });

  it('joins multiple data: lines in one block with \\n (spec-correct multi-line data)', () => {
    const frames = parser.feed('data: line one\ndata: line two\n\n');
    expect(frames).toEqual([{ type: 'event', event: 'message', data: 'line one\nline two', id: undefined }]);
  });

  it('captures event:, id:, and retry: fields', () => {
    const frames = parser.feed('event: order.updated\nid: 42\ndata: {"x":1}\n\n');
    expect(frames).toEqual([{ type: 'event', event: 'order.updated', data: '{"x":1}', id: '42' }]);
    expect(parser.lastEventId).toBe('42');
  });

  it('honors retry: as a server-suggested backoff base, without dispatching an event', () => {
    const frames = parser.feed('retry: 5000\ndata: ping\n\n');
    expect(parser.retryMs).toBe(5000);
    expect(frames).toEqual([{ type: 'event', event: 'message', data: 'ping', id: undefined }]);
  });

  it('emits a comment frame for lines starting with ":" (keepalive), dispatching nothing', () => {
    const frames = parser.feed(': keepalive\n');
    expect(frames).toEqual([{ type: 'comment' }]);
  });

  it('a comment-only block followed by a blank line still dispatches nothing', () => {
    const frames = parser.feed(': keepalive\n\n');
    expect(frames).toEqual([{ type: 'comment' }]);
  });

  it('parses "data:x" with no space exactly like "data: x" with a space (fixes G7)', () => {
    const noSpace = new SseParser().feed('data:x\n\n');
    const withSpace = new SseParser().feed('data: x\n\n');
    expect(noSpace).toEqual([{ type: 'event', event: 'message', data: 'x', id: undefined }]);
    expect(withSpace).toEqual([{ type: 'event', event: 'message', data: 'x', id: undefined }]);
  });

  it('only strips a single optional leading space (extra spaces are preserved)', () => {
    const frames = parser.feed('data:  x\n\n'); // two spaces after the colon
    expect(frames).toEqual([{ type: 'event', event: 'message', data: ' x', id: undefined }]);
  });

  it('terminates on the [DONE] sentinel, preserved for minder.stream back-compat', () => {
    const frames = parser.feed('data: [DONE]\n\n');
    expect(frames).toEqual([{ type: 'done' }]);
  });

  it('normalizes CRLF line endings', () => {
    const frames = parser.feed('data: crlf-event\r\n\r\n');
    expect(frames).toEqual([{ type: 'event', event: 'message', data: 'crlf-event', id: undefined }]);
  });

  it('handles a CRLF split exactly at the \\r/\\n boundary across two feed() calls', () => {
    const first = parser.feed('data: split\r');
    expect(first).toEqual([]); // ambiguous trailing \r — wait for more data
    const second = parser.feed('\n\r\n');
    expect(second).toEqual([{ type: 'event', event: 'message', data: 'split', id: undefined }]);
  });

  it('delivers multiple events fed in one chunk, each on its own blank-line boundary', () => {
    const frames = parser.feed('data: one\n\ndata: two\n\n');
    expect(frames).toEqual([
      { type: 'event', event: 'message', data: 'one', id: undefined },
      { type: 'event', event: 'message', data: 'two', id: undefined },
    ]);
  });

  it('lastEventId persists across dispatches until a new id: line overwrites it', () => {
    parser.feed('id: 1\ndata: a\n\n');
    expect(parser.lastEventId).toBe('1');
    parser.feed('data: b\n\n'); // no id: line this time
    expect(parser.lastEventId).toBe('1'); // still the last one seen
  });

  it('resetBuffer() discards a half-written line but keeps lastEventId/retryMs (§4.5 resume)', () => {
    parser.feed('id: 99\nretry: 2000\ndata: partial-tail-with-no-terminator');
    parser.resetBuffer();
    expect(parser.lastEventId).toBe('99');
    expect(parser.retryMs).toBe(2000);
    // The half-written "data:" line from before reset must not leak into a
    // frame parsed after reset.
    const frames = parser.feed('data: fresh\n\n');
    expect(frames).toEqual([{ type: 'event', event: 'message', data: 'fresh', id: undefined }]);
  });
});
