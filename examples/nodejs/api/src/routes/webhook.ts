import { Router } from 'express';
import { createWebhookHandler, secret, toNodeHandler } from 'minder-data-provider/server';

/**
 * Webhook Router — Node-server proof for `minder-data-provider/server`.
 *
 * Demonstrates:
 * - `createWebhookHandler()` — HMAC-SHA256 webhook signature verification via
 *   WebCrypto (`crypto.subtle`), the same edge-safe implementation the
 *   Cloudflare Worker example exercises (../../../edge-worker/src/index.ts).
 * - `secret()` — server-only credential resolution from `process.env`.
 * - `toNodeHandler()` — the Node-specific adapter that bridges the
 *   web-standard `(Request) => Promise<Response>` handler onto Express's
 *   `(req, res)` signature. This is the piece that's unique to the Node path:
 *   the edge-worker example calls the handler directly against a Fetch API
 *   `Request` (native to workerd); here Express hands us Node's
 *   `IncomingMessage`/`ServerResponse`, and `toNodeHandler` bridges the two.
 *
 * IMPORTANT: this router MUST be mounted before `express.json()` in app.ts.
 * `createWebhookHandler` verifies the signature over the RAW request body;
 * `express.json()` would drain and re-parse the body stream first, leaving
 * nothing for `toNodeHandler`'s listener to read.
 */

const webhookHandler = createWebhookHandler({
  secret: secret('NODEJS_WEBHOOK_SECRET', process.env.NODEJS_WEBHOOK_SECRET ?? 'nodejs-smoke-secret'),
  signatureHeader: 'x-minder-signature',
  algorithm: 'hmac-sha256',
  onEvent: async ({ body }) =>
    new Response(JSON.stringify({ verified: true, body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
});

const router = Router();

/**
 * POST /api/webhook
 * - Valid `x-minder-signature` (hex HMAC-SHA256 of the raw body, keyed by
 *   NODEJS_WEBHOOK_SECRET, default "nodejs-smoke-secret") -> 200
 *   `{ verified: true, body }`
 * - Missing signature header -> 400; invalid/tampered signature -> 401
 */
router.post('/', toNodeHandler(webhookHandler));

export default router;
