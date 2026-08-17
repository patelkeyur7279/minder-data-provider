/**
 * minder-data-provider/server — web-standard handler core (EDGE-SAFE).
 *
 * This module is deliberately runtime-agnostic: it uses only Web Platform APIs
 * (`Request`, `Response`, `Headers`, `crypto.subtle`, `TextEncoder`). It must
 * NOT reference `require()`, `Buffer`, `process` (beyond guarded `process.env`
 * reads elsewhere), `fs`, or any other Node-only global. That keeps it importable
 * from Cloudflare Workers, Vercel Edge, Deno, Bun, and the browser server runtime.
 *
 * Node-specific mounting lives separately in `./nodeMount.ts`.
 */

/** Context passed to a handler on each request (e.g. the app's server config). */
export interface MinderHandlerContext {
  serverConfig?: Record<string, unknown>;
}

/** A web-standard request handler: `(Request) => Promise<Response>`. */
export type MinderHandler = (req: Request, ctx?: MinderHandlerContext) => Promise<Response>;

/**
 * Build a JSON `Response`. Sets `content-type: application/json` unless the
 * caller overrides it. Edge-safe (uses only `Response` + `JSON`).
 */
export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}
