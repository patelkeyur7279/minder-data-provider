# Project Status — updated 2026-07-19

> **RELEASE UPDATE (2026-09-04, supersedes the "CURRENT STATE" and "Open blockers" entries
> below on the two items it names).** `minder-data-provider@2.2.0` has been **published, tagged,
> and released**: npm dist-tag `latest` is `2.2.0`, tag `v2.2.0` is on `origin`, and a
> non-prerelease GitHub Release exists (CHANGELOG.md `[2.2.0] - 2026-08-16`, with follow-up fix
> commits through `5ea1915` on 2026-09-04). This resolves two items tracked below as open:
> the **"publish/release"** owner-gated remainder in the CURRENT STATE block, and the
> **"GitHub secret-scanning unblock click"** open blocker (§ Open blockers) — the unblock
> happened and the release shipped from `main` (dev→test→main per
> `.github/BRANCH_STRATEGY.md`), with CI green on GitHub for the released commit. Remaining
> owner-gated items (OSS-01 naming, OSS-07 funding, mobile/desktop/edge on-device CI (H-05)) are
> unaffected by this update and stay open.
>
> **CURRENT STATE (2026-07-19, supersedes the milestone notes below, which are historical).**
> All 6 initial providers Certified; M0 complete; CI green on Node 20+22 (Node 18 dropped — EOL +
> webhook WebCrypto needs Node 20+). Backlog 51/61 done. Recent work (all committed locally; **NOT
> pushed** per owner — "commit locally, push later"): fixed a real server-side crash (bare
> `File`/`FileList` globals broke every `minder()` write in Node/SSR/edge — guarded + node-env
> regression test); edge-safety + RSC audits; adoption DX (`minder doctor --fix`, precise
> postinstall peer check, `init` framework auto-detect, `create-minder-app` starter, Dependabot +
> shareable Renovate preset, published COMPATIBILITY matrix); refreshed all 5 legacy examples to
> current API/deps (web + nodejs fully verified; electron/expo/react-native refreshed but stay
> **Experimental** per RK-5 — no device/GUI CI). Open framework gap EXA-GAP-1 (no React-free path
> to the non-deprecated configureMinder). Local gate: ~2265 tests / 0 fail, tsc + lint + build
> clean. Owner-gated remainders: OSS-01 naming (analysis ready), OSS-07 funding, publish/release,
> mobile/desktop/edge on-device CI (H-05).
>
> **Quality plan (2026-07-19):** the evidence-based reliability/DX/maintainability execution plan is
> `docs/product/QUALITY_ROADMAP.md` (north-star bar, milestones M-Q0→M-Q3, decision register DEC-1→6,
> first wave). Its work items are tracked in `BACKLOG.yaml` as `QR-R1, QR-R2, QR-D1, QR-D2, QR-P1,
> QR-P2, QR-M1, QR-E1`. First wave = **M-Q0** (QR-R1 node-env test leg + measurement baselines) —
> low-risk, additive, needs no owner decision to start.

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

**WAVE I (local-first) — I-01 done, I-02 deferred with evidence.** I-01: `useMinder(route,
{ source: 'local' | 'local-first' })` + exported `LocalStore` over the Wave-H storage adapters —
offline reads, network+persist+fallback, default path byte-identical (regression-tested),
mutation-verified. Commit ea794f1. I-02 (offline×2/websocket×3 consolidation): recon FALSIFIED the
"dead code, safe delete" premise — all layers are LIVE (core/WebSocketManager is used by
MinderDataProvider:229) — so it's a high-risk refactor with zero user value; deferred, not churned
(reliability pillar). **WAVE J (golden-path DX) — started:** fixed a beginner-facing 404 in
MinderConfigError's docs link + added a dead-link regression guard (8e411e6). Gate: 2173 tests/0.
Process note: a bulk `str.replace('tasks:')` corrupted BACKLOG.yaml's ledger string mid-session;
caught by yaml.safe_load and repaired (2b1afef) — verification gate held before propagation.

