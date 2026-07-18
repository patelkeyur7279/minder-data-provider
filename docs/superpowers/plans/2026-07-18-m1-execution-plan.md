# M1 "Secure Integration Foundation" — Subagent Execution Plan

> Same orchestration protocol as M0 (docs/superpowers/plans/2026-07-18-m0-execution-plan.md):
> model-tiered subagents, orchestrator validates every diff + re-runs the full gate
> (jest --coverage, tsc, lint, build) between waves, writes CHANGELOG, commits per-task on `dev`.
> Subagents: no git mutations, no CHANGELOG edits, only listed files.
> New rule from M0 lessons: tasks whose file sets overlap NEVER run in the same wave.

## Waves

| Wave | Task | Model | Files (exclusive lock) |
|---|---|---|---|
| 1 | M1-01 zero-config calls + error.raw + axios escape hatch | **opus** | src/hooks/useMinder.ts, src/core/ApiClient.ts, src/core/minder.ts, src/errors/*, tests |
| 1 | M1-02 config validation + env schema + SecretRef boundary + .env.example gen | **sonnet** | src/config/*, src/security/secrets.ts, scripts/generate-env-example.js (new), tests |
| 1 | M1-04 provider manifest schema + certification lint | **sonnet** | src/plugins/manifest.ts (new), scripts/certify-provider.js (new), docs/providers/CERTIFICATION.md (new), tests |
| 1 | M1-06 runnable Next.js example app + CI leg | **sonnet** | examples/nextjs-app/** (new), .github/workflows/example-nextjs.yml (new) |
| 2 | M1-03 mutating plugin middleware + emit onUpload/onSync/onConnectivityChange | **opus** | src/plugins/PluginSystem.ts, src/core/ApiClient.ts, src/core/minder.ts, src/upload/MediaUploadManager.ts, src/platform/offline/OfflineManager.ts, tests |
| 2 | M1-05 testing harness (provider mocks, contract tests, secret-leak helpers) | **sonnet** | src/testing/** (new), exports map addition, tests |

Sequencing: M1-03 waits for M1-01 (both touch ApiClient/minder). M1-05 waits for M1-04
(consumes the manifest schema). M1-06's example app consumes the PUBLISHED-shape package via
`npm pack` of the working tree — it must not import src/ directly.

## Acceptance criteria (orchestrator-validated)

- **M1-01**: (a) `useMinder('https://api.example.com/users')` works with ZERO setup — no provider,
  no configureMinder (the config-missing throw is skipped for absolute URLs); (b) with only
  `configureMinder({ apiUrl })`, `useMinder('/users')` works (no routes registry); (c) every error
  surface (MinderResult.error, thrown MinderError, standalone path) exposes `.raw` carrying the
  original AxiosError/Error; (d) public accessor for the axios instance: `ApiClient.getAxiosInstance()`
  + a documented way to reach it from the hook/context; (e) tests for a-d; existing suites green.
- **M1-02**: config validated against a schema with exact-key error messages; secret-shaped values
  in client config still hard-fail (existing assertNoExposedSecrets) and NEW: a `serverOnly` key
  list on config sections is enforced (client entry importing a serverOnly key → thrown error
  naming the key and the fix); `node scripts/generate-env-example.js` emits .env.example with
  placeholders from the schema; tests for all.
- **M1-04**: a ProviderManifest type + JSON schema (name, capabilities, clientSafe/serverOnly
  config keys, scopes, runtimes, peerDeps); `node scripts/certify-provider.js <dir>` validates a
  provider package against the 10-point checklist (manifest valid, README sections present, mock
  present, etc.) with per-point pass/fail output; a fixture provider in tests proves both pass and
  fail paths.
- **M1-06**: examples/nextjs-app builds against the packed tarball (`npm pack` → file: install) and
  renders a page exercising useMinder (mocked API route inside the app); CI workflow runs the
  build (not dev server) on PRs touching src/ or the example; support matrix promotion to
  Confirmed happens only after this runs green in actual CI.
- **M1-03**: plugins gain a middleware capability: `onRequestIntercept(config) => config|Response`
  (mutate or short-circuit) with deterministic ordering and per-plugin error isolation;
  `onUpload`, `onSync`, `onConnectivityChange` actually emitted by MediaUploadManager /
  OfflineManager sync / connectivity transitions; tests prove mutation, short-circuit, ordering,
  and all three emissions.
- **M1-05**: `minder-data-provider/testing` subpath exports: `createMockProvider()`,
  `mockApiClient()`, contract-test helper that replays recorded fixtures against an adapter, and
  `expectNoSecretLeak(fn)` asserting no secret-shaped values reach logs/network mocks; harness
  itself tested; exports map + build entry added and verified.

## Integration protocol per wave
Identical to M0: diff-scope review → full gate → changelog → per-task commits → BACKLOG/STATUS
update → next wave. Escalation: two failed attempts → one model tier up.
