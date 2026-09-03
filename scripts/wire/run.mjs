#!/usr/bin/env node
/**
 * Wire-level integration suite (FIX_PLAN.md §5).
 *
 * Drives a REAL `node:http` server and asserts the ACTUAL method/body that
 * goes on the wire for every documented call pattern — `useMinder().mutate()`,
 * `operations.create/update/delete`, and standalone `minder()` — against the
 * REAL BUILT ARTIFACT, packed and installed into a scratch consumer project
 * exactly like a real `npm install`. Never imports from `src/`, never mocks
 * `axios` or `ApiClient` — see FIX_PLAN.md §5, "Consumer isolation is the
 * entire point", for why that distinction is the entire reason this file
 * exists (tests/useMinder-body-e2e.test.tsx mocks both and could never have
 * caught B1).
 *
 * DELIBERATELY NOT A JEST TEST FILE — see FIX_PLAN.md §5 "Location". Jest's
 * ts-jest + jsdom + commonjs pipeline is precisely the thing this suite must
 * NOT run under (module:"commonjs" masks the ESM-vs-CJS split we need to
 * assert on, and ts-jest's own dynamic-import downleveling would silently
 * "fix" the exact bug class dist-entry-exports.test.ts guards against).
 * `tests/wire/*.mjs` are plain ESM modules this file `import()`s directly.
 *
 * CANNOT SILENTLY SKIP (T1):
 *   - Hard `process.exit(1)` if dist/ is missing — no graceful skip, no
 *     `describe.skip`. This is the exact failure mode that let
 *     tests/dist-entry-exports.test.ts run zero times in CI (it skipped
 *     because `npm test` ran before `npm run build` — see ci.yml history).
 *   - Hard `process.exit(1)` on `npm pack` failure or scratch install failure.
 *   - A manifest/recorded-results cross-check: every case declared in
 *     tests/wire/manifest.json must have exactly one recorded result. A
 *     driver that silently drops a case is a suite failure, not a pass.
 *   - A FLOOR on the manifest size, hardcoded here (not read from the
 *     manifest) — QA binding finding 3: `recorded.length === manifest.length`
 *     alone passes trivially at 0===0 on an empty/malformed manifest. This
 *     floor makes that impossible: an empty manifest fails
 *     `manifest.cases.length >= MIN_WIRE_CASES`, full stop.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { packTarball, createScratchConsumer, installIntoScratch, cleanupScratch, makeCacheRoot, makeTmpPackDir } from './lib/scratch.mjs';
import { startRecordingServer } from './lib/recorder-server.mjs';
import * as loadLib from './lib/load.mjs';
import * as reactHarness from './lib/react-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// Hardcoded floor — NOT read from manifest.json. See file header / QA binding
// finding 3. A manifest that shrinks below this either lost coverage by
// accident or was tampered with; both must fail loudly.
//
// fix-2.2.0-blockers (REDESIGN): raised from 12 to 117 — the suite had grown
// to 117 real cases while this floor still sat at 12, so it no longer
// enforced anything (a manifest could have silently shrunk from 117 down to
// 13 and this check would have stayed green). Set to the CURRENT case count,
// not merely "higher than before" — any future shrink below today's coverage
// must fail loudly, exactly like the QA binding finding this floor exists
// for in the first place.
//
// fix-2.2.0-blockers (REDESIGN COMPLETION, items 1-6): raised from 117 to
// 124 — 7 new real cases cover the urlOverride security boundary (cross-
// origin refusal + a same-origin positive control), the options.params
// path-substitution + unresolved-placeholder dispatch guard, the
// junk-method-override fallback, the interior-invalid-method directed
// error, and computeRouteValidation's repeated-placeholder substitution.
//
// fix-2.2.0-blockers (adversarial re-probe ROUND 2 — credential
// exfiltration reopened): raised from 124 to 130 — 6 new real cases close
// the raw `options.url`/`options.baseURL`/axios `options.proxy` channels
// (the `urlOverride` guard alone only closed ONE field name), prove the fix
// is a design-level ALLOWLIST by refusing the `adapter`/`transformRequest`/
// `httpAgent` "next round" family too, reproduce the exact reported dedup/
// cache-key collapse (two concurrent calls with different raw `url`
// overrides) and confirm it can no longer collapse two requests into one
// shared response, and a positive control proving legitimate allowlisted
// per-call options still forward.
//
// fix-2.2.0-blockers (adversarial re-probe ROUND 2, non-blocking hardening):
// raised from 130 to 131 — 1 new real case proves a route's own header no
// longer survives a genuine cross-origin 302 (axios's `sensitiveHeaders`,
// set from the route's own declared header names).
//
// fix-2.2.0-blockers (adversarial re-probe ROUND 3 — the fourth exfiltration
// channel + dedup-key divergence): raised from 131 to 139 — 8 new real
// cases. Six close `requestRaw`'s raw `...otherOptions` spread (the SAME
// url/baseURL/proxy/transport-hijack-family shape fixed for the
// registered-route path, reintroduced here) across BOTH entry points
// (leading-slash unregistered path AND absolute-URL), including one
// end-to-end case through the REAL public `useMinder()` hook's `axiosConfig`
// passthrough — every one carries a live bearer token and asserts it never
// reaches a SECOND, independent attacker server. Two prove the dedup cache
// key genuinely resolves divergence (not just refusal): concurrent GETs
// differing only in `params` or only in `headers` now dispatch as separate
// wire requests instead of collapsing into one shared (cross-tenant)
// response.
//
// fix-2.2.0-blockers (post-release BLOCKER 1 + SHOULD-FIX 3): raised from
// 139 to 142 — 3 new real cases. Two close the identical exfiltration on the
// standalone `minder()` path (`minder(name, undefined, { baseURL:
// '<attacker>' })` on a route with its own declared header + an ambient
// token — the ApiClient choke point never covered this path, since
// `minder()` builds its axios config by hand-picking fields, not spreading
// options), one direct and one through the public `createTypedMinder(...)
// .minder()` delegation. The third proves the dedup cache key now accounts
// for `paramsSerializer` (function-valued, wire-affecting) — two concurrent
// GETs differing only in that option no longer collapse into one shared
// response.
//
// fix-a-hostile-route-params (RELEASE BLOCKER): raised from 142 to 152 — 10
// new real cases (tests/wire/standalone-params-hostile.mjs) close the
// hostile-route-param escape on the standalone `minder()` + `options.params`
// path: 5 hostile cases reproduce the exact reported leak verbatim
// (`{id:'..'}` walking to the site root, `{id:'5#'}` truncating to the
// PARENT resource, `{id:'5?a=1'}` injecting a live caller-controlled query
// param, `{id:''}` falling through to the collection, and a percent-encoded
// traversal sequence) and assert ZERO requests reach the wire; 5 positive
// controls (numeric zero, a leading-zero string, a UUID, a nested
// `:id`-in-the-middle route, and a redundant-query-param regression guard)
// prove legitimate params still dispatch correctly with no over-tightening.
//
// fix-route-param-dot-segment-detector (RELEASE BLOCKER): raised from 152 to
// 163 — 11 new real cases close the gap an architect probe found in the
// detector fix-a-hostile-route-params just landed: it refused `'..'` but not
// a bare `'.'` segment or any of its percent-encodings, even though
// `/things/.` normalizes to `/things/` exactly the way `/things/..` walks
// past it entirely. 6 cases (tests/wire/crud-id-hostile-inputs.mjs's F5
// series) exercise `operations.update`/`operations.delete`; 5 (tests/wire/
// standalone-params-hostile.mjs's mirror cases) exercise the standalone
// `minder()` + `options.params` path — both go through the SAME shared
// choke point (`substituteUrlParams` -> `validateRouteParamValue`), so both
// paths are proven closed by the one fix. Values covered: a bare `'.'`
// (both delete and update), `'%2e'`/`'%2E'` (single-encoded, both hex-digit
// cases), `'%252e'` (double-encoded), and `'...'` (proving the fix refuses
// a dot-segment of ANY length, not just exactly 1 or 2). Every existing
// positive control (0, '007', a UUID, a 24-hex ObjectId, a nested route)
// still passes unchanged — this is purely additive coverage, the suite only
// grew.
//
// fix-b-transport-packaging (BLOCKER 2 + HIGH): raised from 163 to 169 — 6
// new real cases (tests/wire/upload-transport.mjs) close the file-upload
// transport gap and the Content-Type divergence. Four prove a file upload
// now honours an explicit `transport:'fetch'` end-to-end — real multipart
// body on the wire, no axios User-Agent — on BOTH the provider path
// (ApiClient.uploadFile -> dispatchNativeFetch, whose FormData body
// previously JSON.stringify'd to '{}') and the standalone `minder()` path
// (whose `isComplexRequest` guard previously forced axios regardless of an
// explicit `transport:'fetch'`); two of those four are SIMULATED-bare-
// workerd variants (fetch stub rejects any RequestInit.cache field, per the
// wave brief's own fallback instruction — same technique as P2b in
// platform-contract.mjs) proving the upload still completes. One is a
// FAILURE PATH: the provider upload against a real dead port reports a
// clean, network-shaped failure, not a crash. One closes the HIGH defect:
// the provider path under `transport:'fetch'` now sends
// `Content-Type: application/json` for a plain JSON body instead of
// `text/plain;charset=UTF-8` (dispatchNativeFetch previously never merged
// in the axios instance's own default headers, which axios's own dispatch
// merges in automatically but this transport bypasses entirely).
// fix-a-app-router-crash-offline-parity (BLOCKER 1 + HIGH): raised from 169
// to 177 -- 8 new real cases. Five (tests/wire/offline-standalone-parity.mjs)
// close the standalone-vs-provider offline-auto-queue gap (H1/H1b): a
// standalone minder() failure against a real dead port now reports
// OFFLINE_ERROR and auto-queues (previously NETWORK_ERROR with queueSize 0),
// the queued request replays on sync against a real server, a no-offline-
// config dead port still stays a plain NETWORK_ERROR with zero queueing, a
// GET failure is never auto-queued, and — the H1b "one shared choke point"
// proof — a standalone failure and a provider failure against the SAME
// configureMinder-wired instance land in the SAME OfflineManager queue.
// Three (tests/wire/app-router-plugin-manager.mjs) close BLOCKER 1 (server-
// side minder() throwing `TypeError: Cannot read properties of undefined
// (reading 'size')` in Next.js App Router): a bare minder() call against a
// real dead port, from a FRESH process where no plugin has ever been
// registered, returns a clean MinderResult (never throws) through both the
// ESM root entry and the CJS ./node entry, and stays clean across repeated
// calls in the same warm process (serverless-reuse simulation).
//
// fix-nextjs-appouter-build-and-redirect-header-leak (BLOCKER 2): raised
// from 177 to 178 — 1 new real case (tests/wire/standalone-redirect-
// header-leak.mjs) closes the standalone-vs-provider cross-origin-redirect
// header leak (probe id RD1): a route's own declared `X-Api-Key` header,
// dispatched through the STANDALONE `minder()` path, previously rode along
// to a SECOND, independent host on a real cross-origin 302 from the
// route's own trusted host — the provider (`ApiClient`) path already
// stripped it via axios's `sensitiveHeaders`, `minder.ts` never set it at
// all. The fix (`src/core/apiClient/sensitiveHeaders.ts`, now the single
// shared choke point both dispatch paths call) proves: the first hop still
// receives the header normally (redirect-following itself isn't broken),
// the evil host receives the followed request, but never the header.
//
// fix-a-crud-silent-success (BLOCKER 1 + BLOCKER 2 + BLOCKER 3 + HIGH 5):
// raised from 215 to 224 — 9 new real cases (tests/wire/crud-silent-
// success.mjs). Three close BLOCKER 1: `useOneTouchCrud('items').operations
// .create()/update()/delete()` previously dispatched with NO method
// override, falling back to the registered route's OWN declared method
// (GET) instead of POST/PUT/DELETE — each case proves the real verb now
// reaches the server and the resolved value comes from that verb's own
// handler, not the GET handler's stale response. Two close BLOCKER 2:
// `operations.fetch()` against a real 500 now REJECTS instead of silently
// resolving `[]` (failure path), and a positive control proves a genuine
// 200 still resolves the real array (not over-tightened). Two close
// BLOCKER 3: `useMediaUpload('thing').uploadFile()` against a hand-built,
// string-shorthand route config (bypassing configureMinder()'s route
// expansion — the documented `<MinderDataProvider config={...}>` hand-built
// shape) now sends a real POST with a real multipart body instead of a
// bodyless GET, both on a real server (happy path) and a real dead port
// (failure path, proving the fix didn't trade broken-success for a crash).
// Two close HIGH 5: a POST against a connection that accepts the body then
// drops mid-flight now reaches the server EXACTLY ONCE (previously silently
// retried, duplicating the write) while a positive control proves an
// idempotent GET against the identical server still retries as before — the
// fix is method-specific, not a blanket retry regression.
//
// test-wire-two-path-parity-suite (durable regression guard, not a bug fix):
// raised from 178 to 215 -- 37 new real cases (tests/wire/two-path-
// parity.mjs), seeding the full standalone-vs-provider divergence audit
// (DIVERGENCE_TABLE.md, 22 rows) as table-driven wire cases so the two
// entry points -- minder()/configureMinder() and <MinderDataProvider> +
// useMinder() + ApiClient -- can be measured converging toward one shared
// dispatch pipeline instead of drifting one silent defect per round. Every
// case runs BOTH entry points against the SAME recording server and
// compares method/path/body/sorted-headers (minus an ignore list); cases
// whose divergence is real and already audited are in that driver's own
// `ALLOWLIST` (16 entries as of this addition, each citing its probe id and
// a one-line reason -- printed on every run) so today's known gaps don't
// block the suite while remaining visible; a row that gets fixed is proven
// by REMOVING its allowlist entry, which is what happened to probe RD1
// during this same task (see p-rd1-cross-origin-redirect-secret-leak in
// tests/wire/manifest.json -- the fix above already landed, so that case
// now asserts strict parity instead of documenting a divergence). The
// remaining 21 cases assert genuine byte-for-byte parity today, acting as a
// regression guard for every previously-closed defect this driver could
// express as a two-path wire comparison.
//
// fix-b-transport-storage-websocket (HIGH 6 + HIGH 7 + BLOCKER 4 + HIGH 8):
// raised from 224 to 232 — 8 new real cases. Three (tests/wire/standalone-
// axios-config.mjs) close HIGH 7: standalone `minder()` now reads
// `options.axiosConfig` at all — `validateStatus:()=>true` against a real
// 404 now resolves `success:true status:404` (previously always
// `success:false`, axiosConfig had zero effect), a positive control proves
// the DEFAULT (no axiosConfig) call against the SAME 404 is unchanged, and a
// security negative control proves `axiosConfig.baseURL`/`proxy` are still
// refused with `UNSAFE_REQUEST_OPTION_OVERRIDE` BEFORE dispatch (zero
// requests reach the real server) — routing `axiosConfig` through the same
// allowlist choke point the provider path uses did not reopen the
// credential-exfiltration channel that choke point exists to close. HIGH 6
// (`axiosConfig.signal`/`abort()`) is proven by HARDENING the pre-existing
// `p-ab1-abort-cancellation-timing` case in tests/wire/two-path-parity.mjs
// from an always-pass "known divergence" record into a real assertion that
// both paths now settle promptly on abort (its ALLOWLIST entry removed) —
// not a new case, so it does not add to this count. Two (tests/wire/
// realtime-safety.mjs) close HIGH 8: `WebSocketClient.connect()` (the
// standalone class exported from the `/websocket` subpath, the last known
// site of the unhandled-rejection class already fixed for WebSocketManager/
// SseTransport/LazySseTransport/GlobalAuthManager.setToken/the GET
// auto-fetch path) no longer crashes a Node host on a discarded promise
// against a real dead port, and a caller that DOES attach `.catch()` still
// observes the real rejection. Three (tests/wire/expo-storage-
// persistence.mjs) close BLOCKER 4: `ExpoStorageAdapter`'s DEFAULT namespace
// previously produced a `:`-containing key REJECTED by the real
// expo-secure-store key-validation contract (`/^[\w.-]+$/`, verified against
// the published package's own source) on every write, silently, because
// every write already caught-and-logged the resulting error — a token
// "successfully" set via one instance was invisible to a SEPARATE instance
// with the same tokenKey (i.e. the next app launch). One case proves the
// real constraint rejects the OLD key shape directly (root-cause evidence);
// one proves the FIX's DEFAULT options now persist across two separate
// adapter instances sharing only the durable backing store; one proves a
// caller-supplied namespace/key with OTHER unsafe characters (space, `@`,
// `/`) is sanitized too, not just the default `:` separator.
const MIN_WIRE_CASES = 232;

const DRIVER_FILES = {
  'method-contract': join(repoRoot, 'tests/wire/method-contract.mjs'),
  'sanitization-contract': join(repoRoot, 'tests/wire/sanitization-contract.mjs'),
  'h2-node-runtime': join(repoRoot, 'tests/wire/h2-node-runtime.mjs'),
  'auth-hooks-contract': join(repoRoot, 'tests/wire/auth-hooks-contract.mjs'),
  'auth-fail-closed': join(repoRoot, 'tests/wire/auth-fail-closed.mjs'),
  'config-cors-contract': join(repoRoot, 'tests/wire/config-cors-contract.mjs'),
  'cors-guard': join(repoRoot, 'tests/wire/cors-guard.mjs'),
  'platform-contract': join(repoRoot, 'tests/wire/platform-contract.mjs'),
  'offline-contract': join(repoRoot, 'tests/wire/offline-contract.mjs'),
  'crud-id-hostile-inputs': join(repoRoot, 'tests/wire/crud-id-hostile-inputs.mjs'),
  'query-failure-safety': join(repoRoot, 'tests/wire/query-failure-safety.mjs'),
  'realtime-safety': join(repoRoot, 'tests/wire/realtime-safety.mjs'),
  'standalone-params-hostile': join(repoRoot, 'tests/wire/standalone-params-hostile.mjs'),
  'upload-transport': join(repoRoot, 'tests/wire/upload-transport.mjs'),
  'offline-standalone-parity': join(repoRoot, 'tests/wire/offline-standalone-parity.mjs'),
  'app-router-plugin-manager': join(repoRoot, 'tests/wire/app-router-plugin-manager.mjs'),
  'standalone-redirect-header-leak': join(repoRoot, 'tests/wire/standalone-redirect-header-leak.mjs'),
  'two-path-parity': join(repoRoot, 'tests/wire/two-path-parity.mjs'),
  'crud-silent-success': join(repoRoot, 'tests/wire/crud-silent-success.mjs'),
  'standalone-axios-config': join(repoRoot, 'tests/wire/standalone-axios-config.mjs'),
  'expo-storage-persistence': join(repoRoot, 'tests/wire/expo-storage-persistence.mjs'),
};

// Signature of an unguarded property read escaping as the library's error.
// Deliberately narrow: matches the internal-crash shape only, so a case that
// legitimately asserts a consumer-thrown TypeError is unaffected.
const INTERNAL_CRASH_RE = /TypeError: Cannot read properties of (?:undefined|null)/;

function fail(message) {
  console.error(`\n[wire] FAIL: ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log('[wire] step 0: verifying the built artifact exists (no graceful skip — T1)');
  const distDir = join(repoRoot, 'dist');
  const requiredArtifacts = ['index.js', 'index.mjs', 'platforms/web.js', 'platforms/web.mjs'];
  const missing = requiredArtifacts.filter((f) => !existsSync(join(distDir, f)));
  if (missing.length > 0) {
    fail(
      `dist/ is missing required build artifacts: ${missing.join(', ')}. ` +
        `Run "npm run build" first. This suite refuses to skip — that silent-skip pattern ` +
        `(tests/dist-entry-exports.test.ts before this fix) is exactly how B1-B5 shipped unnoticed.`,
    );
  }

  const manifestPath = join(repoRoot, 'tests/wire/manifest.json');
  if (!existsSync(manifestPath)) {
    fail(`tests/wire/manifest.json is missing at ${manifestPath}.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];

  if (cases.length < MIN_WIRE_CASES) {
    fail(
      `tests/wire/manifest.json declares only ${cases.length} case(s); the floor is ${MIN_WIRE_CASES}. ` +
        `An empty or truncated manifest must fail, not pass trivially (QA binding finding 3).`,
    );
  }
  const idSet = new Set(cases.map((c) => c.id));
  if (idSet.size !== cases.length) {
    fail('tests/wire/manifest.json has duplicate case ids.');
  }

  console.log(`[wire] step 1: npm pack (${cases.length} manifest cases, floor ${MIN_WIRE_CASES})`);
  const packDir = makeTmpPackDir();
  let tarballPath;
  try {
    tarballPath = packTarball(repoRoot, packDir);
  } catch (err) {
    fail(`npm pack failed: ${err?.message ?? err}`);
  }
  console.log(`[wire]   tarball: ${tarballPath}`);

  console.log('[wire] step 2: installing the tarball into a scratch consumer project (by package name only)');
  const cacheRoot = makeCacheRoot(repoRoot);
  const scratchDir = createScratchConsumer(cacheRoot);
  try {
    installIntoScratch(scratchDir, tarballPath);
  } catch (err) {
    fail(`scratch "npm install" failed: ${err?.message ?? err}`);
  }
  console.log(`[wire]   scratch consumer: ${scratchDir}`);

  const allResults = [];
  let hardError = null;

  try {
    console.log('[wire] step 3-4: driving every manifest call pattern against a real HTTP server\n');
    const ctx = {
      repoRoot,
      scratchDir,
      startRecordingServer,
      load: loadLib,
      react: reactHarness,
    };

    const driversNeeded = new Set(cases.map((c) => c.driver));
    for (const driverName of driversNeeded) {
      const driverFile = DRIVER_FILES[driverName];
      if (!driverFile) {
        fail(`manifest references unknown driver '${driverName}' (no entry in DRIVER_FILES).`);
      }
      if (!existsSync(driverFile)) {
        fail(`driver '${driverName}' is declared but ${driverFile} does not exist.`);
      }
      console.log(`[wire]   running driver: ${driverName}`);
      const mod = await import(pathToFileURL(driverFile).href);
      const results = await mod.run(ctx);
      if (!Array.isArray(results)) {
        fail(`driver '${driverName}' did not return an array of results.`);
      }
      for (const r of results) allResults.push({ ...r, driver: driverName });
      // A raw internal TypeError must NEVER reach a consumer as this library's
      // error: it means an unguarded property read replaced the real failure
      // with a crash message. Enforced here, at the runner, rather than in any
      // one driver — this exact bug class (an unguarded `error.config` read in
      // ApiClient's retry interceptor) was patched once at ONE trigger and a
      // DIFFERENT trigger promptly reached the same read, while every case
      // stayed green because the parity comparator only diffs wire records and
      // carries error text as an unasserted note. Applied to EVERY case,
      // allowlisted ones included: an allowlist covers wire-shape divergence
      // between the two paths, never an internal crash.
      for (const r of results) {
        const text = typeof r.message === 'string' ? r.message : '';
        if (INTERNAL_CRASH_RE.test(text)) {
          const hit = allResults.find((x) => x.id === r.id && x.driver === driverName);
          hit.pass = false;
          hit.message = `INTERNAL CRASH LEAKED TO CONSUMER — a raw TypeError surfaced instead of a directed error: ${text}`;
        }
      }
    }
  } catch (err) {
    hardError = err;
  }

  console.log('\n[wire] step 5: results\n');
  for (const r of allResults) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${r.id}  (${r.driver})`);
    if (r.message) console.log(`         ${r.message}`);
  }

  // T1 cross-check: every declared manifest case must have EXACTLY ONE
  // recorded result. This is the property that makes the suite un-skippable
  // — a driver that silently drops or never reaches a case is a FAILURE, not
  // a pass. `recorded.length === manifest.length` alone (the naive form) is
  // guarded above by MIN_WIRE_CASES so it cannot pass trivially at 0===0.
  const resultIds = new Map();
  for (const r of allResults) {
    resultIds.set(r.id, (resultIds.get(r.id) ?? 0) + 1);
  }
  const missingCases = cases.filter((c) => !resultIds.has(c.id));
  const duplicateResults = [...resultIds.entries()].filter(([, n]) => n > 1);
  const unknownResults = allResults.filter((r) => !idSet.has(r.id));

  let ok = hardError === null;
  if (hardError) {
    console.error(`\n[wire] a driver threw before completing: ${hardError.stack ?? hardError}`);
  }
  if (missingCases.length > 0) {
    ok = false;
    console.error(
      `\n[wire] ${missingCases.length} manifest case(s) were declared but NEVER produced a result: ` +
        missingCases.map((c) => c.id).join(', '),
    );
  }
  if (duplicateResults.length > 0) {
    ok = false;
    console.error(`\n[wire] duplicate results for: ${duplicateResults.map(([id]) => id).join(', ')}`);
  }
  if (unknownResults.length > 0) {
    ok = false;
    console.error(`\n[wire] result(s) for id(s) not declared in the manifest: ${unknownResults.map((r) => r.id).join(', ')}`);
  }
  if (allResults.length !== cases.length) {
    ok = false;
    console.error(`\n[wire] recorded.length (${allResults.length}) !== manifest.length (${cases.length}).`);
  }

  const failedCases = allResults.filter((r) => !r.pass);
  if (failedCases.length > 0) {
    ok = false;
    console.error(
      `\n[wire] ${failedCases.length}/${allResults.length} case(s) FAILED: ` + failedCases.map((r) => r.id).join(', '),
    );
  }

  console.log(`\n[wire] cleaning up scratch consumer (${scratchDir})`);
  cleanupScratch(scratchDir);

  if (!ok) {
    console.error('\n[wire] SUITE FAILED — see failures above.\n');
    process.exit(1);
  }

  console.log(`\n[wire] SUITE PASSED — ${allResults.length}/${cases.length} cases green.\n`);
  // Explicit success exit — react-dom's scheduler can leave a harmless
  // trailing `setImmediate` tick queued after the last driver's `unmount()`
  // (see tests/wire/method-contract.mjs's header comment); without this the
  // process would otherwise wait for Node's event loop to drain naturally.
  process.exit(0);
}

main().catch((err) => {
  console.error('[wire] unexpected top-level error:', err?.stack ?? err);
  process.exit(1);
});
