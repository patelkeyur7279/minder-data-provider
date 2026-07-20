# Release-Readiness Report — minder-data-provider

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
>   Rollup treeshake guard OK. Version still `2.2.0-beta.0` (bump awaits owner approval).
>
> The sections below are the original report snapshot (branch `dev`, commit `98e1e76`) and remain
> accurate for that baseline except where this update supersedes them.

**Program:** full release-readiness + end-to-end package-consumer validation.
**Decision: READY AFTER BLOCKERS** — code, package, and security are release-worthy (all quality
gates green, the packed tarball installs and works in clean consumer fixtures, security clean). The
remaining blockers are **owner-gated release actions, not code defects** (version bump, publish-workflow
gating, unblock/push `dev`). Nothing was published, pushed, tagged, released, or deployed.

- **Tested at:** branch `dev`, working tree on top of commit `98e1e76` (the release-audit fixes are a
  local commit on top; see "Fixed defects"). **Not pushed** (`origin/dev` is behind; owner GitHub
  secret-scanning unblock still pending per STATUS.md).
- **Environment:** node v22.19.0 / npm 11.x on darwin-arm64; CI matrix is node [20, 22].
- **Package:** `minder-data-provider`, in-repo version `2.2.0-beta.0`, published `latest` on npm = `2.1.4`.

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

**Publish blockers (owner-gated):**
1. **Version must bump to `3.0.0`** before publish — a breaking change (Redux removal) is merged, but the
   in-repo version is still `2.2.0-beta.0`. **I did not change it** (per instruction). Recommended: **3.0.0**, dist-tag `latest` (or `next`/`beta` for a pre-release first).
2. **`dev` is unpushed** (owner GitHub secret-scanning unblock pending) — the audit fixes are local only;
   publishing cannot happen until push is unblocked.

**Release-process risks (owner decision recommended before 3.0):**
3. **`publish.yml` auto-publishes** `npm publish --provenance` on push to `main`/`test` when the version differs
   from npm — no manual/tag/approval gate. A bumped `3.0.0` merged to `main` would publish to `latest` on push.
   Recommend adding a manual-approval / tag gate.
4. **CI/publish gate divergence** — `ci.yml` runs lint/type/test/build but **not** `verify-build`/`pack`; those
   run only in `release:check`/`prepublishOnly`. Recommend adding them to CI so packaging regressions are caught on PRs.

**Follow-up cleanup (non-blocking; recommend tracker items):**
5. `immer` is a declared runtime dep but **dead** (0 refs in `dist`, `LazyDependencyLoader` has no importers) → remove or wire in.
6. Phantom/unreachable hooks: remove or implement `onCacheHit`/`onCacheMiss`; export or remove the `platform/offline` OfflineManager (`onSync`/`onConnectivityChange`); wire `onUpload` into the `useMinder` path.
7. Orphaned `src/websocket/WebSocketClient.ts` sits on the public `./websocket` surface, unused/untested.
8. Document the `ApiError.raw` unredacted-original footgun in SECURITY docs.
9. **150 stray `node_modules/*` files are tracked in git** (despite `.gitignore`) — `git rm -r --cached node_modules`. Does not ship (not in `files`), but repo hygiene.
10. Stale example lockfiles (`web/e-commerce`, `nodejs/api`, `nextjs-app`) still embed pre-removal Redux peer metadata → regenerate.
11. GitHub Wiki (README's "full documentation" link) predates recent work because `dev` is unpushed → resolves once push is unblocked.

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
| **Version bumped + publishable** | ❌ **owner action** (3.0.0) + unblock/push `dev` |

**Final recommendation: READY AFTER BLOCKERS** — ship-worthy the moment the owner (a) bumps to 3.0.0,
(b) decides the publish-workflow gate, and (c) unblocks/pushes `dev`. Recommended version **3.0.0**, dist-tag
**`latest`** (consider a `next`/`beta` pre-release first). This is a recommendation only — no version or
dist-tag was changed.
