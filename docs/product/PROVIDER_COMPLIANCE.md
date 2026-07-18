# Provider compliance — trademarks, licensing, SDK usage (S-05)

Audit date: 2026-07-19. Scope: the 6 certified providers (Supabase, Stripe, Clerk, Firebase,
Razorpay, Sentry).

## Policy

`minder-data-provider` is an **independent, unaffiliated** integration layer. Provider names are
**trademarks of their respective owners**, used here **nominatively** — solely to identify the
real services this library interoperates with. No sponsorship, endorsement, or affiliation is
claimed or implied. We ship **no** provider SDK code, credentials, or brand assets.

## How each provider SDK is used

Every provider SDK is an **optional peer dependency** (declared in `peerDependencies` with
`peerDependenciesMeta.<sdk>.optional = true` in `package.json`) and is loaded via **dynamic
`import()`** at call time — so the SDK is never bundled or vendored, and installing
`minder-data-provider` pulls in none of them unless the consumer already has them.

| Provider | Trademark owner | Our usage | SDK relationship | Dynamic import |
|---|---|---|---|---|
| **Supabase** | Supabase, Inc. | Nominative | `@supabase/supabase-js` — optional peer | `providers/supabase/src/index.ts:113` |
| **Stripe** | Stripe, Inc. | Nominative | `stripe` — optional peer | `providers/stripe/src/index.ts:100` |
| **Clerk** | Clerk, Inc. | Nominative | `@clerk/clerk-js` — optional peer | `providers/clerk/src/index.ts:125` |
| **Firebase** | Google LLC | Nominative | `firebase` — optional peer | `providers/firebase/src/index.ts:159-161` |
| **Razorpay** | Razorpay Software Pvt. Ltd. | Nominative | `razorpay` — optional peer | `providers/razorpay/src/index.ts:114` |
| **Sentry** | Functional Software, Inc. (Sentry) | Nominative | `@sentry/browser` — optional peer | `providers/sentry/src/index.ts:129` |

(`peerDependenciesMeta` marks all six `optional: true` — verified in `package.json`.)

## Findings

1. **Trademarks — clean.** No occurrence of "official", "endorsed by", "affiliated", or
   "partnership with" in `src/`, `providers/`, `docs/providers/`, or `README.md`. Provider names
   are used only to name the service being integrated (nominative fair use).
2. **SDK bundling — clean.** No provider SDK is a hard `dependency`; all six are optional peers
   and dynamically imported. Nothing is vendored or copied.
3. **Brand assets — clean.** No provider logos or SVG brand marks are embedded in `src/` or
   `providers/`.
4. **Secrets — correct.** Secret keys are server-only (`secret()`/`resolveCredential`); Firebase's
   `apiKey` is documented as a public identifier, not a secret (see `SUPPORT_MATRIX.md`).

**No compliance issues found.**

## Recommendation (one gap)

There is no explicit trademarks/independence notice yet. Add a short **NOTICE** to `README.md`
(and consider a `NOTICE` file). Suggested blurb:

> **Trademarks.** Supabase, Stripe, Clerk, Firebase, Razorpay, and Sentry are trademarks of their
> respective owners. `minder-data-provider` is an independent project, not affiliated with,
> sponsored by, or endorsed by any of them. Provider names are used only to identify the services
> this library integrates with. Each provider SDK is an optional peer dependency, loaded on demand;
> no provider code or credentials are bundled.

Also re-check each provider's brand guidelines before using logos in any future marketing site
(OSS-02/OSS-09): nominative text use is fine; logos and lockups usually have specific rules.
