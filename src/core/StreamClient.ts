import { MinderError } from '../errors/MinderError.js';
import type { MinderConfig } from './types.js';

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

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              options.onDone?.();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  options.onDone?.();
                  return; // End the stream
                }
                if (data) {
                  try {
                    options.onMessage?.(JSON.parse(data));
                  } catch {
                    options.onMessage?.(data);
                  }
                }
              }
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
