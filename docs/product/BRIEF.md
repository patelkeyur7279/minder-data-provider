# Product Brief — minder-data-provider → Minder Integration Framework

> Status labels used throughout: **[Confirmed]** verified by code/tests/audits · **[Inferred]** reasonable but needs validation · **[Proposed]** future direction · **[Unknown]** needs research.

## Vision

Developers build their product UI and business logic. Minder handles the difficult, repetitive work of
connecting, configuring, securing, and operating third-party integrations — supplied by the developer
as approved configuration (API keys, project IDs, OAuth client details, connection strings) and wired
in through typed adapters, secure server handlers, and validated config.

**[Confirmed]** foundation that exists today: a live plugin bus with capability hooks
(`provideToken`, `onAuthRefresh`, request/response/error middleware points), a `SecretRef`
secret-safety boundary (`src/security/secrets.ts`: non-stringifiable refs,
`assertNoExposedSecrets` blocking secret-shaped values in client config, `redactSecrets`),
platform adapters for 6 targets, config validation, and a hardened auth layer (fail-closed as of
2.2.0-beta.1). **[Confirmed]** gap: no third-party provider integration (Firebase, Stripe, Supabase,
etc.) exists in the codebase today — the provider layer is new build.

## Non-Goals

- UI components, styling systems, or opinionated layouts (developers own UX). Framework-owned UI is
  limited to devtools/diagnostics surfaces.
- Hosting, deployment, or provider account provisioning — developers create their own provider
  accounts and credentials.
- Universal framework claims. Support is earned per-framework with a working example + CI evidence
  (see SUPPORT_MATRIX.md).
- Silently making security, billing, or data-retention decisions. Unsafe browser-only setups are
  rejected with a required server-boundary alternative, never worked around.
- Monetization. **[Confirmed]** decision (2026-06): OSS, free.

## Developer Personas

- **P1 — Solo React/Next.js product developer** (primary). Wants product features, not integration
  plumbing. Pain: every project re-implements auth wiring, webhook verification, payment session
  endpoints. **[Inferred]** — matches the library's positioning and its one documented user complaint
  (latency + rigidity, 2026-06); needs validation with ≥5 developer interviews (task R-02).
- **P2 — Small team lead standardizing integrations** across apps. Wants one vetted, auditable way to
  connect Stripe/Supabase/etc. with least-privilege scopes. **[Inferred]**.
- **P3 — Plugin author / OSS contributor.** Wants a stable capability API to publish a provider
  adapter. **[Proposed]** — depends on M3 plugin SDK.

## Validated pain points (evidence)

1. **[Confirmed]** Current DX is rigid: 4 concepts before first request; `rawUrl` escape hatch broken
   in provider mode; errors wrapped 2–3 layers (2026-07-18 DX audit).
2. **[Confirmed]** Perceived latency: default-on security request headers force CORS preflight on
   every cross-origin call; `retry: 3` default (2026-07-18 hot-path audit).
3. **[Confirmed]** One real user abandoned over latency + rigidity (2026-06).
4. **[Inferred]** Integration wiring (auth/payments/webhooks) is the dominant time sink for P1/P2 —
   industry-consistent but not yet validated by our own research (task R-02).

## Product principle (contract)

Developers own: UI/UX, business rules, provider accounts, credential issuance, explicit approval of
integrations and scopes. Framework owns: secure wiring, typed adapters, server handlers, webhook
verification, config validation, secret-boundary enforcement, retries/observability, testing
utilities, docs/examples/migrations. The framework must refuse (with a clear error naming the secure
alternative) any configuration that would put a private secret in a browser bundle.
