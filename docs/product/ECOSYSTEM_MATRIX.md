# Ecosystem Compatibility Matrix

MDP's stance on adjacent technologies. Evidence-based (Confirmed = from code/package.json). MDP is a
**library** — a UI→backend data layer — not a hosted service, state library, ORM, or UI framework.
Principle: depend on what is genuinely foundational; **avoid coupling** to competing or app-owned
concerns; earn provider support only through certification.

| Technology | Current relationship (Confirmed) | Recommended stance | Notes |
|---|---|---|---|
| **TanStack Query** (`@tanstack/react-query`, `query-core`) | **Core dependency (required peer)** — `package.json` peerDeps, NOT optional; used in `CacheManager`, `MinderDataProvider`, `useMinder` | **Depend** (foundational) | It *is* MDP's server-state/cache layer. Track majors (caret stops at next major). |
| **Axios** (`axios 1.13.1`) | **Core dependency (bundled default transport)** — `dependencies`; used in `ApiClient` + `minder()` default path | **Depend**; keep the `fetch`/edge escape hatch (QR-E1) | Not edge-safe → `transport:'auto'`/`'fetch'` covers edge. Supply-chain surface → Dependabot/Renovate cover it. |
| **RTK Query** | **None** (zero references, Confirmed) | **Avoid coupling** (competing data layer) | Never a runtime dep. Optional "vs RTK Query" positioning note is the most that's warranted. |
| **Prisma / Drizzle** | **None** (zero references) | **Avoid coupling** (server-side ORMs, app-owned) | MDP's `/server`·`/node` entries sit in front of any ORM-backed API; the DB layer is the app's business. |
| **Supabase** | **Provider — Certified** (auth, database, storage; optional peer `@supabase/supabase-js`; `certify-provider providers/supabase` → **10/10**) | **Integrate** (done) — maintain | clientSafe/serverOnly split enforced (serviceRole server-only). Live-E2E not in CI (documented gap). |
| **Firebase** | **Provider — Certified** (auth, database, storage; optional peer `firebase`; **10/10**) | **Integrate** (done) — maintain | `apiKey` documented as public identifier; serviceAccount server-only. Same live-E2E-not-in-CI gap. |
| **Stripe** | **Provider — Certified** (payments; `providers/stripe/` → **10/10**) | **Integrate** (done) — maintain | Secret key `serverOnly` via `secret()` + `MinderHandler`; publishable key clientSafe. |
| **Razorpay** | **Provider — Certified** (payments; `providers/razorpay/` → **10/10**) | **Integrate** (done) — maintain | key_secret `serverOnly`; key_id clientSafe. Second payment gateway → payments is a validated category, not a one-off. |
| **Sentry** | **Provider — Certified** (analytics/observability; `providers/sentry/` → **10/10**) | **Integrate** (done) — maintain | DSN documented as publishable; server auth token `serverOnly`. |
| **Clerk** | **Provider — Certified** (auth; `providers/clerk/` → **10/10**) | **Integrate** (done) — maintain | Secret key `serverOnly`; publishable key clientSafe. |
| **Any other SDK (known or unknown)** | **Supported via the Custom-provider tier** — `registerCapabilityProvider` / `registerMockProvider` / `getProviderConfig` / `secret()` / `MinderHandler`; runnable ref `examples/custom-provider/acme-provider.ts` + tests | **Self-serve** (no MDP code needed) | Same public API as certified providers; lives in the user's own app. This is the "few configurations to adopt any SDK" promise, made concrete (docs/providers/CUSTOM.md). |
| **AI layer** (Claude / Gemini / ChatGPT / local) | **Not present** (0 references in `src/`, Confirmed) | **Deferred by explicit direction** ("not focus on AI integration layer for now") | If ever built: must be opt-in/config-gated, never a hard dependency. No claim until it exists + is certified. |
| **Zustand / Jotai / Recoil** | **None** (zero references) | **Coexist**; optional adapters only on validated demand | Client state ≠ MDP's server state — naturally complementary, no code needed. Would need new (non-provider) certification criteria if ever adapted. |
| **Tailwind CSS** | **UI-agnostic / irrelevant** (zero CSS in `src/`; BRIEF non-goal; scaffold ships no CSS) | **Avoid coupling** — stay styling-agnostic | MDP's value is staying out of the UI layer. Any CSS stack works unmodified. |
| **Redux Toolkit / react-redux** | **Removed (v3.0)** — was optional peer for dead-weight per-route slices | **Unsupported / avoid** | Removed 2026-07-19 (this task). See CHANGELOG 3.0 + MIGRATION_GUIDE v2.x→v3.0. Apps still using Redux keep it as their own direct dep. |

## Prioritized recommendations

1. **TanStack Query + Axios** — correctly foundational; no change. Continue Renovate/Dependabot tracking.
2. **6 certified providers** (Supabase, Firebase, Clerk = auth/db/storage; Stripe, Razorpay = payments; Sentry = analytics/observability) — all pass `certify:provider` **10/10** (verified 2026-07-19). Maintenance-mode; only known gap is live-credential E2E out of CI (accepted, documented — not a defect). This already delivers the "deeply integrated with necessary SDKs" ask (Firebase / payment gateways / Sentry).
3. **Any other SDK** — covered by the **Custom-provider tier** (same public API, lives in the user's app, zero MDP code). This is the "integrate unknown/known SDKs with a few configurations" ask. Grow the *Certified* set only on validated demand, following the 10-point checklist.
4. **RTK Query, Prisma, Drizzle, Zustand, Jotai, Recoil, Tailwind** — zero coupling today, which already matches the target. **Do not build integrations without validated developer demand.** Documentation alone suffices if a positioning question arises.
5. **AI layer** — deliberately deferred ("not focus for now"); if built later it must be opt-in/config-gated, never a hard dependency.
6. **Redux** — removed; the stance is now "unsupported/avoid." No further action beyond the migration note.

**Provider certification reminder:** a "provider" adapts a third-party *service* SDK (auth/db/payments/observability) and must pass the 10-point gate (`RISKS_AND_THREAT_MODEL.md` / `docs/providers/CERTIFICATION.md`) before any support claim. ORMs (Prisma/Drizzle), state libraries (Redux/Zustand/…), and UI frameworks (Tailwind) are **not** provider categories.
