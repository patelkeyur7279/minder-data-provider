# Quality Roadmap — making minder-data-provider strong, reliable, maintainable

> **Why this doc exists (new file, justified):** `BACKLOG.yaml` is the machine-readable **work-item
> tracker** and holds the entries below (IDs `QR-*`); `ROADMAP.md` is the **product/provider**
> roadmap (M0–M3, providers). Neither has a home for a measurable quality bar, a
> reliability/DX/maintainability milestone sequence, a decision register, or a first-wave execution
> plan. This doc is the **execution plan**; it does not duplicate work items — it references them by
> `QR-*` ID in `BACKLOG.yaml`. Planning/tracking only — no production code changed to create it.

**Evidence labels:** Confirmed (proven by code/tests/config/measurement) · Inferred · Unknown ·
Proposed. Every claim below is Confirmed with file:line or a measurement unless labelled otherwise.

**Verified current state (2026-07-19):** branch `dev`, 10 commits ahead of `origin/dev` (not pushed,
per owner). 6 providers certified; CI green on Node 20+22. `package.json` test env = **jsdom**
(`package.json:288`); coverage gates **50/45/56/56** (`package.json` jest.coverageThreshold). Recent
work committed locally: FileList server-crash fix, edge/RSC audits, adoption-DX (doctor --fix,
postinstall, init detect, create-minder-app, dependabot/renovate), all 5 examples refreshed. See
`STATUS.md` current-state header. **Doc discrepancy on record:** `STATUS.md` body below its header is
historical (M0-Wave-1 era) — the prepended header is authoritative; a full STATUS rewrite is deferred
(low value vs. this plan).

---

## 1. North-star quality bar (measurable standards)

A change is "good" only if it holds these. These are the acceptance backdrop for every `QR-*` item.

| Dimension | Standard (measurable) |
|---|---|
| **API stability & migration** | No breaking change outside a MAJOR release. Every breaking change ships a migration note + a deprecation cycle (≥1 minor with `@deprecated` + runtime warning) before removal. |
| **Type safety** | Public hooks/functions have no `any` in their *default* public signatures where a generic or inference is feasible. Route + response typing is opt-in but available. `tsc --noEmit` clean; `.d.ts` emitted for every entry. |
| **Test / runtime coverage** | Every source module that (a) uses a browser-only global (`File`/`FileList`/`Blob`/`crypto`/`window`) or (b) is on a server/SSR/edge path has a **`@jest-environment node`** test. Coverage gates rise on a published schedule (see QR-R2). CI stays green on the supported Node matrix. |
| **Platform-support claims** | A runtime is "Confirmed" in `SUPPORT_MATRIX.md` ONLY with a runnable example exercised in CI. No promotion without automated evidence (charter RK-5). |
| **Secret handling / security** | No secret-shaped value in client config/bundle/logs/tests/examples (guarded by `assertNoExposedSecrets`, `redactSecrets`). clientSafe/serverOnly split enforced per provider. New tooling does no network/telemetry with user data. |
| **Bundle / package health** | The pure-data path (`import { minder }`) must NOT pull React. Baseline (measured 2026-07-19): root `minder` import = 170.5 kB our-code + React; `/core` = 116.8 kB no-React; `/node` = 140.8 kB no-React; packed 360 kB / unpacked 1338 kB / 245 files. Target: a documented React-free data path whose measured size does not regress. |
| **Documentation & examples** | Every public entry + supported runtime has a current, type-checked example. `doctor` and COMPATIBILITY reflect reality. |
| **Provider certification** | Unchanged: the 10-point certification gate (RISKS_AND_THREAT_MODEL §Provider certification). No provider promoted without it. |
| **Release readiness** | `lint:check` + `type-check` + full jest (incl. node-env leg) + build green; CHANGELOG + migration notes present; owner approves publish (always owner-gated). |

---

## 2. Prioritized milestones (sequenced by evidence + risk, not by candidate order)

