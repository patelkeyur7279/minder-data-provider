import type { NextApiRequest, NextApiResponse } from "next";
import { createCheckoutHandler } from "minder-data-provider/providers/stripe";
import { secret } from "minder-data-provider";

/**
 * Demonstrates the REAL server boundary for Stripe checkout — the shape
 * `minder add stripe` scaffolds in production: `createCheckoutHandler` resolves
 * `STRIPE_SECRET_KEY` server-side and calls Stripe's REST API directly (no SDK,
 * no key ever sent to the browser). `secret()` never eagerly reads or throws —
 * it just records the env var name to resolve per-request, so it's safe to build
 * this handler at module load even when the key is unset.
 *
 * GUARDED so this example builds and runs with zero keys: if STRIPE_SECRET_KEY
 * is unset we short-circuit BEFORE the handler ever touches Stripe, returning a
 * mock acknowledgement instead. A real deployment always has the env var set, so
 * `minder add stripe` scaffolds this same wiring WITHOUT the guard.
 */
const stripeCheckoutHandler = createCheckoutHandler({
  secretKey: secret("STRIPE_SECRET_KEY"),
});

export default async function checkoutDemoHandler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(200).json({
      mock: true,
      note: "Set STRIPE_SECRET_KEY to enable real checkout",
    });
    return;
  }

  // Real wiring: adapt the Next.js pages-API request into the web-standard
  // Request the shared handler expects, run it, then mirror the Response back.
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/api/checkout-demo", `http://${host}`);
  const webRequest = new Request(url, {
    method: req.method ?? "POST",
    headers: { "content-type": "application/json" },
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : JSON.stringify(req.body ?? {}),
  });

  const webResponse = await stripeCheckoutHandler(webRequest);
  const text = await webResponse.text();
  res.status(webResponse.status);
  res.setHeader("content-type", webResponse.headers.get("content-type") ?? "application/json");
  res.send(text);
}
