/**
 * Runnable example for @minder/provider-stripe (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the server-boundary
 * shape of a Stripe integration:
 *   1. describe the provider in Minder config (public publishableKey inline; the
 *      secretKey + webhookSecret via `secret()` — their values stay on the server),
 *   2. mount the two SERVER handlers (create-checkout + webhook) on server routes,
 *   3. register the provider once at startup and consume it via `useCheckout()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerStripeProvider, createCheckoutHandler, createStripeWebhookHandler }
 *     from 'minder-data-provider/providers/stripe';
 *   import { useCheckout, secret } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration. `minder add stripe`
 * (T-02) scaffolds the route files below for you.
 */
import {
  registerStripeProvider,
  createCheckoutHandler,
  createStripeWebhookHandler,
} from './src/index.js';
import type { StripeProviderConfig } from './src/index.js';
import { secret } from '../../src/security/secrets.js';
import { useCheckout } from '../../src/hooks/contracts.js';

// 1. Config. `publishableKey` is PUBLIC (safe inline). `secretKey` +
//    `webhookSecret` are secrets referenced by env-var name — their values stay
//    on the server, and a raw string here would hard-fail config validation in
//    the browser.
const stripeConfig: StripeProviderConfig = {
  publishableKey: 'pk_test_your_publishable_key',
  secretKey: secret('STRIPE_SECRET_KEY'),
  webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
  checkoutPath: '/api/minder/stripe/checkout',
};

// 2a. SERVER — the create-checkout route. Resolves the secret key per-request,
//     calls Stripe over fetch, and returns { url, id }. Mount this at
//     `checkoutPath` (Next.js App Router example: export it as `POST`).
export const POST_checkout = createCheckoutHandler({
  secretKey: stripeConfig.secretKey!,
});

// 2b. SERVER — the webhook route. Verifies the `stripe-signature` header on the
//     F-02 primitive, then processes the event.
export const POST_webhook = createStripeWebhookHandler({
  webhookSecret: stripeConfig.webhookSecret!,
  async onEvent({ body }) {
    // Handle the verified Stripe event, e.g. fulfil the order on
    // 'checkout.session.completed'. `body` is the parsed event payload.
    void body;
  },
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...stripeConfig, mock: true }` (or set providers.stripe.mock) instead —
//    createCheckout then returns a deterministic `mock://…` URL with zero network.
export async function startStripe(): Promise<() => void> {
  return registerStripeProvider(stripeConfig);
}

// 4. Consume it anywhere via the stable `useCheckout()` hook — no Stripe glue.
//    `createCheckout` POSTs to `checkoutPath` and returns the hosted Checkout URL
//    to redirect the buyer to.
export function useBuyButton(): { checkout: () => Promise<void>; ready: boolean } {
  const { ready, createCheckout } = useCheckout();
  return {
    ready,
    checkout: async () => {
      const { url } = await createCheckout({
        items: [{ price: 'price_your_price_id', quantity: 1 }],
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });
      // In a browser you would redirect: window.location.assign(url).
      void url;
    },
  };
}
