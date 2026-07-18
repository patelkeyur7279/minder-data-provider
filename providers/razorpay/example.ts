/**
 * Runnable example for @minder/provider-razorpay (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the server-boundary
 * shape of a Razorpay integration:
 *   1. describe the provider in Minder config (public keyId inline; the keySecret
 *      + webhookSecret via `secret()` — their values stay on the server),
 *   2. mount the two SERVER handlers (create-order + webhook) on server routes,
 *   3. register the provider once at startup and consume it via `useCheckout()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerRazorpayProvider, createOrderHandler, createRazorpayWebhookHandler }
 *     from 'minder-data-provider/providers/razorpay';
 *   import { useCheckout, secret } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration. `minder add razorpay`
 * scaffolds the route files below for you.
 */
import {
  registerRazorpayProvider,
  createOrderHandler,
  createRazorpayWebhookHandler,
} from './src/index.js';
import type { RazorpayProviderConfig } from './src/index.js';
import { secret } from '../../src/security/secrets.js';
import { useCheckout } from '../../src/hooks/contracts.js';

// 1. Config. `keyId` is PUBLIC (safe inline; the browser Checkout widget needs
//    it). `keySecret` + `webhookSecret` are secrets referenced by env-var name —
//    their values stay on the server, and a raw string here would hard-fail config
//    validation in the browser.
const razorpayConfig: RazorpayProviderConfig = {
  keyId: 'rzp_test_your_key_id',
  keySecret: secret('RAZORPAY_KEY_SECRET'),
  webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET'),
};

// 2a. SERVER — the create-order route. Validates the request, resolves the key
//     secret per-request, calls Razorpay over fetch with HTTP Basic auth, and
//     returns { id, amount, currency, keyId }. Mount at
//     `/api/minder/razorpay/order` (Next.js App Router example: export as `POST`).
export const POST_order = createOrderHandler({
  keyId: razorpayConfig.keyId!,
  keySecret: razorpayConfig.keySecret!,
});

// 2b. SERVER — the webhook route. Verifies the `x-razorpay-signature` header (bare
//     hex HMAC-SHA256 over the raw body, no timestamp) on the F-02 primitive, then
//     processes the event. `onEvent` receives the verified `{ body, rawBody, headers }`.
export const POST_webhook = createRazorpayWebhookHandler({
  webhookSecret: razorpayConfig.webhookSecret!,
  async onEvent({ body }) {
    // Handle the verified Razorpay event, e.g. fulfil the order when
    // `event === 'payment.captured'`. `body` is the parsed webhook payload.
    const event = (body as { event?: string })?.event;
    if (event === 'payment.captured') {
      void body;
    }
  },
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...razorpayConfig, mock: true }` (or set providers.razorpay.mock) instead —
//    createCheckout then returns a deterministic `mock://…` URL with zero network.
export async function startRazorpay(): Promise<() => void> {
  return registerRazorpayProvider(razorpayConfig);
}

// 4. Consume it anywhere via the stable `useCheckout()` hook — no Razorpay glue.
//    `createCheckout` POSTs to the order route and returns an order reference the
//    client Checkout widget opens against.
export function useBuyButton(): { checkout: () => Promise<void>; ready: boolean } {
  const { ready, createCheckout } = useCheckout();
  return {
    ready,
    checkout: async () => {
      const { url } = await createCheckout({
        items: [{ name: 'Pro plan', amountCents: 50000, currency: 'inr', quantity: 1 }],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });
      // In a browser you would open the Razorpay Checkout widget for this order.
      void url;
    },
  };
}
