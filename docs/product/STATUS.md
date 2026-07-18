# Project Status — updated 2026-07-18 (evening)

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

**Wave 3 (dispatched):** M0-04 memoize returns (opus), M0-05 rawUrl + config unification (opus),
M0-06 packaging (sonnet). Orchestration lesson recorded: a Wave-2 agent used git stash despite
rules — future waves get worktree isolation for any agent whose task overlaps shared files.

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
