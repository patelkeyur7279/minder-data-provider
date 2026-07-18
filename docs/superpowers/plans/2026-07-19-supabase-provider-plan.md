# Supabase Provider (Plan B — wave ②) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Orchestrator validates diffs, runs the full gate, commits per task.

**Goal:** First real provider through the full gauntlet: manifest → adapter (auth/storage/live contracts) → scaffold via `minder add supabase` → mock → example → 10-point certification → first Certified catalog entry.

**Architecture:** Self-contained certifiable dir `providers/supabase/` (manifest.json, README, LICENSE, example.ts, mock.ts, src/index.ts, provider.test.ts). Adapter lazy-loads `@supabase/supabase-js` (OPTIONAL peer, never bundled; injectable client factory for tests — no new devDependency). Registers capability providers for auth/storage/live; `getProviderClient()` returns the raw Supabase client. `mock: true` config registers the in-memory mock instead (zero SDK, zero keys). Build: tsup entry → `minder-data-provider/providers/supabase` subpath.

**Key security design point:** Supabase's `anonKey` is *intentionally public*, but its name matches SUSPICIOUS_KEY — the providers.* walker would false-positive it. S-01 adds `registerClientSafeProviderKeys(provider, keys)` to validateConfig (an explicit, manifest-aligned allowlist: `['url','anonKey']` for supabase); `serviceRoleKey` stays serverOnly (raw string in browser config = hard fail; `secret('SUPABASE_SERVICE_ROLE_KEY')` required).

| Wave | Task | Model | Files (exclusive lock) |
|---|---|---|---|
| 1 | S-01 adapter + certifiable dir + clientSafe allowlist | opus | providers/supabase/**, src/config/validateConfig.ts, tests additions |
| 1 | S-02 packaging + CLI add supabase (experimental-gated) | sonnet | package.json, tsup.config.ts, src/cli/index.cjs, tests/cli-minder.test.ts |
| 2 | S-03 example page (mock mode) + certification run + Certified flip + catalog/support-matrix/changelog | sonnet | examples/nextjs-app/**, scripts/generate-catalog.js (CERTIFIED const), docs/providers/CATALOG.md, docs/product/SUPPORT_MATRIX.md |

Acceptance highlights: S-01 — all three contracts pass against injected fake client; mock passes the same contract test suite (parity); no secret in any error (sentinel); `certify-provider providers/supabase` ≥9/10 (example check may pend S-03). S-02 — `minder add supabase` scaffolds config snippet + .env.example entries with "experimental until certified" notice; pack ships the new entry; exports map validated. S-03 — example builds + renders mock-Supabase page in CI leg; 10/10 certification; catalog shows Supabase as Certified; SUPPORT_MATRIX honest update.
