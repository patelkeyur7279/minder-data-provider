# Cloudflare Worker example (edge evidence)

This example proves `minder-data-provider` runs on real **workerd** (Cloudflare
Workers' runtime), not just that its bundle passes a static edge-safety scan.
It is the runnable evidence behind the Support Matrix's `Edge runtimes: Confirmed
(Cloudflare Workers/workerd)` row — see
[`docs/product/SUPPORT_MATRIX.md`](../../docs/product/SUPPORT_MATRIX.md) and
[`docs/EDGE.md`](../../docs/EDGE.md).

`wrangler.toml` deliberately does **not** set `compatibility_flags =
["nodejs_compat"]` — the Worker runs on bare workerd with no Node polyfills, so a
green run here means the library's edge path is genuinely edge-safe, not
Node-shimmed.

## What it proves

- **`GET /users`** — the `minder()` JSON data path, forced onto the native-fetch
  transport (the same transport `minder` auto-selects on edge runtimes by
  default). Proxies a plain-Node mock upstream (`mock-upstream.mjs`).
- **`POST /webhook`** — HMAC-SHA256 webhook signature verification via
  `minder-data-provider/server`'s `createWebhookHandler`, which uses
  `crypto.subtle` (WebCrypto) only — accepts a valid signature (200
  `{verified:true}`) and rejects a tampered one (401).

## CI-first note

This example installs `minder-data-provider` from the **packed tarball**
(`minder-data-provider-2.2.0-beta.0.tgz`, built via `npm pack` at the repo root),
not a `file:../../` workspace link like the other examples. It's intentional:
CI job `edge-worker-example` (see
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) packs and installs
the library exactly as a real consumer would, so this example's
`package.json` mirrors that for local reproducibility. If you want to develop
against your local source instead, change the dependency to `file:../../` and
re-run `npm install`.

## How to run it locally

```bash
# From the repo root, build the library and produce the tarball this example depends on:
npm run build
npm pack

# Then, from this directory:
npm install
node mock-upstream.mjs &         # mock upstream on :8788
npx wrangler dev --port 8787     # Worker on :8787 (local mode, no Cloudflare login needed)
```

In another terminal:

```bash
# Data path
curl -s http://127.0.0.1:8787/users
# => [{"id":1,"name":"Ada"}]

# Webhook: valid signature (secret is the wrangler.toml `[vars]` value "edge-smoke-secret")
BODY='{"event":"ping"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256','edge-smoke-secret').update(process.argv[1]).digest('hex'))" "$BODY")
curl -s -X POST http://127.0.0.1:8787/webhook -H "content-type: application/json" -H "x-minder-signature: $SIG" -d "$BODY"
# => {"verified":true,"body":{"event":"ping"}}

# Webhook: tampered signature → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8787/webhook -H "content-type: application/json" -H "x-minder-signature: 0000000000000000000000000000000000000000000000000000000000000000" -d "$BODY"
# => 401
```

Kill the background processes (`mock-upstream.mjs`, `wrangler dev`) when done.