Priority order follows the planning principles: **correctness/reliability → DX/stability →
maintainability/boundaries → performance/bundle → feature breadth.** Each milestone is independently
shippable.

### M-Q0 — Foundation reliability *(first; low-risk, unblocks the rest)*
Close the class of bug that keeps shipping: browser-global/env assumptions masked by the jsdom test
env (FileList server crash, HttpMethod, edge, RSC were all this class). Establish measurement
baselines. **Items: QR-R1, QR-R2.** Gate: node-env test leg green in CI; coverage baseline recorded.

### M-Q1 — Developer experience & type safety
The highest *developer-value* work, mostly additive. **Items: QR-D1 (typed routes), QR-D2 (config
unification — owner decision).** Gate: typed-routes opt-in shipped without breaking the string API;
config story has one documented path (React-free included).

### M-Q2 — Package architecture & performance
Make the pure-data path lean and the big modules maintainable. Depends on M-Q0 (safe refactors need
the test net). **Items: QR-P1 (slim data path), QR-M1 (decompose oversized modules), QR-E1
(transport/edge).** Gate: measured no-React data path; module split behavior-preserving (suite green).

### M-Q3 — Major-version cleanup (3.0) *(only if evidence + owner approve)*
Remove deprecated/dead weight. **Items: QR-P2 (prune deprecated/redux/phantom hooks).** Gate: owner
signs the 3.0 boundary + removal policy; migration notes + codemods where feasible.

Already-tracked, folded in by reference (not re-created): `I-02` (offline/WebSocket duplication —
blocked/deferred), `R-03-BUILD` (`use client` lost in tsup splitting), `EXA-GAP-1` (React-free config
gap → feeds QR-D2), `H-05` (mobile/desktop on-device CI), provider certification gate.

---

## 3. Tracker entries

Full entries with the required schema (status/priority/evidence/problem/scope/non-goals/deps/
compat/security/acceptance/verification/docs/owner-decision) live in **`docs/product/BACKLOG.yaml`**
under IDs `QR-R1, QR-R2, QR-D1, QR-D2, QR-P1, QR-P2, QR-M1, QR-E1`. They are the canonical,
machine-readable tracker; this doc sequences and reasons about them.

---

## 4. Decision register (owner decisions — separate from engineering work)

These block or shape implementation and are the **owner's** call, not engineering's:

| ID | Decision | Why it matters | Options | Recommended (for sign-off) |
|---|---|---|---|---|
| **DEC-1** | Evolve-in-place vs. monorepo/package split | Determines how QR-P1/QR-P2 are done | (a) keep single package, curate entries; (b) split `@minder/*` | (a) evolve-in-place now; revisit split only if measured need persists |
| **DEC-2** | 3.0 breaking-change boundary | Gates M-Q3 (all removals) | define what 3.0 may break + when | Batch ALL breaking changes (config unification, deprecated removals) into one 3.0; nothing breaking before |
| **DEC-3** | Typed-route API design + escape hatches | Shapes QR-D1 | overload vs. new hook; `as const` routes; raw-URL/`any` escape hatch must remain | Additive overload; keep `useMinder(string)` + `rawUrl` escape hatches forever |
| **DEC-4** | Supported-runtime policy | Gates SUPPORT_MATRIX promotions + CI cost | which runtimes get on-device CI (mobile/desktop/edge) | Keep RN/Electron/edge Experimental until CI toolchain exists (RK-5); don't over-claim |
| **DEC-5** | Deprecated-API removal policy | Gates QR-P2 | remove in 3.0 vs. keep with warnings | Remove in 3.0 with ≥1 minor of `@deprecated` + runtime warning + codemod where feasible |
| **DEC-6** | Coverage/CI cost trade-off | Gates QR-R2 | how high to raise gates; add node-env leg cost | Add node-env leg (cheap, high value); raise gates in ~+5% steps per milestone, not all at once |

