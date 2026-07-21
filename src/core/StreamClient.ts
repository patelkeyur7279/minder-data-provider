import { MinderError } from '../errors/MinderError.js';
import type { MinderConfig } from './types.js';
import type { SseParser as SseParserType } from './realtime/SseParser.js';

export interface StreamOptions {
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage?: (data: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onError?: (error: any) => void;
  onDone?: () => void;
}

export class StreamClient {
  private config: MinderConfig;

  constructor(config: MinderConfig) {
    this.config = config;
  }

  public async stream(url: string, options: StreamOptions): Promise<() => void> {
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.config.auth?.authHeader) {
      // In a real scenario you would await AuthManager's getAccessToken, but we'll leave this flexible
      // Users can pass the token in options.headers
    }

    const abortController = new AbortController();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new MinderError(`Stream connection failed with status ${response.status}`, 'STREAM_CONNECTION_FAILED');
      }

      if (!response.body) {
        throw new MinderError('ReadableStream not supported by response', 'STREAM_NOT_SUPPORTED');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // Shared, buffered parser (Spec 5.2 §4.1) — fixes a real cross-chunk data
      // loss bug the previous inline `chunk.split('\n')` loop had (G1): a `data:`
      // line split across two network reads used to be treated as two complete
      // (and corrupt) lines. `SseParser` buffers the trailing partial line
      // across `feed()` calls instead. Behavior is otherwise unchanged: only
      // `data:` lines are surfaced to `onMessage`, and `[DONE]` still ends the
      // stream via `onDone()`.
      //
      // Loaded via dynamic import (not a static top-level import) so this
      // rarely-used one-shot API doesn't pull the parser into `minder()`'s
      // eager bundle for every consumer (P4) — `minder()`/StreamClient are
      // statically imported by nearly every entry point, so a static import
      // here would have made ALL of them pay for SSE parsing even when
      // `.stream()` is never called. `SseTransport`/`./realtime` share the
      // exact same underlying chunk once code-split.
      const { SseParser } = await import('./realtime/SseParser.js');
      const parser: SseParserType = new SseParser();

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              options.onDone?.();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const frames = parser.feed(chunk);

            let streamEnded = false;
            for (const frame of frames) {
              if (frame.type === 'done') {
                options.onDone?.();
                streamEnded = true;
                break;
              }
              if (frame.type === 'event') {
                const data = frame.data.trim();
                if (data) {
                  try {
                    options.onMessage?.(JSON.parse(data));
                  } catch {
                    options.onMessage?.(data);
                  }
                }
              }
            }
            if (streamEnded) {
              return; // End the stream ([DONE] sentinel)
            }
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            options.onError?.(error);
          }
        }
      };

      // Start processing in the background. The inner loop handles most errors,
      // but attach a catch so a rejection is routed to onError exactly once and
      // never surfaces as an unhandled promise rejection.
      void processStream().catch((error: any) => {
        if (error?.name !== 'AbortError') {
          options.onError?.(error);
        }
      });

    } catch (error) {
      options.onError?.(error);
    }

    // Return a function to abort the stream
    return () => abortController.abort();
  }
}
