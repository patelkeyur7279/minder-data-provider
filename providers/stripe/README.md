# @minder/provider-stripe

The Stripe adapter for [Minder](../../README.md) — the **server-boundary
showcase**. Checkout sessions are created **on the server** (your secret key
never travels near the browser), and inbound webhooks are verified on Minder's
edge-safe HMAC primitive. On the client you use one stable hook — `useCheckout()`
— so you switch payment providers by config, not by rewriting integration code.

- **Categories:** payments
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — untested)
- **Peer dependency:** `stripe` `^14.0.0` (optional; only for the raw-SDK escape
  hatch via `getProviderClient()` — checkout + webhooks use `fetch`, no SDK)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Stripe account** and get your API keys from the dashboard:
   <https://dashboard.stripe.com/apikeys>
   - **Publishable key** (`publishableKey`, `pk_...`) — public (see Security).
   - **Secret key** (`secretKey`, `sk_...`) — secret; server only.
2. **Add a webhook endpoint** and copy its signing secret (`whsec_...`) from
   <https://dashboard.stripe.com/webhooks>
   - **Webhook signing secret** (`webhookSecret`) — secret; server only.
3. **Install the SDK** — only needed for the raw-client escape hatch
   (`getProviderClient()`); checkout and webhook verification work without it:
   ```sh
   npm i stripe
   ```
4. **Configure Minder.** Put the publishable key inline; reference the secrets by
   env-var name with `secret()` (never paste a raw `sk_...` / `whsec_...` here):
   ```ts
   // minder.config.ts
   import { secret } from 'minder-data-provider';

   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       stripe: {
         publishableKey: 'pk_test_your_publishable_key',
         secretKey: secret('STRIPE_SECRET_KEY'),
         webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
         // checkoutPath defaults to '/api/minder/stripe/checkout'
       },
     },
   };
   ```
5. **Mount the server routes** (or run `minder add stripe` to scaffold them) — a
   create-checkout route and a webhook route:
   ```ts
   // app/api/minder/stripe/checkout/route.ts (Next.js App Router)
   import { createCheckoutHandler } from 'minder-data-provider/providers/stripe';
   import { secret } from 'minder-data-provider';
   export const POST = createCheckoutHandler({ secretKey: secret('STRIPE_SECRET_KEY') });
   ```
   ```ts
   // app/api/minder/stripe/webhook/route.ts
   import { createStripeWebhookHandler } from 'minder-data-provider/providers/stripe';
   import { secret } from 'minder-data-provider';
   export const POST = createStripeWebhookHandler({
     webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
     async onEvent({ body }) { /* fulfil the order */ },
   });
   ```
6. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerStripeProvider } from 'minder-data-provider/providers/stripe';

   const unregister = await registerStripeProvider(); // reads providers.stripe
   // ...in a component:
   const { createCheckout } = useCheckout();
   const { url } = await createCheckout({ items, successUrl, cancelUrl });
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero keys, zero account)

Develop the entire checkout UI with no Stripe account by flipping one flag:
```ts
providers: { stripe: { mock: true } }
```
The same `useCheckout()` hook lights up against an in-memory mock: `createCheckout`
returns a deterministic `mock://stripe/checkout/<id>` URL with zero network and no
server route required. Flip `mock` back to `false` to go live — no code changes.

### Teardown / uninstall

`registerStripeProvider()` returns an `unregister()` that removes the payments
capability provider. To fully remove the provider, delete the `providers.stripe`
config block, delete the scaffolded route files, and uninstall `stripe`.

## Security

**`publishableKey` is public by design.** Stripe intends the publishable key
(`pk_...`) to ship in the browser; it can only create client-side tokens, never
move money. It is registered client-safe in this provider.

**`secretKey` and `webhookSecret` must never reach the client.** The secret key
(`sk_...`) can create charges and refunds; the webhook secret authenticates
inbound events. Both are declared `serverOnly` in this provider's manifest and
typed as `CredentialInput`, so a raw `sk_...` / `whsec_...` string placed in
client-reachable config is rejected by Minder's config validation (it names the
exact key and refuses to run). They are resolved **per-request, server-side only**
(`resolveCredential`), inside `createCheckoutHandler` / `createStripeWebhookHandler`
— the browser only ever sees the publishable key.

**Masked upstream errors.** When Stripe's API rejects a checkout request, the
handler returns a 502 that passes Stripe's own `error.message` through but NEVER
includes your secret key — the key appears in no response body and no log.

**PCI note.** MDP never touches card data. Stripe Checkout is a Stripe-hosted
page; buyers enter card details on Stripe's domain, keeping your app out of PCI
scope. No error thrown by this adapter echoes any configured secret value.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `publishableKey` | Dashboard → Developers → API keys → Publishable key | Yes (public) | inline in config |
| `secretKey` | Dashboard → Developers → API keys → Secret key | **No — server only** | `secret('STRIPE_SECRET_KEY')`, resolved server-side |
| `webhookSecret` | Dashboard → Developers → Webhooks → (endpoint) → Signing secret | **No — server only** | `secret('STRIPE_WEBHOOK_SECRET')`, resolved server-side |

Get API keys at <https://dashboard.stripe.com/apikeys> and the webhook signing
secret at <https://dashboard.stripe.com/webhooks>.

**Test vs. live keys.** Stripe issues separate keys per mode: test keys
(`pk_test_...` / `sk_test_...`) and live keys (`pk_live_...` / `sk_live_...`).
Develop against test keys (or `mock: true`); swap in live keys — via the same
env-var names — only in production. Never commit either.

**Rotation.** Roll the secret key from the API keys page and the webhook secret
from the webhook endpoint page. After rotating, update the corresponding server
environment variable (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`) — no client
redeploy is required, since both are resolved server-side. Stripe lets you expire
the old secret key immediately or after a short overlap window.

**Teardown.** Remove the `providers.stripe` config block, delete the scaffolded
route files, and unset the `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env vars
to fully revoke this app's use of the keys.
