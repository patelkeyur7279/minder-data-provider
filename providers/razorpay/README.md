# @minder/provider-razorpay

The Razorpay adapter for [Minder](../../README.md) — the same **server-boundary**
shape as the Stripe provider. Orders are created **on the server** (your key
secret never travels near the browser); only the public `keyId` is returned so
the client Razorpay Checkout widget can open against the order. Inbound webhooks
are verified on Minder's edge-safe HMAC primitive. On the client you use one
stable hook — `useCheckout()` — so you switch payment providers by config, not by
rewriting integration code.

- **Categories:** payments
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — untested)
- **Peer dependency:** `razorpay` `^2.9.0` (optional; only for the raw-SDK escape
  hatch via `getProviderClient()` — order creation + webhooks use `fetch`, no SDK)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Razorpay account** and get your API keys from the dashboard:
   <https://dashboard.razorpay.com/app/website-app-settings/api-keys>
   - **Key id** (`keyId`, `rzp_test_...` / `rzp_live_...`) — public (see Security).
   - **Key secret** (`keySecret`) — secret; server only.
2. **Add a webhook** and copy its signing secret from the Razorpay dashboard
   (Settings → Webhooks). Razorpay signs each webhook as a bare hex HMAC-SHA256
   of the raw request body in the `x-razorpay-signature` header (no timestamp).
   - **Webhook signing secret** (`webhookSecret`) — secret; server only.
3. **Install the SDK** — only needed for the raw-client escape hatch
   (`getProviderClient()`); order creation and webhook verification work without it:
   ```sh
   npm i razorpay
   ```
4. **Configure Minder.** Put the key id inline; reference the secrets by env-var
   name with `secret()` (never paste a raw key secret here):
   ```ts
   // minder.config.ts
   import { secret } from 'minder-data-provider';

   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       razorpay: {
         keyId: 'rzp_test_your_key_id',
         keySecret: secret('RAZORPAY_KEY_SECRET'),
         webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET'),
       },
     },
   };
   ```
5. **Mount the server routes** (or run `minder add razorpay` to scaffold them) — a
   create-order route and a webhook route:
   ```ts
   // app/api/minder/razorpay/order/route.ts (Next.js App Router)
   import { createOrderHandler } from 'minder-data-provider/providers/razorpay';
   import { secret } from 'minder-data-provider';
   export const POST = createOrderHandler({
     keyId: 'rzp_test_your_key_id',
     keySecret: secret('RAZORPAY_KEY_SECRET'),
   });
   ```
   ```ts
   // app/api/minder/razorpay/webhook/route.ts
   import { createRazorpayWebhookHandler } from 'minder-data-provider/providers/razorpay';
   import { secret } from 'minder-data-provider';
   export const POST = createRazorpayWebhookHandler({
     webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET'),
     async onEvent({ body }) { /* fulfil the order when event === 'payment.captured' */ },
   });
   ```
6. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerRazorpayProvider } from 'minder-data-provider/providers/razorpay';

   const unregister = await registerRazorpayProvider(); // reads providers.razorpay
   // ...in a component:
   const { createCheckout } = useCheckout();
   const { url } = await createCheckout({ items, successUrl, cancelUrl });
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero keys, zero account)

Develop the entire checkout UI with no Razorpay account by flipping one flag:
```ts
providers: { razorpay: { mock: true } }
```
The same `useCheckout()` hook lights up against an in-memory mock: `createCheckout`
returns a deterministic `mock://razorpay/order/order_mock_<n>` URL with zero
network and no server route required. Flip `mock` back to `false` to go live — no
code changes.

### Teardown / uninstall

`registerRazorpayProvider()` returns an `unregister()` that removes the payments
capability provider. To fully remove the provider, delete the
`providers.razorpay` config block, delete the scaffolded route files, and
uninstall `razorpay`.

## Security

**`keyId` is public by design.** Razorpay's key id (`rzp_test_...` / `rzp_live_...`)
is meant to ship in the browser — the client Checkout widget needs it, and it
cannot move money on its own. It is registered client-safe in this provider and is
returned from the order route so the widget can use it.

**`keySecret` and `webhookSecret` must never reach the client.** The key secret
authenticates order/refund calls; the webhook secret authenticates inbound events.
Both are declared `serverOnly` in this provider's manifest and typed as
`CredentialInput`, so a raw key-secret string placed in client-reachable config is
rejected by Minder's config validation (it names the exact key and refuses to
run). They are resolved **per-request, server-side only** (`resolveCredential`),
inside `createOrderHandler` / `createRazorpayWebhookHandler` — the browser only
ever sees the public key id.

**Masked upstream errors.** When Razorpay's API rejects an order, the handler
returns a 502 that passes Razorpay's own `error.description` through but NEVER
includes your key secret — the secret appears in no response body and no log.

**Webhook verification.** The `x-razorpay-signature` header is a bare hex
HMAC-SHA256 over the RAW request body — no timestamp. Verification is constant-time
(`crypto.subtle.verify`); a tampered body or wrong signature returns 401.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `keyId` | Dashboard → Settings → API Keys → Key Id | Yes (public) | inline in config |
| `keySecret` | Dashboard → Settings → API Keys → Key Secret | **No — server only** | `secret('RAZORPAY_KEY_SECRET')`, resolved server-side |
| `webhookSecret` | Dashboard → Settings → Webhooks → (endpoint) → Secret | **No — server only** | `secret('RAZORPAY_WEBHOOK_SECRET')`, resolved server-side |

Get API keys at
<https://dashboard.razorpay.com/app/website-app-settings/api-keys>.

**Test vs. live keys.** Razorpay issues separate keys per mode: test keys
(`rzp_test_...`) and live keys (`rzp_live_...`), each with its own key secret.
Develop against test keys (or `mock: true`); swap in live keys — via the same
env-var names — only in production. Never commit either.

**Rotation.** Regenerate the key secret from the API Keys page and the webhook
secret from the webhook endpoint page. After rotating, update the corresponding
server environment variable (`RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`) —
no client redeploy is required, since both are resolved server-side. Razorpay
lets you keep the old key working during a short overlap while you migrate.

**Teardown.** Remove the `providers.razorpay` config block, delete the scaffolded
route files, and unset the `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` env
vars to fully revoke this app's use of the keys.
