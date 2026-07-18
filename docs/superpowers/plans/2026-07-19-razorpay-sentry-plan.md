# Razorpay + Sentry Providers (Plan F — wave ⑥, final) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same protocol. Two providers, related patterns, so one plan.

## Razorpay (payments — rides on Stripe's patterns)

**Architecture:** `providers/razorpay/` mirroring Stripe. Zero-dep server core: order creation via `fetch` to `https://api.razorpay.com/v1/orders` (Basic auth: keyId:keySecret base64). PaymentsContract.createCheckout → creates an order server-side, returns the order + keyId for the client Razorpay Checkout widget. Webhook verification via the F-02 HMAC primitive (Razorpay uses `x-razorpay-signature`, hex HMAC-SHA256 over the raw body — NO timestamp, so `timestampToleranceSec: 0` / no parser needed; simplest webhook case). `keyId` clientSafe, `keySecret` + `webhookSecret` serverOnly. Mock PaymentsContract. Optional peer `razorpay`. Runtimes web/node/edge; frameworks react/nextjs/vite.

## Sentry (observability — a PLUGIN, not a capability contract)

**Architecture:** `providers/sentry/` — DIFFERENT shape: Sentry is error tracking, so it registers a **MinderPlugin** on the existing plugin bus (onError/onRequest/onResponse observability hooks — already live since M1-03), NOT a capability contract. `registerSentryProvider({ dsn, mock? })` → creates a plugin that forwards MDP errors/requests to Sentry via `@sentry/browser` (optional peer, lazy) or, in mock mode, records events in-memory. DSN is clientSafe (Sentry DSNs are public by design — document this as another "public despite looking secret" case, like Firebase apiKey). No serverOnly credential for the client SDK (server-side Sentry uses the same DSN). Mock plugin. Manifest categories ['analytics']; capabilities note it's plugin-based. Runtimes web/node/edge; frameworks react/nextjs/vite (+ note: works anywhere the plugin bus runs).

| Wave | Task | Model | Files |
|---|---|---|---|
| 1 | F-R1 Razorpay provider (server order handler + webhook + PaymentsContract + mock + manifest/docs + tests) | opus | providers/razorpay/**, tests additions |
| 1 | F-S1 Sentry provider (MinderPlugin forwarding onError/onRequest + mock + manifest/docs + tests) | sonnet | providers/sentry/**, tests additions |
| 2 | F-P2 packaging + CLI for BOTH (entries, exports, optional peers razorpay + @sentry/browser, minder add razorpay/sentry, dist-entry) | sonnet | package.json, tsup.config.ts, src/cli/index.cjs, tests/cli-minder.test.ts, tests/dist-entry-exports.test.ts |
| 3 | F-E3 examples (mock) for both + fresh-tarball proof + certification + Certified flip (both) + catalog (PLANNED now empty) + matrix | sonnet | examples/nextjs-app/**, scripts/generate-catalog.js, docs/providers/CATALOG.md, docs/product/SUPPORT_MATRIX.md, tests/generate-catalog.test.ts |

**Acceptance:** each certifies 10/10; secret-sentinel (Razorpay keySecret; Sentry has none but assert no MDP-internal data over-forwarded in mock); DSN-is-public + keyId-is-public documented+tested; browser-verified mock flows; PLANNED table becomes EMPTY after F-E3 — the milestone marker. Sentry plugin: assert onError forwards to the mock sink with a test that fires an ApiClient error and checks the sink recorded it.

**Milestone note:** after F-E3, all 6 roadmap providers are Certified; catalog Planned column is empty. This closes the provider-platform roadmap's initial wave — the point to produce the consolidated completion report.
