/**
 * minder-data-provider/server — Node adapter for the web-standard handler core.
 *
 * This file is Node-specific and therefore EXEMPT from the edge-safe rule, but it
 * still keeps its `http` dependency type-only so importing the barrel never pulls
 * `node:http` into an edge bundle. It bridges Node's `(req, res)` model to a
 * web-standard `Request`/`Response` handler.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { MinderHandler, MinderHandlerContext } from './handlers.js';

/**
 * Adapt a `MinderHandler` (web-standard `Request` → `Response`) into a Node
 * `(req, res)` listener suitable for `http.createServer(...)`. Faithfully
 * transfers method, headers, body, status, and response body in both directions.
 */
export function toNodeHandler(
  h: MinderHandler,
  ctx?: MinderHandlerContext
): (req: IncomingMessage, res: ServerResponse) => void {
  return function nodeListener(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Uint8Array[] = [];

    req.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk);
    });

    req.on('error', () => {
      res.statusCode = 400;
      res.end();
    });

    req.on('end', () => {
      void (async () => {
        try {
          const bodyBuffer = Buffer.concat(chunks);
          const method = (req.method ?? 'GET').toUpperCase();
          const host = (req.headers.host as string | undefined) ?? 'localhost';
          const url = `http://${host}${req.url ?? '/'}`;

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) {
              for (const v of value) headers.append(key, v);
            } else {
              headers.set(key, String(value));
            }
          }

          const hasBody = method !== 'GET' && method !== 'HEAD' && bodyBuffer.length > 0;
          const request = new Request(url, {
            method,
            headers,
            body: hasBody ? bodyBuffer : undefined,
          });

          const response = await h(request, ctx);

          res.statusCode = response.status;
          response.headers.forEach((headerValue, headerKey) => {
            res.setHeader(headerKey, headerValue);
          });

          const responseBody = Buffer.from(await response.arrayBuffer());
          res.end(responseBody);
        } catch {
          if (!res.headersSent) {
            res.statusCode = 500;
          }
          res.end(JSON.stringify({ error: 'Internal handler error.', code: 'HANDLER_ERROR' }));
        }
      })();
    });
  };
}
