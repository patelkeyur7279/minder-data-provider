# Project Status — updated 2026-07-19

**STANDING OWNER AUTHORIZATION (2026-07-19):** continue the development cycle through all
remaining roadmap tasks WITHOUT further owner interaction — wave order: Supabase (in flight) →
Stripe → Clerk → Firebase → Razorpay + Sentry, plus tracked backlog items. Boundaries that
still require the owner: npm publish/release/tag/deploy (spec rule), and the GitHub
secret-scanning unblock click (pushes blocked until then; work continues locally).

**PROVIDER PLATFORM FOUNDATION (Plan A) COMPLETE** — spec docs/superpowers/specs/2026-07-18-provider-platform-design.md,
plan docs/superpowers/plans/2026-07-18-provider-foundation-plan.md, all 7 tasks verified across 2
waves (commits d96b9fe F-01, 158257f F-02, b6f171e F-03, 40cea67 F-06, 188e6bd F-04, dc32f75 F-05,
ea8c5c8 F-07). Final gate: 109 suites / 1909 tests / 0 failed with coverage, tsc clean, lint 0
errors, build OK, edge-safety + dist-interop guards green, webhook crypto spot-reviewed
(crypto.subtle.verify only). Known gap tracked as F-08 (providers config propagation) — required
before wave ② Supabase. Next: F-08 + Plan B (Supabase provider) against the certification gate.
STILL PENDING OWNER: GitHub secret-scanning unblock click, then push dev (~30 waiting commits).



**Current milestone:** M0 in progress — **Wave 1 of 3 verified** (M0-01, M0-02, M0-09, M0-10).
Subagent execution per docs/superpowers/plans/2026-07-18-m0-execution-plan.md
(model-tiered: haiku/sonnet/opus; orchestrator validates every diff + re-runs verification).

**Wave 1 evidence:** jest --coverage exit 0 (88 suites / 1611 tests, 0 failed), tsc clean, lint
0 errors, build OK, CI YAML valid. Commits f2a3bdd (M0-01), f1e626b (M0-02), 1cf2570 (M0-09),
39c1d87 (M0-10). Preflight tax is GONE: default request headers are Content-Type+Accept only,
withCredentials opt-in; retry default 1.

**Wave 2 VERIFIED** (commits b9f32ff M0-03, 4c27a60 M0-07, a6925eb M0-08, 9dc62b6 lint gate):
Rules-of-Hooks fixed (+ 2 extra conditional-context sites the new eslint react-hooks gate caught;
fixed via non-throwing useMinderContextSafe), debug-log secret redaction (incl. a second
previously-unknown Authorization-header leak in the refresh path), event-driven offline hooks.
Evidence: jest --coverage exit 0 (91 suites / 1636 tests / 0 failed), tsc clean, lint 0 errors
with rules-of-hooks=error, build OK, offline tests stress-run 8× stable.

**Wave 3 VERIFIED — ALL TEN M0 TASKS COMPLETE** (commits edaad9d M0-04, 19df1c1 M0-05,
1fab2ed M0-06, 75250e8 changelog). Final gate: jest --coverage exit 0 (93 suites / 1653 tests /
0 failed), tsc clean, lint 0 errors (rules-of-hooks enforced), build OK. Packaging: packed size
928kB → 252kB (-73%), core.mjs 4K — M0's <80KB core gate passed. Orchestrator-applied
integrations: infrastructure.test.ts flipped to assert peerDeps; rawUrl/method threaded through
useMinder's two request call sites.

**M0 milestone: ALL GATES PASS — CLOSED (engineering).** Latency demo completed 2026-07-18:
real-browser measurement, 60 cross-origin GETs per mode — OLD defaults median 0.8ms (every GET
paired with an OPTIONS 204 preflight, verified in the network log), NEW defaults median 0.4ms,
zero preflights. Structural 2.00×; real networks add a full RTT per request. Coverage CI-gated ✅,
bundle gate ✅ (core.mjs 4K). Outstanding: owner decisions only (SEC-01+M0 branch disposition,
R-01 evolve-in-place confirmation).

