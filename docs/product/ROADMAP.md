# Roadmap

> Principle: **do not build providers on a defective foundation.** M0 pays down the verified defects
> first; provider work starts only when M0's gates pass. Architecture evolves in place — no
> big-bang rewrite (solo maintainer, existing users). Monorepo split happens at M2 boundary when
> the first provider package forces the question.

## M0 — Trustworthy core (target: ~2-3 weeks part-time)

Fixes every Confirmed defect from the 2026-07-18 audits.

- Speed: remove security request headers (preflight tax), `withCredentials` opt-in, retry default 1,
  memoize hook returns, decouple upload identity, event-driven `useOffline`.
- Correctness: fix Rules-of-Hooks in `useMinder`; fix `rawUrl` in provider mode; unify the dual
  global configs.
- Packaging: peer-deps move (react-redux, @reduxjs/toolkit, @tanstack/*), remove dead exports,
  `sideEffects: false` + code splitting, single lockfile + `packageManager`.
- Security debt: redact debug logs (S-03), correct SecureAuthManager httpOnly claim (S-02),
  un-skip cookie-security tests.
- Already done on branch `fix/fail-closed-auth-and-cors-default`: fail-closed auth, safe CORS
  defaults **[Confirmed, unmerged]**.

**Gate:** full suite green; coverage regenerated + CI-gated; bundle core < 80KB; a before/after
latency demo for the preflight fix.

## M1 — Secure integration foundation (target: +3-4 weeks)

- Zero-config calls (`useMinder('/users')`, no registry required) + `error.raw` + axios-instance
  escape hatch — kills the "rigid" complaint.
- Config validation with env-var schema + `SecretRef` boundary enforcement + `.env.example`
  generation.
- Mutating middleware in the plugin bus (today: observe-only) + the three unemitted capability
  hooks. Provider manifest format (clientSafe/serverOnly keys, scopes, runtimes).
- Testing harness package-in-repo: provider mocks, contract-test utilities, secret-leak test
  helpers.
- Docs standard: every integration = minimal working example + secure production recommendation.

**Gate:** a demo "fake provider" built only on public plugin APIs passes the certification
checklist; example app for Next.js runs in CI (promotes Next.js Pages to Confirmed).

## M2 — First real providers (target: +4-6 weeks)

- **Supabase** (auth + database + storage in one SDK — covers three categories with one dependency).
- **Stripe** (server-boundary showcase: checkout session handler, webhook signature verification).
- Monorepo split decision executes here: `core` / `react` / `server` / `providers/supabase` /
  `providers/stripe` / `testing` (npm workspaces, independent versions).
- CLI v0: `npx minder init`, `minder add supabase`, `minder doctor` (env/config diagnostics).

**Gate:** both providers pass certification; example apps in CI; security review of webhook + OAuth
paths; migration guide from 2.x single-package imports (with codemod).

## M3 — Ecosystem (target: thereafter)

- Plugin authoring SDK + docs; community provider template repo; compat CI matrix (React 18/19,
  Vite leg, RN spike); Remix/React Router adapter; edge-runtime spike; expand providers strictly by
  validated demand (R-02 research).

## Version policy

2.2.x beta line carries M0. M1 ships as 2.3.0 (additive). M2's monorepo split is 3.0.0 with
migration guide + codemod — the only planned breaking release. Deprecations warn ≥1 minor before
removal. Compatibility matrix published from M1 onward.
