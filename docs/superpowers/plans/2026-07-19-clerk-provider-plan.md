# Clerk Provider (Plan D — wave ④) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same protocol as Plans B/C.

**Goal:** Dedicated auth provider — the "login working in 5 minutes" story. AuthContract over Clerk; publishable key is clientSafe, secret key serverOnly (used only by a server session-verify handler).

**Architecture:** `providers/clerk/` mirroring Supabase/Stripe. Client `AuthContract` wraps `@clerk/clerk-js` (optional peer, lazy) for session state; `getProviderClient()` exposes it. Server: `createClerkSessionHandler` verifies a Clerk session token server-side via `fetch` to Clerk's API (zero-dep, edge-safe) — secret key server-only. Mock AuthContract for zero-key UI. `registerClientSafeProviderKeys('clerk', ['publishableKey','mock'])`; `secretKey` serverOnly.

**Reality note (per spec — honest mobile claims):** Clerk's React Native SDK differs from web; manifest `frameworks: ['react','nextjs','vite']` only — NOT react-native (untested). Certification + catalog reflect this.

| Wave | Task | Model | Files |
|---|---|---|---|
| 1 | D-01 provider dir (AuthContract, server session-verify, mock, manifest/docs, tests) | opus | providers/clerk/**, tests additions |
| 1 | D-02 packaging + CLI (entry, export, optional peer `@clerk/clerk-js`, `minder add clerk` env+snippet, dist-entry) | sonnet | package.json, tsup.config.ts, src/cli/index.cjs, tests/cli-minder.test.ts, tests/dist-entry-exports.test.ts |
| 2 | D-03 example (mock login) + fresh-tarball proof + certification + Certified flip + catalog/matrix | sonnet | examples/nextjs-app/**, scripts/generate-catalog.js, docs/providers/CATALOG.md, docs/product/SUPPORT_MATRIX.md, tests/generate-catalog.test.ts |

Acceptance mirrors Stripe: contract + mock parity + secret-sentinel tests; certification 10/10; browser-verified mock login; honest matrix row (frameworks react/nextjs/vite; live session verify needs real keys, out of CI).
