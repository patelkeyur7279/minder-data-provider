/**
 * StreamClient regression tests — Spec 5.2 §7a / §9 step 2.
 *
 * `StreamClient` was refactored to feed the shared, buffered `SseParser`
 * instead of its old inline `chunk.split('\n')` loop. For well-formed streams
 * (standard SSE framing: a blank line terminates each `data:` block) the
 * visible output — `onMessage`/`onDone`/`onError` calls and their payloads —
 * must be byte-for-byte identical to before. The one behavior change is a
 * strict improvement: an event whose `data:` line is split across two network
 * reads is no longer corrupted (G1).
 */
import { TextEncoder, TextDecoder } from 'node:util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { StreamClient } from '../src/core/StreamClient';
import type { MinderConfig } from '../src/core/types';

function makeChunkedResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: jest.fn(async () => {
          if (i < chunks.length) {
            const value = encoder.encode(chunks[i]);
            i += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
      }),
    },
  };
}

const config: MinderConfig = { apiBaseUrl: 'https://api.test', routes: {} };

describe('StreamClient (SseParser-backed) regression', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('delivers one well-formed data: event per onMessage call, unchanged from before the refactor', async () => {
    (global as any).fetch.mockResolvedValueOnce(
      makeChunkedResponse(['data: {"a":1}\n\n', 'data: {"b":2}\n\n', 'data: [DONE]\n\n'])
    );
    const client = new StreamClient(config);
    const onMessage = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await client.stream('https://api.test/events', { onMessage, onDone, onError });
    // Let the background processing loop drain (microtasks).
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onMessage).toHaveBeenNthCalledWith(2, { b: 2 });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('falls back to the raw string when a data: payload is not valid JSON (unchanged)', async () => {
    (global as any).fetch.mockResolvedValueOnce(makeChunkedResponse(['data: not-json\n\n', 'data: [DONE]\n\n']));
    const client = new StreamClient(config);
    const onMessage = jest.fn();

    await client.stream('https://api.test/events', { onMessage });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenCalledWith('not-json');
  });

  it('G1 fix: a data: line split across two network reads is no longer corrupted', async () => {
    // Before the refactor, each `reader.read()` chunk was processed with an
    // isolated `chunk.split('\n')` — a payload straddling two reads produced
    // two corrupt fragments instead of one intact event.
    (global as any).fetch.mockResolvedValueOnce(
      makeChunkedResponse(['data: {"hel', 'lo":"world"}\n\n', 'data: [DONE]\n\n'])
    );
    const client = new StreamClient(config);
    const onMessage = jest.fn();
    const onError = jest.fn();

    await client.stream('https://api.test/events', { onMessage, onError });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ hello: 'world' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('onDone fires on a natural stream end even without an explicit [DONE] sentinel', async () => {
    (global as any).fetch.mockResolvedValueOnce(makeChunkedResponse(['data: {"a":1}\n\n']));
    const client = new StreamClient(config);
    const onMessage = jest.fn();
    const onDone = jest.fn();

    await client.stream('https://api.test/events', { onMessage, onDone });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(onMessage).toHaveBeenCalledWith({ a: 1 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