**WAVE H (platform certification) — evidence-based, no overclaiming.** Toolchain (Expo/Electron
runtimes) not automatable in this env, so NO device/GUI run was produced or fabricated. Delivered
the fully-verifiable work: (H-01) platform storage adapters Electron/Expo/Native 4-6% -> ~60%
coverage, non-vacuity mutation-verified; (H-02) found + fixed a real mobile bug — /native /expo
/node returned `undefined` for HttpMethod (dabd92d-class dist-interop on uncovered entries) — and
extended the dist guard to all platform entries; (H-04) SUPPORT_MATRIX updated with exact evidence,
platforms stay Experimental (Confirmed requires a CI runtime run we can't produce here). H-03
react-native-web browser proof NOT produced (toolchain) — documented honestly, not faked. Gate:
2160 tests / 0 failed. Commits b0e7701, 0982577.

**WAVE G COMPLETE (2026-07-19) — first full six-stage-pipeline wave.** Cleanup + docs + the
bugs the pipeline itself surfaced: README golden-path rewrite, migration guide, custom-provider
public API (server-only boundary proven at source/dist/runtime), configureMinder preset-override
fix, CLI certification honesty (tarball-verified), Express-proxy + residual CORS credential
hardening (SEC-01 class). 4 bounces caught pre-commit. Gate: 2112 tests / 0 failed. Session
limits killed two agents mid-wave; orchestrator completed their work inline with the same
evidence bar. NEXT: Wave H (platform certification — Expo + Electron examples). Still owner-only:
GitHub unblock click (~85 local commits waiting), publish approval.

**VISION REFINEMENT (owner, 2026-07-19):** Core identity = the data layer between UI and ANY
source (backend / local db / server / anything): one-API-call demo → enterprise, every React
platform (web/mobile/desktop), usable by low-experience developers. Pillars: Performance,
Reliability, Ease of use, Simple config, Documentation. **AI integration layer explicitly
de-prioritized (not now).** Provider expansion continues only via community path + certification.

**PROVIDER PLATFORM COMPLETE (2026-07-19) — ALL 6 ROADMAP PROVIDERS CERTIFIED.**
Foundation (Plan A) + Supabase, Stripe, Clerk, Firebase, Razorpay, Sentry — each 10/10
certification, mock-mode example browser-verified, secret-sentinel tested. Catalog Planned column
empty. M2-05 fs-warning fixed. Full gate: 116 suites / 2078 tests / 0 failed, tsc clean, lint 0
errors, build OK, edge-safety + dist-interop guards green. ~70 commits ahead of origin/dev
(push blocked on owner's GitHub secret-scanning unblock — the ONLY open item).
Spec: docs/superpowers/specs/2026-07-18-provider-platform-design.md. Plans A–F in
docs/superpowers/plans/. Nothing published/released/tagged.

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

## Open blockers (owner-only)

1. ~~**GitHub secret-scanning unblock click**~~ — **Resolved (see the 2026-09-04 Release Update
   banner at the top of this file).** The unblock happened and `minder-data-provider@2.2.0`
   shipped from `main`. (Historic decisions SEC-01/R-01: resolved 2026-07-18 — merged to dev,
   evolve-in-place confirmed.)

## Next exact task (autonomous cycle)

Integrate S-03 (Supabase certification wave, in flight) → then Plan C (Stripe,
docs/superpowers/plans/2026-07-19-stripe-provider-plan.md) → Clerk → Firebase →
Razorpay + Sentry. Same wave protocol throughout.

## Assumptions awaiting validation

- Personas P1/P2 and provider priority order are **Inferred** — task R-02 (developer interviews).
- Supabase "Certified" claim covers mock-mode example + contract tests; live-service E2E requires
  real credentials and is explicitly out of CI.

## Security-sensitive areas (touch with review)

`src/core/ApiClient.ts` (headers/interceptors), `src/core/AuthManager.ts` + `src/auth/*`,
`src/security/secrets.ts`, `src/core/ProxyManager.ts` (generated code), future `@minder/server`.

## Handoff note for a fresh session

Read this file + BACKLOG.yaml + ROADMAP.md first; memory files `minder-data-provider-direction`,
`minder-perf-root-causes` carry the compressed history. Branch `fix/fail-closed-auth-and-cors-default`
contains SEC-01 + these docs, unpushed. Working protocol: plan file → TDD → full verification
(jest, tsc, lint, build) → code review → changelog/migration notes → update this tracker.