**M1 Wave 1 VERIFIED** (commits 07f7910 M1-01, 1bee075 M1-02, 52edc13 M1-04, 837ef96 M1-06):
zero-config calls + error.raw + axios escape hatch; config validation + serverOnly boundary +
.env.example generator; ProviderManifest + 10-point certification lint; runnable Next.js example
app + CI leg. Gate: 98 suites / 1730 tests / 0 failed, example rebuilt green from fresh pack.
Example app surfaced defect → new task M1-07 (Redux imported unconditionally despite optional
peer label). Next.js promotion to Confirmed awaits first green CI run of example-nextjs.yml.

**M1 Wave 2 VERIFIED** (commits 83f24e1 M1-03, 949c5ea M1-05, aa64423 M1-07): mutating plugin
middleware + 3 capability hooks emitted; /testing subpath harness; Redux truly optional (example
builds WITHOUT react-redux installed). Gate: 101 suites / 1765 tests / 0 failed, tsc clean,
lint 0 errors, build OK.

**BLOCKER RESOLVED** (commit dabd92d): HttpMethod-undefined client crash root-caused (lazy
enums-chunk init thunk + sideEffects:false → webpack skips initialization on bare re-exports;
Node/SSR unaffected as they run the full graph). Fix: eager const bindings in public entries.
Proof: controlled experiment (guard fails on broken build, 15/15 on fixed) + real-browser render
of the example app with zero console errors. Debug agent was killed mid-task by a session limit;
orchestrator completed the validation half inline.

**M1 ENGINEERING COMPLETE.** All gates: 1780 tests / 0 failed, tsc clean, lint 0 errors,
build OK, example app browser-verified. Remaining for M1 closure: push dev + first green run of
example-nextjs.yml CI (then promote Next.js to Confirmed in SUPPORT_MATRIX.md). Then M2:
Supabase + Stripe providers against the certification gate.
Orchestration lesson recorded: shared-tree parallel agents worked but two incidents (git stash,
npm install churn) — use worktree isolation for overlapping-file waves in M1.

## Completed, with evidence

| Work | Evidence |
|---|---|
| Full 5-dimension codebase audit (architecture, tech debt, security, testing/CI, packaging) | Session 2026-07-18; findings distilled into BACKLOG.yaml + RISKS_AND_THREAT_MODEL.md |
| Perf + DX root-cause audit ("laggy/rigid" complaints) | Hot-path + React-layer agent reports; memory file `minder-perf-root-causes` |
| SEC-01: fail-closed auth + safe CORS defaults | Branch `fix/fail-closed-auth-and-cors-default`, 8 commits, 86 suites / 1592 tests green, plan doc with ticked verification checklist |
| Product foundation artifacts (this directory) | BRIEF, SUPPORT_MATRIX, RISKS_AND_THREAT_MODEL, ROADMAP, BACKLOG |

## Open blockers (decisions needed from owner)

1. **SEC-01 branch disposition** — push + PR to main, or merge locally. Unblocks: M0 work stacking on it.
2. **R-01: evolve-in-place vs greenfield monorepo** — recommendation: evolve in place, split packages at M2. Unblocks: M2 planning detail.

## Next exact task

M0-01 (remove preflight-forcing request headers) — smallest change, largest measured impact.
Execute via a written plan (superpowers:writing-plans) + TDD, same protocol as SEC-01.

## Assumptions awaiting validation

- Personas P1/P2 and provider priority order (Supabase → Stripe) are **Inferred** — task R-02.
- "Core bundle <80KB after M0-06" is an estimate from the packaging audit's splitting analysis, not yet measured.

## Security-sensitive areas (touch with review)

`src/core/ApiClient.ts` (headers/interceptors), `src/core/AuthManager.ts` + `src/auth/*`,
`src/security/secrets.ts`, `src/core/ProxyManager.ts` (generated code), future `@minder/server`.

## Handoff note for a fresh session

Read this file + BACKLOG.yaml + ROADMAP.md first; memory files `minder-data-provider-direction`,
`minder-perf-root-causes` carry the compressed history. Branch `fix/fail-closed-auth-and-cors-default`
contains SEC-01 + these docs, unpushed. Working protocol: plan file → TDD → full verification
(jest, tsc, lint, build) → code review → changelog/migration notes → update this tracker.
