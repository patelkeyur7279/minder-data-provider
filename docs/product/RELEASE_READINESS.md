# Release-Readiness Report — minder-data-provider

> ## Correction — 2026-08-26 (`fix-2.2.0-blockers` matrix)
> The "1 high" bullet directly below this line ("`onSync`/`onConnectivityChange` now fire for REAL
> auto-queued failed requests") was **false** for the case that matters most: a mutation that fails
> with a genuine, unmocked network error (real dead port) through a provider's `ApiClient` was
> never auto-queued at all — `onSync` had nothing to fire for, because `addToQueue()` was never
> called on that path. The unit-test evidence this bullet was based on mocked the error rather than
> causing a real one, which is exactly how it passed CI while staying broken. Tracked as C3.
>
> **Follow-up — Fixed (commit `5ea1915`).** The offline auto-queue now fires on genuine network
> failures: with `offline: { enabled: true }`, a mutation through a provider's `ApiClient` that hits
> a real dead port auto-enqueues — `getOfflineManager().getQueueSize()` goes 0→1 and the failed
> mutation replays on reconnect. Wire-verified against a real dead port by four test cases in
> [`tests/wire/offline-contract.mjs`](../../tests/wire/offline-contract.mjs):
> `c3-provider-mutate-dead-port-reports-failure-and-enqueues`,
> `c3-queued-request-replays-on-sync-against-real-server`,
> `c3-no-offline-config-dead-port-stays-plain-network-error` (control), and
> `c3-get-request-dead-port-is-not-auto-queued` (control). See
> [SUPPORT_MATRIX.md → Offline](./SUPPORT_MATRIX.md) (C3 row: Fixed) and
> [docs/FEATURES.md → Offline](../FEATURES.md), and `CHANGELOG.md`'s "Fixed — offline auto-queue on
> real network failure" entry, for the full evidence trail. This report's other findings are
> unaffected and this note does not retract them — only the offline-auto-queue claim below, which is
> now resolved.

> ## Update — 2026-07-20 (post-review fix program, branch `fix/mdpd-workspace-findings`)
> A follow-up review of 18 subsequent commits found and FIXED (all parent-verified, committed
> locally `cec62b2` + `8b1a9bb`):
> - **3 criticals:** minder() response-cache cross-user disclosure (now identity-keyed per hashed
>   credential + 200-entry cap + raw-data storage so `options.model` prototypes survive hits);
>   non-idempotent retry resubmission (idempotent-only default + `retryNonIdempotent` opt-in);
>   `configureMinder({plugins})` global mutation documented as per-instance (now forwarded
>   per-instance + collision-safe ownership).
> - **1 high:** two unrelated OfflineManagers — unified; `onSync`/`onConnectivityChange` now fire
>   for REAL auto-queued failed requests; `core/OfflineManager` deleted.
> - **detectMethod re-contract (breaking):** only ID-shaped final segments (numeric/UUID/ObjectId)
>   auto-detect as PUT — creates on collection routes now correctly send POST.
> - Earlier in the same branch (other agent, verified): `sideEffects: true` fixes a production
>   crash under 8/9 consumer bundlers, guarded by a real-Rollup treeshake check in `release:check`.
> - Items #5 (immer removed? no — still pending) — see §7; **hook items #6 are now RESOLVED**
>   (onCacheHit/onCacheMiss implemented; offline hooks reachable; onUpload on both paths).
> - Gate at this state: **suite 2357 passed / 0 failed**, tsc clean, lint 0 errors, build OK,
>   Rollup treeshake guard OK. Version has since been bumped to `2.2.0` and published to npm as
>   `latest` (owner-approved).
>
> The sections below are the original report snapshot (branch `dev`, commit `98e1e76`) and remain
> accurate for that baseline except where this update supersedes them.

**Program:** full release-readiness + end-to-end package-consumer validation.
**Status: RELEASED.** All findings below are historical (this report predates the release). The three
blockers this report originally tracked as owner-gated (version bump, publish-workflow gating,
unblock/push) have all since cleared: `minder-data-provider@2.2.0` is published on npm, dist-tag
`latest` is `2.2.0`, tag `v2.2.0` is on `origin`, and a non-prerelease GitHub Release exists. See
`CHANGELOG.md` for the released state and `RELEASING.md` for the process that was followed.

- **Tested at:** branch `dev`, working tree on top of commit `98e1e76` (the release-audit fixes are a
  local commit on top; see "Fixed defects"). Historical note: at the time this report was written the
  branch was not yet pushed pending a GitHub secret-scanning unblock; that unblock has since happened
  and the release shipped from `main` (see `.github/BRANCH_STRATEGY.md`).
- **Environment:** node v22.19.0 / npm 11.x on darwin-arm64; CI matrix is node [20, 22].
- **Package:** `minder-data-provider`, in-repo version `2.2.0`, published `latest` on npm = `2.2.0`.

---

## 1. Quality gate (authoritative, run by orchestrator)

| Check | Command | Result |
|---|---|---|
| Clean install | `rm -rf node_modules && npm ci` | ✅ 661 packages, exit 0 |
| Lint | `npm run lint:check` | ✅ **0 errors**, 396 warnings (all `no-explicit-any`/unused-var style; non-blocking) |
| Type-check | `npm run type-check` (`tsc --noEmit`) | ✅ exit 0 |
| Unit/integration suite | `npx jest --coverage` | ✅ **2271 passed, 29 skipped, 0 failed** (132/133 suites; `ssr-safety-node.test.ts` is the intentional-skip suite) |
| Coverage | (global) | Stmts 65.2% · Branch 58.6% · Funcs 54.1% · Lines 65.7% — no threshold gate fails |
| Build | `npm run build` (tsup) | ✅ CJS+ESM+DTS, exit 0 |
| Verify-build | `npm run verify-build` | ✅ exit 0 |
| **Documented release gate** | `npm run release:check` (clean→build→test→verify-build→pack --dry-run) | ✅ **exit 0** |
| Pack | `npm pack` | ✅ 367.9 kB tarball / 1.4 MB unpacked / **245 files** |

> A clean-install run initially surfaced **12 failures** in `tests/dist-entry-exports.test.ts` — a test-harness
> bug (not a dist defect) that only reproduces under a clean install (= what CI/consumers get). Root-caused
> and fixed (see Fixed defects #1); the gate above is post-fix.

## 2. Package-consumer validation (packed tarball, not source)

Installed the real tarball into a clean fixture with **only the required peers** (react 19, react-dom 19,
`@tanstack/react-query` 5, `@tanstack/query-core` 5) — **no optional provider peers** — to test the
absent-optional-peer case as a real developer would hit it.

- **All 26 export paths resolve in BOTH CJS (`require`) and ESM (`import`): 26/26 + 26/26, 0 failures.**
  Entries: root, `/core`, `/server`, `/web`, `/nextjs`, `/native`, `/expo`, `/electron`, `/node`, `/hook`,
  `/crud`, `/auth`, `/cache`, `/websocket`, `/upload`, `/debug`, `/config`, `/ssr`, `/logger`, `/testing`,
  and the 6 `providers/*`.
- **Import-time safety:** all 6 provider entries import cleanly with their optional peers **absent** — no import-time crash.
- **Type declarations:** with `@types/react` + `@types/node` present (which a real TS consumer has), MDP's
  own shipped `.d.ts` produce **0 errors** under `moduleResolution: NodeNext` (strict). (Errors seen without
  those `@types` are the consumer's responsibility, not MDP's.)
- **Tarball contents:** 245 files; **0 source maps** (`!dist/**/*.map` honored), **0 non-CLI `src/`** files,
  `package.json` present, LICENSE/README/bin/scripts present. Fixed: `./package.json` is now an exported subpath.

## 3. Bundle / tree-shaking (reproducible; esbuild `buildSync`, minify + tree-shaking, deps external)

| Import | MDP-authored size |
|---|---|
| Minimal consumer `{ MinderDataProvider, useMinder }` | **180.05 kB** |
| Whole barrel (`export *`, all 201 exports) | 237.09 kB |

`dist` contains **0** references to `redux`/`SliceGenerator` (post-Redux-removal, confirmed). Named-export
tree-shaking survival is guarded by `tests/dist-entry-exports.test.ts` (now passing).

## 4. Security & dependency audit

- **Secrets:** no real secrets in the repo or the packed tarball; only fixture/placeholder values, all in
  non-shipped paths. Firebase `apiKey` correctly treated as a public identifier (`clientSafe`); `serviceAccount` is `serverOnly`.
- **Secret boundary enforced at runtime** (not just documented): `secret()` resolves only when `isServer()`;
  `resolveCredential()`/`resolveSecret()` throw in the browser; `configureMinder()` runs `assertNoExposedSecrets`
  unconditionally; manifest registration hard-fails on `clientSafe`∩`serverOnly` overlap. Verified by tests.
- **Redaction:** `Authorization`/`Cookie`/token headers and secret-shaped values are redacted at every debug
  log site (`sanitizeHeaders` + `redactSecrets`). Residual footgun: `ApiError.raw` carries the unredacted
  original error — a *consumer*-side risk if they log `.raw` (→ follow-up doc note).
- **CORS:** safe defaults (`origin:'*'`, `credentials:false`); the unsafe `credentials:true`+`origin:'*'`
  combination is **refused** at construction. No wildcard-with-credentials default anywhere.
- **Dependency audit (prod):** was **2 high + 2 moderate** (axios SSRF/prototype-pollution/HTTP2; dompurify
  XSS/prototype-pollution). **Fixed → now 0/0/0.** (see Fixed defects #2/#3.)

## 5. Feature inventory (evidence-based labels)

| Area | Label |
|---|---|
| Config + routes, `useMinder` (methods/params/errors/retries/cancel/absolute-URL escape hatch), caching+invalidation, auth+token-refresh, CORS+proxy, server-only secrets, logging+redaction, uploads (`MediaUploadManager`), WebSocket (`WebSocketManager`), 6 providers (10/10 mock-mode cert) | **Confirmed-tested** |
| Plugin hooks `onRequest`/`onResponse`/`onError`/`onRequestIntercept`/`provideToken`/`onAuthRefresh`/`onInit` | **Confirmed-tested (real emitters)** |
| SSR/hydration/Next.js, node/server platform entry | **Experimental** (real unit tests; no CI runtime example) — matches SUPPORT_MATRIX |
| `onUpload` / `onSync` / `onConnectivityChange` | **Partial — real emitters but not reachable via the public API** (internal `platform/offline` OfflineManager unexported; `onUpload` only via `/upload` `MediaUploadManager`, not the `useMinder` path) → docs corrected |
| `onCacheHit` / `onCacheMiss` | **Not implemented (dead — 0 emit sites)** → docs corrected to "roadmap" |
| `onAuthChange` | Not a real hook (does not exist) |

## 6. Fixed defects (this program; local commit, tests re-run green)

1. **`tests/dist-entry-exports.test.ts` esbuild invocation** — ran `node <esbuild-bin>` where the bin is a
   native executable → `Invalid or unexpected token` under clean install (CI/consumers). Fixed to execute the
   launcher directly. Suite 12 failing → **51/51 passing**; restores a green clean-install gate.
2. **axios `1.13.1` → `^1.18.1`** — clears GHSA SSRF/prototype-pollution/HTTP2 (2 high). Full suite + build re-verified.
3. **dompurify `3.3.0` → `^3.4.12`** — clears XSS/prototype-pollution advisories in the actively-used XSS sanitizer.
4. **`exports["./package.json"]` added** — tooling/bundlers that read `minder-data-provider/package.json` no longer hit `ERR_PACKAGE_PATH_NOT_EXPORTED`.
5. **Doc accuracy** — corrected over-claims to match verified evidence: dead `onCacheHit/onCacheMiss` and
   unreachable `onUpload/onSync/onConnectivityChange` (FEATURES.md, API_REFERENCE.md, SUPPORT_MATRIX.md);
   README migration pointer now names the breaking v3.0; CATALOG "production-ready" → accurate (mock-mode cert,
   no live E2E in CI).

## 7. Remaining blockers & owner decisions (NOT code defects)

**Publish blockers (owner-gated) — all cleared, historical:**
1. ~~**Version is now `2.2.0`**~~ **Done.** The package shipped as `2.2.0` (carrying the entire v3.0
   feature set, including breaking changes, notably Redux removal, in this minor by explicit owner
   decision), dist-tag `latest`.
2. ~~**`dev` is unpushed**~~ **Done.** The release shipped from `main` (dev→test→main per
   `.github/BRANCH_STRATEGY.md`); the GitHub secret-scanning unblock this item was waiting on has
   happened and CI is green on the released commit.

**Release-process risks (owner decision recommended before release):**
3. ~~**`publish.yml` auto-publishes**...~~ **Superseded (2026-08-17):** `publish.yml` has been removed.
   npm publishing is now a manual, owner-run step with no CI token involved; `release-guard.yml` runs
   read-only version/CHANGELOG consistency checks on push/PR to `main` but never publishes. See
   [`RELEASING.md`](../../RELEASING.md) for the current process.
4. **CI/publish gate divergence** — `ci.yml` runs lint/type/test/build but **not** `verify-build`/`pack`; those
   run only in `release:check`/`prepublishOnly`. Recommend adding them to CI so packaging regressions are caught on PRs.

**Follow-up cleanup (non-blocking; recommend tracker items):**
5. `immer` is a declared runtime dep but **dead** (0 refs in `dist`, `LazyDependencyLoader` has no importers) → remove or wire in.
6. Phantom/unreachable hooks: remove or implement `onCacheHit`/`onCacheMiss`; export or remove the `platform/offline` OfflineManager (`onSync`/`onConnectivityChange`); wire `onUpload` into the `useMinder` path.
7. Orphaned `src/websocket/WebSocketClient.ts` sits on the public `./websocket` surface, unused/untested.
8. Document the `ApiError.raw` unredacted-original footgun in SECURITY docs.
9. **150 stray `node_modules/*` files are tracked in git** (despite `.gitignore`) — `git rm -r --cached node_modules`. Does not ship (not in `files`), but repo hygiene.
10. Stale example lockfiles (`web/e-commerce`, `nodejs/api`, `nextjs-app`) still embed pre-removal Redux peer metadata → regenerate.
11. GitHub Wiki (README's "full documentation" link) is stale — not because `dev` is unpushed (it
    shipped from `main`), but because `.github/workflows/wiki-sync.yml` only triggers on pushes to
    `dev` under `docs/**`, and the 2.2.0 release commits all landed on `main`. See the wiki-sync
    workflow fix for the resolution.

## Completion-criteria status

| Criterion | Status |
|---|---|
| Full required quality checks pass | ✅ |
| Packed package installs & works in consumer fixtures | ✅ |
| Public exports & type declarations verified | ✅ |
| Advertised confirmed features have evidence (claims corrected where they exceeded it) | ✅ |
| Security/secret checks pass | ✅ (prod audit now 0) |
| Docs/support claims match verified reality | ✅ (corrected) |
| No unresolved high-severity/release-blocking **code** issue | ✅ (axios/dompurify fixed) |
| Release process documented & reproducible | ✅ `release:check` green; ⚠️ CI gate divergence + publish auto-gate are owner items |
| **Version bumped + publishable** | ✅ 2.2.0, published (breaking changes by owner decision) |

**Final status: RELEASED.** All three conditions this report originally gated on — (a) version
confirmed 2.2.0 (carrying breaking changes by explicit decision), (b) the publish-workflow gate
decided (manual, owner-run `npm publish`; see `RELEASING.md`), and (c) unblock/push — have been
satisfied. `minder-data-provider@2.2.0` is published to npm as dist-tag `latest`, tagged `v2.2.0` on
`origin`, and released via a non-prerelease GitHub Release. See `CHANGELOG.md` for the released
state; this report is preserved as the historical readiness record that preceded the release.
