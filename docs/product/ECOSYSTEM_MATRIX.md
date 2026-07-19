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
| **Supabase** | **Provider — Certified** (optional peer `@supabase/supabase-js`; `providers/supabase/` 10/10) | **Integrate** (done) — maintain | clientSafe/serverOnly split enforced (serviceRole server-only). Live-E2E not in CI (documented gap). |
| **Firebase** | **Provider — Certified** (optional peer `firebase`; `providers/firebase/` 10/10) | **Integrate** (done) — maintain | `apiKey` documented as public identifier; serviceAccount server-only. Same live-E2E-not-in-CI gap. |
| **Zustand / Jotai / Recoil** | **None** (zero references) | **Coexist**; optional adapters only on validated demand | Client state ≠ MDP's server state — naturally complementary, no code needed. Would need new (non-provider) certification criteria if ever adapted. |
| **Tailwind CSS** | **UI-agnostic / irrelevant** (zero CSS in `src/`; BRIEF non-goal; scaffold ships no CSS) | **Avoid coupling** — stay styling-agnostic | MDP's value is staying out of the UI layer. Any CSS stack works unmodified. |
| **Redux Toolkit / react-redux** | **Removed (v3.0)** — was optional peer for dead-weight per-route slices | **Unsupported / avoid** | Removed 2026-07-19 (this task). See CHANGELOG 3.0 + MIGRATION_GUIDE v2.x→v3.0. Apps still using Redux keep it as their own direct dep. |

## Prioritized recommendations

1. **TanStack Query + Axios** — correctly foundational; no change. Continue Renovate/Dependabot tracking.
2. **Supabase/Firebase** — certified, maintenance-mode; only known gap is live-credential E2E out of CI (accepted, documented — not a defect).
3. **RTK Query, Prisma, Drizzle, Zustand, Jotai, Recoil, Tailwind** — zero coupling today, which already matches the target. **Do not build integrations without validated developer demand.** Documentation alone suffices if a positioning question arises.
4. **Redux** — removed; the stance is now "unsupported/avoid." No further action beyond the migration note.

**Provider certification reminder:** a "provider" adapts a third-party *service* SDK (auth/db/payments/observability) and must pass the 10-point gate (`RISKS_AND_THREAT_MODEL.md` / `docs/providers/CERTIFICATION.md`) before any support claim. ORMs (Prisma/Drizzle), state libraries (Redux/Zustand/…), and UI frameworks (Tailwind) are **not** provider categories.
