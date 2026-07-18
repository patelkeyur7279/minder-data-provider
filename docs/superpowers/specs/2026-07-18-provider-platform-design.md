# MDP Provider Platform — Design Spec

Approved by owner 2026-07-18 (brainstorming session). Supersedes nothing; builds on
docs/product/BRIEF.md, ROADMAP.md M2, RISKS_AND_THREAT_MODEL.md.

## Requirements (owner's, as refined and accepted)

1. Frontend-developer-focused: developers own UI/design; MDP owns integration wiring.
2. Advanced features via configuration + one CLI command — zero hand-written integration code.
   (Server wiring is GENERATED, not hand-written; it must exist for security.)
3. High speed, raw-API feel, deep customizability (both already delivered by M0/M1; this spec
   must not regress them — zero cost for unused providers).
4. Most-used integrations built in: paste API keys (or reference credential files) and go.
5. Deep integration without capability loss — guaranteed by `getProviderClient()` (raw SDK
   escape hatch on every provider).
6. Custom integrations: anything not built in can be wired through the same public system.
7. Enterprise modularity: separate teams own separate provider modules of one product;
   multi-instance providers (e.g. two Stripe accounts) via named instances.
8. **Accepted additions:** capability contracts; generated types from provider schemas;
   webhook→client event bridge; provider catalog page (Certified/Community/Planned);
   per-provider mobile claims from manifests; interactive `minder init` with key-source
   deep-links; webhook local-dev guidance; mock mode; `minder doctor`.
9. **Accepted reframe:** never claim "all SDKs". Claim: "every certified provider is deeply
   integrated; any SDK can be wired through the same system."

## Integration tiers

| Tier | Who builds | Badge | Requirements |
|---|---|---|---|
| Certified | MDP core | ✅ in catalog | 10-point certification + runnable example + tests |
| Community | anyone (npm) | listed, not badged | valid manifest; certification lint self-run |
| Custom | app teams (in-repo) | n/a | same adapter API; authoring guide ships with wave ① |

Catalog page is GENERATED from manifests — honesty as product surface.

## Architecture (4 layers)

1. **Client**: existing `useMinder` + capability-contract hooks — `useAuth()`, `useCheckout()`,
   `useStorage()`, `useLive()` — stable across providers (switch Clerk↔Supabase↔Firebase by
   config only). Tree-shaken: unused providers cost zero bytes. Escape hatches at every level:
   contract hook → `getProviderClient()` (raw SDK) → `getAxiosInstance()`.
2. **Config**: one `minder.config.ts`. Provider sections: `clientSafe` values inline;
   `serverOnly` values ONLY as `secret('ENV_NAME')` refs (raw client secrets already hard-fail —
   M1-02 validateConfig + assertNoExposedSecrets). Credential model (typed union):
   - `EnvSecret` — `secret('NAME')`, resolved server-side via existing `resolveSecret()`.
   - `ServerConfigValue` — supplied by the consuming app's server config.
   - `FileRef` — credential files (Firebase service-account JSON): server-side resolution only
     (path or env-encoded), never uploaded/parsed/stored/returned client-side; schema validated
     without logging contents; masked health results only. Ships with wave ④ (Firebase), typed
     in the union from day one.
3. **Server handler core** (new, edge-safe by rule: no require(), no Node-only APIs):
   handlers are web-standard `(Request, ctx) => Response`. Native on Next.js App Router,
   Vercel, Cloudflare Workers, Deno, Bun; thin adapter for Express/self-hosted Node. Includes:
   webhook signature verification (HMAC + timestamp tolerance), token/session exchange,
   provider server actions (e.g. create-checkout-session). Webhook events optionally bridge to
   client subscriptions (`useLive`) via the cache layer. Mobile (RN/Expo) consumes these
   endpoints; per-provider mobile support declared in manifests, shown in catalog.
4. **Scaffolds (hybrid model — owner-selected)**: provider logic lives in versioned MDP
   packages; `minder add <provider>` generates THIN, VISIBLE route files calling library
   handlers, patches config, appends `.env.example`, prints dashboard deep-links for obtaining
   keys. Upgrades come from npm; routes remain auditable/customizable.

## Mock mode

Every certified provider ships a config-flag mock (`providers: { stripe: { mock: true } }`)
built on the M1-05 testing harness: full UI development with zero keys/accounts; flip the flag
at integration time. Mock fidelity is part of certification.

## Wave order (each gated by certification, shipped + announced individually)

① Foundation (this spec's implementation plan) → ② Supabase → ③ Stripe → ④ Clerk →
⑤ Firebase (activates FileRef) → ⑥ Razorpay + Sentry (Sentry = observability plugin on the
existing bus). Custom-provider authoring guide ships with ②.

## Security invariants (non-negotiable, inherited + extended)

- No secret ever reaches browser bundles, URLs, storage, logs, telemetry, errors, snapshots,
  docs, or git history. Client-side raw secrets hard-fail with the exact key named + fix.
- Raw resolution only in server code (`minder-data-provider/server`); no MDP-owned vault —
  integrates with the app's env/secret runtime.
- No plaintext credential ever returned by any API/debug/health surface (masked only).
- Tests: generated fake credentials only (no scanner-matching literals — 4a4f84c lesson);
  `expectNoSecretLeak` on all handler paths incl. failures + circular data; client-rejection
  of serverOnly; missing-secret errors; manifest validation; diagnostics non-leakage.
- No npm publish/release/tag/deploy without explicit owner approval.

## Non-goals

- No provider adapters in this increment (foundation only — ② begins after gate).
- No MDP-hosted services, no credential vault, no UI component library.
- No blanket claims: support matrix + catalog only reflect certified evidence.

## Decomposition

Plan A (next): Foundation — credential union + handler core + mounts + `minder` CLI
(init/add/doctor skeleton) + mock-mode plumbing + capability-contract interfaces + catalog
generator. Plans B…: one per provider, in wave order.
