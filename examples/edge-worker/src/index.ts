/**
 * Cloudflare Worker example — proves minder-data-provider's edge (workerd) path
 * for real, on real workerd (via `wrangler dev`), not just by static analysis.
 *
 * Routes:
 *   GET  /users    → the pure `minder()` JSON data path via the native-fetch
 *                    transport (see ../../../docs/EDGE.md), proxying the mock
 *                    upstream in ../mock-upstream.mjs.
 *   POST /webhook  → HMAC-SHA256 webhook signature verification via
 *                    `minder-data-provider/server`'s `createWebhookHandler`
 *                    (crypto.subtle — edge-safe, constant-time).
 *
 * wrangler.toml deliberately does NOT set `compatibility_flags = ["nodejs_compat"]`
 * — this Worker runs on bare workerd with no Node polyfills, so a green run here
 * is real Support-Matrix evidence (see docs/product/SUPPORT_MATRIX.md).
 */
import { minder } from 'minder-data-provider';
import { createWebhookHandler, secret, jsonResponse } from 'minder-data-provider/server';

export interface Env {
  /** Upstream API base URL. Set via wrangler.toml [vars] for local dev/CI. */
  API_BASE_URL?: string;
  /** HMAC signing secret for the /webhook route. Set via wrangler.toml [vars]. */
  EDGE_WEBHOOK_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /users — minder() data path, forced onto the native-fetch transport
    // (the same transport minder auto-selects on edge runtimes by default).
    if (request.method === 'GET' && url.pathname === '/users') {
      const { data, error, success, status } = await minder('/users', undefined, {
        baseURL: env.API_BASE_URL ?? 'http://127.0.0.1:8788',
        transport: 'fetch',
      });

      if (!success || error) {
        return jsonResponse(
          { error: error?.message ?? 'upstream request failed' },
          { status: status || 502 }
        );
      }
      return jsonResponse(data);
    }

    // POST /webhook — HMAC-SHA256 verification via crypto.subtle. The secret is
    // captured at construction time from the Worker's `env` binding (never from
    // `process.env`, which Workers don't provide without nodejs_compat).
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const handler = createWebhookHandler({
        secret: secret('EDGE_WEBHOOK_SECRET', env.EDGE_WEBHOOK_SECRET ?? 'edge-smoke-secret'),
        signatureHeader: 'x-minder-signature',
        algorithm: 'hmac-sha256',
        onEvent: async ({ body }) => jsonResponse({ verified: true, body }),
      });
      return handler(request);
    }

    return jsonResponse({ error: 'not found' }, { status: 404 });
  },
};