---

## 5. First execution wave (M-Q0 only — discovery/measurement + low-risk reliability)

**Chosen because:** it is the best risk-adjusted value — additive, no breaking changes, catches the
recurring env-masked bug class, and it builds the test safety-net that every later refactor (QR-M1,
QR-P1) depends on. It needs **no owner decision** to start.

- **Workstreams (independent, read/write-isolated):**
  - **W1 — node-env test leg (QR-R1):** add `@jest-environment node` tests for server/edge/crypto/
    file-handling paths + a CI leg. Owns: `tests/**` (new files only), `.github/workflows/ci.yml`
    (add a job — *note: CI change is out of scope for the current planning task; this wave item is
    "ready" and executes only when the owner lifts the no-CI-change hold*).
  - **W2 — measurement baselines (discovery):** commit the bundle/coverage baseline numbers into
    this doc's evidence appendix + `SUPPORT_MATRIX`. Owns: `docs/**` only. No code.
- **Model/agent allocation:** W1 = Sonnet (contained test authoring, TDD) with Opus review of the
  diff; W2 = Haiku (measurement/inventory) with Opus validation. (Adjust to available models; if
  subagents are unavailable, execute inline — do not fabricate delegated results.)
- **File-ownership boundaries:** W1 → `tests/**` + (later) `ci.yml`; W2 → `docs/**`. No overlap.
- **Expected tests:** each new node-env test must FAIL first if the guard/global fix is reverted
  (non-vacuous), then pass. `tests/file-upload-detection-node.test.ts` is the reference pattern.
- **Integration order:** W2 baseline first (cheap, informs targets) → W1 tests. Run full suite
  (jsdom + node legs) between.
- **Completion gate:** `lint:check` + `type-check` + full jest (both envs) + build green; new
  node-env tests proven non-vacuous; baseline numbers recorded.
- **Rollback/compat:** additive only (new tests + docs). Zero runtime behavior change; nothing to
  roll back beyond deleting new test files.

---

## Evidence appendix (measured/observed 2026-07-19)

- **Bundle** (`esbuild buildSync`, minified, tree-shaken, `import { minder }` only):
  root 170.5 kB our-code **+ React**; `/core` 116.8 kB no-React; `/node` 140.8 kB no-React.
  Packed 360 kB / unpacked 1338 kB / 245 files (`npm pack --dry-run`).
- **Types:** `src/hooks/useMinder.ts:599-600` — `useMinder<TData = any>(route: string, …)`.
- **Two configureMinder:** `src/core/minder.ts:125` `configureMinder(Partial<MinderConfig>)`
  (`{baseURL}`, `@deprecated` at `:113`) vs `src/config/index.ts:167`
  `configureMinder(UnifiedMinderConfig)` (`{apiUrl}`).
- **Deprecated (7):** `src/core/minder.ts:113`, `src/core/types.ts:33,73`, `src/config/index.ts:76`
  (cors→corsHelper, "removed in v3.0"), `src/hooks/index.ts:45`, `src/hook/index.ts:4`.
- **Redux dead weight:** slices generated in `src/core/SliceGenerator.ts` +
  `src/core/MinderDataProvider.tsx`; NOT referenced by `src/core/minder.ts` or
  `src/hooks/useMinder.ts` (main path). Confirmed by grep.
- **Plugin hooks:** `onUpload`/`onSync`/`onConnectivityChange` — no emit/call sites found in `src`
  (only referenced by the mock provider). Inferred "declared, no emitters" (also per SUPPORT_MATRIX).
- **Oversized modules:** `src/hooks/useMinder.ts` 1588 lines, `src/core/ApiClient.ts` 1210.
- **Transport:** `src/core/minder.ts:298` — `useFetch = transport==='fetch' && !isComplexRequest`
  (axios default; fetch opt-in).
- **Test env:** `package.json:288` jsdom; gates 50/45/56/56.
