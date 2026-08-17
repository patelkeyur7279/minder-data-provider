# M0 "Trustworthy Core" — Subagent Execution Plan

> Orchestration: main agent (Fable) dispatches, validates every diff against acceptance criteria,
> runs integration verification (full jest + tsc + lint + build) between waves, writes CHANGELOG
> entries at integration time, and commits per-task. Subagents NEVER run git commands, never touch
> CHANGELOG.md, and only modify their listed files. Model tier is chosen by task complexity.
> Tracking: BACKLOG.yaml is the state; STATUS.md updated after each wave.

## Wave structure (by file-conflict analysis)

| Wave | Task | Model | Files (exclusive lock) |
|---|---|---|---|
| 1 | M0-01 security headers + withCredentials | **sonnet** | src/core/ApiClient.ts, src/core/types.ts, tests/security-headers-default.test.ts (new), existing header tests |
| 1 | M0-02 retry default 3→1 | **haiku** | src/core/MinderDataProvider.tsx, tests touching retry defaults |
| 1 | M0-09 CI coverage gate + typecheck | **haiku** | .github/workflows/ci.yml, package.json (jest.coverageThreshold only) |
| 1 | M0-10 repo hygiene + docs fixes | **haiku** | root scratch files, .gitignore, README.md, SECURITY.md, CODE_OF_CONDUCT.md (new), CONTRIBUTING.md |
| 2 | M0-03 Rules-of-Hooks fix | **opus** | src/hooks/useMinder.ts (+ new tests) |
| 2 | M0-08 event-driven useOffline | **sonnet** | src/platform/offline/useOffline.ts (+ tests) |
| 2 | M0-07 log redaction + httpOnly claim + un-skip cookie tests | **sonnet** | src/core/ApiClient.ts (after M0-01 lands), src/auth/SecureAuthManager.ts, tests/auth-security-audit.test.tsx |
| 3 | M0-04 memoize returns + upload identity (after M0-03) | **opus** | src/hooks/useMinder.ts |
| 3 | M0-05 rawUrl in provider mode + unify dual configs | **opus** | src/core/ApiClient.ts, src/core/minder.ts, src/config/index.ts |
| 3 | M0-06 packaging (peerDeps, exports, sideEffects, splitting, lockfile) | **sonnet** | package.json, tsup.config.ts, lockfiles |

Sequencing rules: ApiClient.ts is locked by M0-01 (wave 1) then M0-07 (wave 2) then M0-05 (wave 3).
useMinder.ts locked by M0-03 then M0-04. CHANGELOG.md is orchestrator-only.

## Per-task acceptance (validation the orchestrator performs on each returned diff)

- **M0-01**: default axios instance headers are exactly Content-Type + Accept; no CSP/X-Frame/etc. on
  requests; `withCredentials` false unless config opts in (new typed option); `getSecurityHeaders`
  still exported with JSDoc marking them response-side; tests prove all three; no unrelated hunks.
- **M0-02**: retry default 1 in both provider locations; test asserts default and per-call override.
- **M0-09**: ci.yml runs type-check on dev pushes; test step runs with --coverage; thresholds set to
  (actual − 2pts) so the gate passes today and ratchets later; CI yaml parses.
- **M0-10**: 9 scratch artifacts deleted (AUDIT_COMPLETE.md, CRITICAL_BUGS_AUDIT.md,
  FINAL_VERIFICATION.md, RELEASE_v2.1.1.md, BUNDLE_ANALYSIS.json, test-baseline.txt,
  test-after-react-fix.txt, minder-data-provider-2.0.3.tgz, verify-end-user-scenarios.js —
  verify-end-user-scenarios moves to scripts/ only if referenced anywhere, else delete);
  .gitignore covers *.tgz + BUNDLE_ANALYSIS.json + coverage/; README quickstart matches the real
  config key (verify against src/core/types.ts before editing); SECURITY.md gains a real reporting
  channel (GitHub Security Advisories URL) + 2.2.x row; CODE_OF_CONDUCT.md exists (Contributor
  Covenant 2.1, contact = repo Security Advisories page); CONTRIBUTING.md no longer references a
  nonexistent format script or wrong Discord.
- **M0-03**: all hooks called unconditionally in stable order (validation early-return becomes a
  post-hooks result branch; infinite vs regular query both instantiated or restructured legally;
  CRUD mutations unconditional); eslint react-hooks/rules-of-hooks clean on the file; new regression
  test flips route validity between renders without hook-order crash.
- **M0-08**: no setInterval polling; subscribes to OfflineManager events/callbacks; setState guarded
  by equality; unmount cleanup proven by test.
- **M0-07**: debug/network logs pass bodies+params through redactSecrets; SecureAuthManager header
  docs match real capability (no false httpOnly claim); the 2 skipped cookie-security tests enabled
  and passing.
- **M0-04**: return object + all callbacks referentially stable across unrelated re-renders
  (render-count test with React Profiler or ref-equality assertions); upload progress updates only
  re-render upload subscribers.
- **M0-05**: `useMinder('https://…')` and `{rawUrl:true}` work in provider mode (ApiClient gets a
  raw-request branch); single global config (minder.config merged into configureMinder;
  deprecation alias kept); standalone mode resolves the routes registry.
- **M0-06**: react-redux/@reduxjs/toolkit/@tanstack/* moved to peerDependencies (+ peerDependenciesMeta
  optional where applicable); dead ./core/* + ./hooks/* export wildcards removed; ./hook export added
  or hook entry dropped (check hook-entry-shim.test.ts first); "sideEffects": false; tsup splitting
  enabled with platform bundles sharing chunks; one lockfile + packageManager field; npm pack
  dry-run reviewed; install + build + full suite green in a fresh `npm ci`.

## Integration protocol per wave

1. All wave agents complete → orchestrator reviews `git diff` per task scope (no cross-file bleed).
2. Full verification: `npx jest`, `npm run type-check`, `npm run lint:check`, `npm run build`.
3. Orchestrator writes CHANGELOG entries, commits per-task (logical commits), updates BACKLOG.yaml
   statuses + STATUS.md, then dispatches the next wave.
4. Any acceptance failure → task returns to the SAME agent tier with the failure evidence, or
   escalates one tier (haiku→sonnet→opus) after two failed attempts.

## Context safety

Each wave is independently resumable: if the session ends, a fresh session reads STATUS.md +
BACKLOG.yaml + this plan and continues from the last completed wave. Subagent prompts are
self-contained (no conversation dependency).
