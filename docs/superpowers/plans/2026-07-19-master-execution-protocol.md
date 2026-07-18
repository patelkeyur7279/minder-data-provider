# Master Execution Protocol + Wave Queue (owner-approved 2026-07-19)

> Governs every task from Plan G onward. Supersedes the per-plan "integration protocol" sections.
> Principle: NOTHING is accepted on an agent's self-report. Every change passes six validation
> stages before it may be committed; any stage can bounce the task back.

## The six-stage acceptance pipeline (per task)

| Stage | What | Pass condition | Evidence recorded |
|---|---|---|---|
| 1. Author (TDD) | Model-tiered subagent builds it test-first inside an exclusive file lock | Its own gate green + raw-facts report | agent report |
| 2. Scope review | Orchestrator diffs the tree: ONLY locked files touched, no CHANGELOG/tracker edits, no scope creep | `git status`/`git diff --stat` match the lock | diff stat |
| 3. Independent code review | A FRESH review agent (opus for security-sensitive: credentials/webhooks/auth/server handlers; sonnet otherwise) reviews the diff adversarially — correctness, security (secret leaks, boundary violations), API-contract drift, test quality (do the tests actually assert the behavior?) | Zero CONFIRMED findings (PLAUSIBLE findings get orchestrator judgment; every CONFIRMED finding is fixed and re-reviewed) | findings list + resolutions |
| 4. Functional verification | The change is EXERCISED, not just tested: browser flow for UI (real click-through, console must be clean), CLI invocation for CLI, curl for routes, fresh-tarball consumer build when packaging changed | Observed behavior matches acceptance criteria | command output / browser transcript |
| 5. Full gate | Orchestrator re-runs: `npx jest --coverage` (exit 0), `npm run type-check`, `npm run lint:check` (0 errors), `npm run build`, edge-safety + dist-interop guards; certification re-run when providers touched | All green, counts recorded | counts |
| 6. Acceptance | Commit per task (only AFTER the authoring agent's completion notification — never mid-flight); changelog entry; BACKLOG.yaml evidence line; STATUS.md per wave | committed hash | tracker |

**Bounce rules:** Stage 3/4/5 failure → task returns to the SAME authoring agent (via SendMessage)
with the findings verbatim; two failed rounds → escalate one model tier; a security finding
(secret reachable client-side, unmasked error, missing sentinel) is ALWAYS a hard bounce, never
orchestrator-patched silently. Orchestrator may fix only integration-glue (changelog, tracker,
cross-task one-liners) — anything behavioral goes back through the pipeline.

**Standing invariants checked at Stage 3 on every diff:** no scanner-shaped secret literals
(runtime-constructed only); no new `any` in touched files; rules-of-hooks clean; no non-safelisted
default request headers; no raw secret in any error/log path (sentinel present when credentials
touched); honest claims only (no "all SDKs", no unearned "Production Ready").

## Wave queue (in order; each wave = one plan doc; models per task)

| Wave | Scope | Status |
|---|---|---|
| **G** — cleanup + docs (G-01 junk sweep, G-02 README/migrations, G-03 custom-provider guide) | in flight — will be FIRST through the six-stage pipeline incl. Stage-3 review agents | authoring |
| **H** — platform certification: Expo example app + Electron example app through the fresh-tarball → build → runtime-verify → CI-leg → matrix-promotion protocol; RN/Expo/Electron move Experimental→evidence-based status (whatever the evidence supports — promotion is NOT guaranteed) | next |
| **I** — local-first data: consolidate offline×2 + websocket×3 into one engine (the audit's structural debt, done as a feature); `useMinder(route, { source: 'local' })` + background sync; works web (IndexedDB) + native (AsyncStorage/SQLite adapter) | after H |
| **J** — golden-path DX: docs restructured by Level 0–3; error-message pass (every framework error = what happened + fix + docs link); `npm create minder-app` (platform prompt: nextjs/vite/expo/electron); `minder doctor` beginner expansion | after I |
| **K** — enterprise composition: `mergeMinderConfig` (spec'd, never built) + named multi-instance providers; perf budgets in CI (core-size gate, no-preflight-header gate); React 18 + pnpm/bun CI legs; coverage ratchet | after J |
| **L** — AI provider (claude/gemini/openai/ollama behind one contract; optional peers; config-gated; mock mode) | PARKED until owner confirms |

Ship-It actions interleave whenever unblocked: owner's GitHub unblock click → push dev → first CI
runs → Next.js Confirmed promotion → naming decision (OSS-01) → release approval (owner-only).

## Evidence ledger

Every accepted task appends to BACKLOG.yaml: stage-3 reviewer verdict, stage-4 verification
transcript reference, stage-5 counts, commit hash. STATUS.md summarizes per wave. A wave is DONE
only when every task shows all six stages.
