# Project Status — updated 2026-07-18

**Current milestone:** Pre-M0 (foundation planning complete; M0 execution not started)

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
