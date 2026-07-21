# Adoption DX + Example Refresh Implementation Plan

> **For agentic workers:** inline execution (executing-plans). Steps use `- [ ]`. TDD where practical.

**Goal:** Make MDP effortless to adopt correctly — precise version diagnostics/fixes, framework-aware
scaffolding, a one-command starter — and bring the platform examples up to current versions/APIs
(incl. mobile & desktop), without over-claiming support.

**Architecture:** Two independent workstreams. (A) Adoption DX = CLI/tooling changes around the
already-shipped `minder doctor` version-satisfies check (5d01230). (B) EXA-02 = refresh 5 example
apps in place. No changes to core runtime behavior beyond additive tooling.

**Tech Stack:** zero-dep CJS CLI (`src/cli/index.cjs`), Node scripts (`scripts/`), Jest (jsdom +
`@jest-environment node`), Vite/React 19, Expo, React Native, Electron.

## Global Constraints (verbatim, from OS + verified repo)

- **No push / no publish / no release / no tag** without explicit owner approval. Commit locally only.
- Source of truth = current code > docs. **STATUS.md is stale** (says "M0 Wave 1, ~30 unpushed") — do
  not trust it; update it at the end.
- **Support is earned per-framework with a working example + CI evidence** (BRIEF non-goal; RK-5). So
  refreshing mobile/desktop examples does **not** promote them past **Experimental** — no CI runtime
  here. Say so; never claim Confirmed.
- **Security:** no real secrets anywhere; examples use env/mock config with the clientSafe/serverOnly
  split; scaffolders must never inline secrets; postinstall/tooling must not phone home or log secrets.
- Peer minimums are the single source of truth in root `package.json` (Node ≥20, React 18/19,
  `@tanstack/react-query` ≥5.90.6). Reuse them; don't hard-code duplicates.
- Verification with no CI: local gate (lint + type-check + build + full jest) **and** the Linux
  `node:22` Docker container for cross-platform confidence.

---

## Workstream A — Adoption DX (5 features)

### Task A1: `minder doctor --fix`
**Files:** Modify `src/cli/index.cjs` (cmdDoctor), `tests/cli-minder.test.ts`.
**Approach:** With `--fix`, collect the failing peer checks from `checkPeerVersions`, print the exact
`npm install …@^min` commands, and run them via `execFileSync('npm', …)` **only when `--fix` is
present** (the flag is the user's consent). Default (no flag) stays read-only. Never auto-run without
the flag. Guard: if nothing to fix, say so.
**Acceptance:** `doctor --fix` in a temp project with an old peer runs the install (mock/`--dry-run`
in tests); `doctor` without `--fix` never mutates. Tests assert the command list + that plain doctor
is read-only.

### Task A2: Reconcile the existing postinstall notice (NOT a rebuild)
**Verified:** `scripts/check-peer-deps.js` already runs on postinstall but is React/ReactDOM-only,
**major-version-only** (misses react-query 5.5.0 < 5.90.6), untested, and uses `process.cwd()` (a
dependency's postinstall cwd is its own dir — should honor `INIT_CWD` for the end-user project).
**Files:** Modify `scripts/check-peer-deps.js`; add `tests/check-peer-deps.test.ts`.
**Approach:** Add `@tanstack/react-query` (+query-core) to the check; use precise min-version compare
(same logic as the CLI, `have >= min`); resolve the target dir from `INIT_CWD ?? cwd`; keep it
non-blocking (`|| true`) and silent-on-success; no network, no secrets. Print the same friendly
"you have X, need ≥Y — run npx minder doctor --fix" pointer.
**Acceptance:** node-env test stubs an old react-query and asserts a warning is produced; current
versions produce none; never exits non-zero in a way that blocks install.

### Task A3: Framework auto-detect in `minder init`
**Files:** Modify `src/cli/index.cjs` (cmdInit), `tests/cli-minder.test.ts`.
**Approach:** Read the target project `package.json`; detect `next` / `vite` / `expo` /
`react-native` / `electron` / plain-react from its deps; print the detected framework and the correct
import entry (`minder-data-provider/nextjs|web|expo|native|electron|node`) in the init output + a
matching one-line note in the scaffolded config comment. Detection only — no behavior change to the
generated config schema. Unknown → current default + a neutral note.
**Acceptance:** temp projects with next / vite / expo package.json each yield the right detected label
+ entry hint; no package.json → graceful default.

### Task A4: `create-minder-app` starter
**Files:** Create `packages/create-minder-app/` (package.json with `bin`, `index.js` scaffolder,
`templates/react-vite/**`). **Scope (proposed default):** ONE template — Vite + React 19 + TanStack
Query + a working `minder` call against a public demo API, with `.env.example` and the correct
provider config comment (clientSafe/serverOnly). Publishing is owner-gated; build + test locally only.
**Approach:** zero-dep Node scaffolder: `npm create minder-app my-app` copies the template, rewrites
name, prints next steps. Reuse the config comment style from the CLI.
**Acceptance:** running the scaffolder into a temp dir produces a dir that `npm i && npm run build`
would build (verify type-check/structure in test without a network install); no secrets in template.
**Open decision (flag to owner):** template count/framework — default is a single Vite+React starter.

### Task A5: Renovate/Dependabot preset
**Files:** Create `.github/dependabot.yml` (repo's own deps) + `renovate.json` (shareable preset).
**Approach:** dependabot for the repo (npm, weekly, grouped). A `renovate.json` preset downstream apps
can `extends`. No workflow that publishes/deploys. Pure config.
**Acceptance:** both files are valid JSON/YAML (parse test); dependabot targets the right ecosystems.

---

## Workstream B — EXA-02 example refresh (5 apps)

Shared: bump `react`/`react-dom` → 19, `@tanstack/react-query` → ^5.90.6, fix the `minder-data-provider`
install ref, update any deprecated minder API usage, keep the security posture (env/mock config). For
each: verify what is verifiable here and record honestly what is not.

### Task B1: `examples/web/e-commerce` (Vite + React 19) — FULLY verifiable
**Acceptance:** deps bumped; `tsc` type-check clean; `vite build` succeeds; example uses current APIs.

### Task B2: `examples/nodejs/api` — FULLY verifiable
**Acceptance:** deps + minder ref current; runs / type-checks; server-only secret handling intact.

### Task B3: `examples/electron/desktop-app` (desktop) — partial
**Acceptance:** deps/API current; wires ElectronStorageAdapter; type-check/build where possible.
**Honesty:** stays **Experimental** — no GUI runtime here.

### Task B4: `examples/expo/quickstart` (mobile) — partial
**Acceptance:** Expo SDK + RN + minder API current; SecureStore adapter wired; type-check.
**Honesty:** stays **Experimental** — no device/simulator here.

### Task B5: `examples/react-native/offline-todo` (mobile) — partial
**Acceptance:** RN + AsyncStorage adapter + minder API current; type-check.
**Honesty:** stays **Experimental** — no device here.

Then: update `examples/README.md` (drop the "legacy" banner for refreshed ones, keep honest status),
`SUPPORT_MATRIX.md`, and `BACKLOG.yaml` (EXA-02). The `tests/examples-current.test.ts` guard already
enforces nextjs-app; extend it to the refreshed web example.

---

## Verification (every task)
Narrow test → `tsc --noEmit` (or example's) → lint → build → relevant jest → Docker Linux for
cross-platform-sensitive changes. "Passing" only after the command passed this session.

## Out of scope / honesty
- No push/publish. Mobile & desktop remain Experimental (no CI runtime). create-minder-app not
  published. STATUS.md refresh is a doc task at the end.
</content>
