import type { NextApiRequest, NextApiResponse } from "next";
import {
  createWebhookHandler,
  secret,
  jsonResponse,
  toNodeHandler,
} from "minder-data-provider/server";

/**
 * Proves the Node server entry (`minder-data-provider/server`) inside a real
 * Next.js Pages Router API route. `createWebhookHandler` builds a
 * web-standard (Request -> Response) handler that verifies an HMAC-SHA256
 * webhook signature via WebCrypto (constant-time, no Node-only crypto), and
 * `toNodeHandler` adapts that handler to Next's `(req, res)` API-route shape.
 * This mirrors examples/edge-worker's POST /webhook route, ported from
 * workerd to a Node API route.
 */

// `toNodeHandler` reads the raw request body stream itself so it can hash the
// exact bytes that were signed — Next's default JSON body parser would
// consume the stream (and re-serialize the body, changing its bytes) before
// this handler ever saw it, breaking signature verification. Must stay off.
export const config = {
  api: {
    bodyParser: false,
  },
};

const webhookHandler = createWebhookHandler({
  secret: secret(
    "NEXTJS_EXAMPLE_WEBHOOK_SECRET",
    process.env.NEXTJS_EXAMPLE_WEBHOOK_SECRET ?? "nextjs-smoke-secret"
  ),
  signatureHeader: "x-minder-signature",
  algorithm: "hmac-sha256",
  onEvent: async ({ body }) => jsonResponse({ verified: true, body }),
});

const nodeHandler = toNodeHandler(webhookHandler);

export default function webhookDemoHandler(req: NextApiRequest, res: NextApiResponse): void {
  nodeHandler(req, res);
}
