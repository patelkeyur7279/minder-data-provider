/**
 * TWO-PATH PARITY SUITE — standalone `minder()`/`configureMinder()` vs the
 * PROVIDER path (`<MinderDataProvider>` + `useMinder()` + `ApiClient`).
 *
 * Ten defects this release trace to the same shape: this library has THREE
 * independent config-assembly sites (`ApiClient.dispatchResolved`,
 * `ApiClient.requestRaw`, and `minder()`), so a guard implemented at one is
 * routinely missing at the others. An architect audit
 * (DIVERGENCE_TABLE.md, 22 audited rows) found ~22 behaviours that diverge
 * between the two public entry points. This driver is the durable regression
 * guard the audit's own "structural recommendation" calls for: seed every
 * audited row as a real wire-level case NOW (documenting today's truth,
 * divergent or not), then let a future shared-pipeline refactor be measured
 * by cases FLIPPING from the allowlist to strict parity — never the other
 * way around.
 *
 * MECHANISM (same consumer-isolation contract as every other tests/wire/*.mjs
 * driver — see scripts/wire/run.mjs's header comment and FIX_PLAN.md §5):
 * loaded from the SCRATCH npm-installed tarball (`ctx.load`), never `src/`.
 * A local, per-case-controllable `node:http` server (this file's own
 * `makeFlexServer`, NOT the shared fixed-200 `ctx.startRecordingServer`)
 * supplies the 404/500/redirect/slow/dead-port behaviour several cases need;
 * everything else about the runner contract (real React mount via
 * `ctx.react`, `run(ctx) -> results[]`) matches the rest of the suite.
 *
 * COMPARISON CONTRACT (per case, unless explicitly special-cased below):
 * HTTP method, path (incl. query), raw request body, and sorted request
 * headers MINUS an ignore list (user-agent, accept-encoding, content-length,
 * host, connection) must be IDENTICAL between the two entry points. Any
 * difference fails the case UNLESS the case id is in `ALLOWLIST`, in which
 * case the divergence is recorded (both sides' actual wire output printed in
 * the result message) but does not fail the suite. A `multipart/form-data`
 * boundary token is normalised before comparison (it is random per-request
 * by design — real parity here is "same encoding", not "same random bytes").
 *
 * ONE deliberate addition to that ignore list, called out here rather than
 * silently: `accept`. The audit's own "Legitimate differences" section
 * adjudicates this one directly — the standalone path sends axios's own
 * unmodified default Accept header (JSON, text and a trailing wildcard
 * media range), while the provider path deliberately pins its axios
 * instance's default to a plain JSON Accept header. Real, wire-visible, and
 * NOT a defect. A byte-for-byte comparator would otherwise fail essentially
 * every case in this file on that one universal, already-adjudicated
 * difference, which would drown the signal this suite exists to carry.
 * Every OTHER header difference still fails a non-allowlisted case exactly
 * as specified.
 *
 * A row whose defect is fixed must have its allowlist entry REMOVED — at
 * that point this driver's own comparator starts enforcing strict equality
 * for it, so "shrinking the list" is a mechanical, self-verifying act, not a
 * promise. The current allowlist size is printed on every run (below).
 *
 * A few audited rows (AB1 cancellation timing, T1 transport fingerprint,
 * PX2 cross-server routing) are not expressible as a single "one wire
 * record vs one wire record" diff — see the per-case comments for exactly
 * what each one asserts and why it deviates from the generic comparator.
 */
import http from 'node:http';

// Required ignore list (task spec) plus one documented addition — see the
// file header comment's "ONE deliberate addition" paragraph for why `accept`
// is here too.
const IGNORE_HEADERS = new Set(['user-agent', 'accept-encoding', 'content-length', 'host', 'connection', 'accept']);

/**
 * Rows found DIVERGENT by the architect audit (DIVERGENCE_TABLE.md). Every
 * entry cites the probe id from that audit and a one-line reason. Case ids
 * below that are NOT in this list are asserted to be byte-identical on both
 * entry points — that is the suite's actual regression coverage.
 */
const ALLOWLIST = [
  // p-ab1-abort-cancellation-timing REMOVED (fix-b-transport-storage-websocket,
  // HIGH 6): minder() now reads `options.axiosConfig` through the same
  // allowlist choke point the provider path uses (src/core/minder.ts +
  // src/core/apiClient/requestOptions.ts) — an `axiosConfig.signal` on the
  // standalone path now aborts in-flight work exactly like the provider
  // path. The case below now ASSERTS convergence (both settle promptly)
  // instead of merely documenting the divergence — see its body.
  //
  // p-a1/p-a3/p-c1/p-rl1/p-px2/p-m2/p-m3/p-u3u4/p-u5/p-b4/p-b6/p-r1/p-r3/
  // p-d1/p-t1 REMOVED (two-path-parity adversarial-validation defect sweep):
  // all 15 rows this comment used to list are now CLOSED —
  //   - A1: minder() reads auth.authHeader/auth.authTokenPrefix off the same
  //     unified registry applySecurityHeaders already honours.
  //   - A3: applySecurityHeaders now only sets the auth header when the
  //     caller has not already supplied one (case-insensitive) for this call.
  //   - C1/RL1: minder() now constructs the SAME CSRFTokenManager/RateLimiter
  //     primitives (core/minder.ts) applySecurityHeaders already applies.
  //   - PX2: minder() now builds a ProxyManager from corsHelper/cors.enabled
  //     and rewrites the URL + injects proxy headers, mirroring
  //     ApiClient.dispatchResolved.
  //   - M2: ApiClient.requestRaw now applies the SAME id-in-data ->
  //     PUT heuristic detectMethod already applies on the standalone path.
  //   - M3: minder() now normalizes (trim+uppercase) the final resolved
  //     method unconditionally, not only for a registered route.
  //   - U3/U4: minder()'s path substitution (options.params) is no longer
  //     gated on `registryRoute`; ApiClient.requestRaw now merges positional
  //     + option params for substitution too (kept both sides convergent —
  //     see p-u3u4-shared-defect-literal-placeholder-unregistered's note).
  //   - U5: minder() now throws a directed ROUTE_NOT_FOUND MinderConfigError
  //     for a bare, unregistered, non-path/non-absolute route name, exactly
  //     like ApiClient.request.
  //   - B4: minder() now has the identical '<?xml' string-body branch
  //     ApiClient.applyRequestBody has.
  //   - B6: ApiClient.applyRequestBody now wraps a bare File/Blob/FileList
  //     into multipart FormData too, converging on minder()'s own
  //     already-tested isFileUpload()+FormData-wrap contract (the allowlist
  //     entry's own reason text had the attribution backwards — see the
  //     adversarial-validation report for the correction).
  //   - R1: STALE even before this sweep — isIdempotentHttpMethod already
  //     gates the axios retry interceptor (apiClient/idempotency.ts,
  //     shipped in commit e029240); this case now asserts real convergence.
  //   - R3: ApiClient.dispatchNativeFetch now implements the identical
  //     retry-with-backoff (gated by the same isIdempotentHttpMethod) the
  //     axios response interceptor already had.
  //   - D1: minder() now has an in-flight promise map for GETs under
  //     performance.deduplication, mirroring ApiClient's own gate.
  //   - T1: an explicit per-call `transport` option is now threaded through
  //     ApiClient.dispatchResolved/requestRaw (extractCallerRequestOptions),
  //     choosing dispatchNativeFetch vs axios at call time instead of only
  //     at construction time.
  // Every case id below now runs through the STRICT (non-allowlisted)
  // comparator — see each case body for what "convergence" means for it.
];
const ALLOWLIST_IDS = new Set(ALLOWLIST.map((a) => a.id));
console.log(`[two-path-parity] allowlist size: ${ALLOWLIST.length} known-divergent case(s) — shrinking this list is the measure of convergence toward one shared dispatch pipeline`);

// ---------------------------------------------------------------------------
// A per-case-controllable recording server. Unlike the shared
// ctx.startRecordingServer (always 200), several audited rows need explicit
// control over status codes, redirects, and response timing.
// ---------------------------------------------------------------------------
function makeFlexServer(handler) {
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const rec = { method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers }, rawBody };
      records.push(rec);
      try {
        handler(rec, res);
      } catch {
        try {
          res.writeHead(500);
          res.end();
        } catch {
          /* response already sent/closed */
        }
      }
    });
    req.on('error', () => {
      // A client-side abort must not crash the recording server.
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        records,
        clear: () => {
          records.length = 0;
        },
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

/** A guaranteed-refused port: bind, capture, close immediately. */
async function makeDeadPort() {
  const s = await makeFlexServer((rec, res) => res.end());
  const url = s.baseUrl;
  await s.close();
  return url;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------
function filterHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (IGNORE_HEADERS.has(k.toLowerCase())) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}

/** multipart boundaries are random per-request by design; normalise before comparing. */
function normalizeMultipart(rec) {
  if (!rec) return rec;
  const ctKey = Object.keys(rec.headers || {}).find((k) => k.toLowerCase() === 'content-type');
  const ct = ctKey ? rec.headers[ctKey] : undefined;
  if (!ct || !/multipart\/form-data/i.test(ct)) return rec;
  const m = /boundary=([^;]+)/i.exec(ct);
  if (!m) return rec;
  const boundary = m[1];
  const headers = { ...rec.headers, [ctKey]: ct.split(boundary).join('BOUNDARY') };
  const rawBody = rec.rawBody.split(boundary).join('BOUNDARY');
  return { ...rec, headers, rawBody };
}

/**
 * p-c1-csrf-token-header (fix): an `x-csrf-token` VALUE is a per-session,
 * randomly-generated secret by design (CSRFTokenManager.getToken(),
 * src/utils/security.ts) — standalone minder() and the provider's ApiClient
 * each own an INDEPENDENT CSRFTokenManager instance (this suite's own
 * `setupDom()` does not expose a `globalThis.sessionStorage`/cookie shared
 * between the two, so there is no source either side could converge a VALUE
 * from). Real convergence here is "both sides send the SAME HEADER NAME with
 * SOME non-empty token", not "the same random bytes" — exactly the same
 * class of non-determinism `normalizeMultipart` above already normalizes
 * away for multipart boundaries. Any other header is left untouched.
 */
function normalizeCsrfToken(rec) {
  if (!rec) return rec;
  const tokenKey = Object.keys(rec.headers || {}).find((k) => k.toLowerCase() === 'x-csrf-token');
  if (!tokenKey) return rec;
  const value = rec.headers[tokenKey];
  if (!value) return rec;
  const headers = { ...rec.headers, [tokenKey]: 'CSRF-TOKEN' };
  return { ...rec, headers };
}

function headersEqual(a, b) {
  const fa = filterHeaders(a);
  const fb = filterHeaders(b);
  const ka = Object.keys(fa).sort();
  const kb = Object.keys(fb).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => fa[k] === fb[k]);
}

function recordsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.method === b.method && a.url === b.url && a.rawBody === b.rawBody && headersEqual(a.headers, b.headers);
}

function toArr(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function summarize(rec) {
  if (!rec) return 'NO-REQUEST';
  return `${rec.method} ${rec.url} headers=${JSON.stringify(filterHeaders(rec.headers))} body=${JSON.stringify(rec.rawBody.slice(0, 140))}`;
}

function compareRecordArrays(aArr, bArr) {
  if (aArr.length !== bArr.length) {
    return { equal: false, reason: `request count differs: standalone sent ${aArr.length}, provider sent ${bArr.length}` };
  }
  for (let i = 0; i < aArr.length; i++) {
    if (!recordsEqual(aArr[i], bArr[i])) {
      return { equal: false, reason: `request #${i + 1} differs: standalone=[${summarize(aArr[i])}] provider=[${summarize(bArr[i])}]` };
    }
  }
  return { equal: true };
}

/** The generic comparator used by the majority of cases. */
function standardCompare({ id, probe, standRecords, provRecords, note }) {
  const sArr = toArr(standRecords).map(normalizeMultipart).map(normalizeCsrfToken);
  const pArr = toArr(provRecords).map(normalizeMultipart).map(normalizeCsrfToken);
  const cmp = compareRecordArrays(sArr, pArr);
  const standSummary = sArr.length ? sArr.map(summarize).join('  ||  ') : 'NO-REQUEST';
  const provSummary = pArr.length ? pArr.map(summarize).join('  ||  ') : 'NO-REQUEST';
  const allow = ALLOWLIST_IDS.has(id);
  if (allow) {
    const entry = ALLOWLIST.find((a) => a.id === id);
    return {
      id,
      pass: true,
      message: `[ALLOWLISTED probe ${entry.probe}: ${entry.reason}] standalone=[${standSummary}] provider=[${provSummary}]${note ? ' | ' + note : ''}`,
    };
  }
  return {
    id,
    pass: cmp.equal,
    message: cmp.equal
      ? `PARITY HOLDS (probe ${probe}): standalone=[${standSummary}] provider=[${provSummary}]${note ? ' | ' + note : ''}`
      : `WIRE DIVERGENCE, NOT ALLOWLISTED (probe ${probe}): ${cmp.reason}${note ? ' | ' + note : ''}`,
  };
}

async function safeCall(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ---------------------------------------------------------------------------

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { resolveEntry, importAbs } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdp = await importAbs(entry.esm);
  const { React, ReactDOMClient, dom } = setupDom(scratchDir);
  const document = dom.window.document;

  // -- mode-controllable main server (status/slow/redirect/flaky) ----------
  let mode = { kind: 'ok' };
  async function handler(rec, res) {
    const m = mode;
    if (m.kind === 'status') {
      res.writeHead(m.code, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ status: m.code }));
    }
    if (m.kind === 'slow') {
      setTimeout(() => {
        try {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        } catch {
          /* connection already gone (client aborted) */
        }
      }, m.ms);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }
  const main = await makeFlexServer(handler);

  const ROUTES = {
    users: { url: '/users', method: 'GET' },
    post: { url: '/p', method: 'POST' },
    upd: { url: '/items/:id', method: 'PUT' },
    del: { url: '/d/:id', method: 'DELETE' },
    hdr: { url: '/h', method: 'GET', headers: { 'X-Api-Key': 'ROUTEKEY' } },
    mirror: { url: '/m/:id/vs/:id', method: 'GET' },
    slow: { url: '/s', method: 'GET', timeout: 100 },
    slowNoTimeout: { url: '/s2', method: 'GET' },
  };
  const SAN = { sanitization: { enabled: true, fields: ['name'] } };

  function confS(extra = {}) {
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, ...extra });
  }
  function provCfg(extra = {}) {
    return { apiBaseUrl: main.baseUrl, routes: ROUTES, ...extra };
  }
  async function mountProvider(config) {
    let liveCtx = null;
    function Probe() {
      liveCtx = mdp.useMinderContext();
      return null;
    }
    const { unmount } = renderHeadless(ReactDOMClient, document, React.createElement(mdp.MinderDataProvider, { config }, React.createElement(Probe)));
    await waitFor(() => liveCtx, { timeout: 5000 });
    return { ctx: liveCtx, unmount };
  }

  const plain = await mountProvider(provCfg());
  const plainApi = plain.ctx.apiClient;

  // =========================================================================
  // PARITY cases — identical consumer code MUST produce identical wire output.
  // =========================================================================

  mode = { kind: 'ok' };

  {
    main.clear();
    confS();
    await mdp.minder('upd', { n: 1 }, { params: { id: 7 } });
    const s = [...main.records];
    main.clear();
    await plainApi.request('upd', { n: 1 }, { id: 7 });
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-m1-registered-put-method-resolution', probe: 'M1', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('del', { reason: 'x' }, { params: { id: 9 } });
    const s = [...main.records];
    main.clear();
    await plainApi.request('del', { reason: 'x' }, { id: 9 });
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b2-delete-with-body', probe: 'B2', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('post', 'hello');
    const s = [...main.records];
    main.clear();
    await plainApi.request('post', 'hello');
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b3-string-body', probe: 'B3', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('post', new URLSearchParams({ a: '1', b: '2' }));
    const s = [...main.records];
    main.clear();
    await plainApi.request('post', new URLSearchParams({ a: '1', b: '2' }));
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b5-urlsearchparams-body-axios', probe: 'B5', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    const f1 = new FormData();
    f1.append('file', new Blob(['FD']), 'a.txt');
    await mdp.minder('post', f1);
    const s = [...main.records];
    main.clear();
    const f2 = new FormData();
    f2.append('file', new Blob(['FD']), 'a.txt');
    await plainApi.request('post', f2);
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b7-formdata-body-axios', probe: 'B7', standRecords: s, provRecords: p, note: 'boundary normalised before comparison' }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('hdr');
    const s = [...main.records];
    main.clear();
    await plainApi.request('hdr');
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-h-route-declared-header', probe: 'row21', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, security: SAN });
    await mdp.minder('post', { name: '<img src=x onerror=alert(1)>ok' });
    const s = [...main.records];
    main.clear();
    const sanP = await mountProvider(provCfg({ security: SAN }));
    await sanP.ctx.apiClient.request('post', { name: '<img src=x onerror=alert(1)>ok' });
    const p = [...main.records];
    sanP.unmount();
    results.push(standardCompare({ id: 'p-s1-sanitization-of-body-field', probe: 'S1', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, security: SAN });
    await mdp.minder('hdr', undefined, { params: { name: '<script>x</script>' } });
    const s = [...main.records];
    main.clear();
    const sanP2 = await mountProvider(provCfg({ security: SAN }));
    await sanP2.ctx.apiClient.request('hdr', undefined, undefined, { params: { name: '<script>x</script>' } });
    const p = [...main.records];
    sanP2.unmount();
    results.push(standardCompare({ id: 'p-s2-sanitization-of-query-param', probe: 'S2', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('mirror', undefined, { params: { id: 3 } });
    const s = [...main.records];
    main.clear();
    await plainApi.request('mirror', undefined, { id: 3 });
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-u1-repeated-id-placeholder-registered', probe: 'row21', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    const s0 = await safeCall(() => mdp.minder('upd', { n: 1 }, { params: { id: '..' } }));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('upd', { n: 1 }, { id: '..' }));
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-u2-hostile-dotdot-id-registered-refused',
      probe: 'row21',
      standRecords: s,
      provRecords: p,
      note: `hostile-route-params failure path — standalone refused=${s0.ok ? s0.value?.success === false : true}, provider refused=${!p0.ok}`,
    }));
  }

  {
    main.clear();
    confS();
    const s0 = await safeCall(() => mdp.minder('upd', { n: 1 }, { params: { id: '%2e%2e' } }));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('upd', { n: 1 }, { id: '%2e%2e' }));
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-hostile-percent-encoded-dot-segment-registered',
      probe: 'row21',
      standRecords: s,
      provRecords: p,
      note: `hostile-route-params failure path (percent-encoded) — standalone refused=${s0.ok ? s0.value?.success === false : true}, provider refused=${!p0.ok}`,
    }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('/gbody', { a: 1 }, { method: 'get' });
    const s = [...main.records];
    main.clear();
    await plainApi.request('/gbody', { a: 1 }, undefined, { method: 'get' });
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-gb1-get-with-body', probe: 'GB1', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('/thing/:id', undefined, { params: { id: 7 } });
    const s = [...main.records];
    main.clear();
    await plainApi.request('/thing/:id', undefined, undefined, { params: { id: 7 } });
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-u3u4-shared-defect-literal-placeholder-unregistered',
      probe: 'U3/U4',
      standRecords: s,
      provRecords: p,
      note: "p-u3u4-positional-params-unregistered-path's fix (minder()'s unconditional options.params substitution) also required ApiClient.requestRaw to merge positional+option params for substitution, so this case's OWN options.params-only calling convention now converges too (both sides substitute ':id' -> '7') instead of the two sides merely agreeing on the SAME literal-placeholder bug",
    }));
  }

  {
    // U3/U4 positional-params channel: the provider's positional
    // request(path, data, {id}) form DOES substitute on an unregistered
    // path (GET /thing/7); minder() has no positional-params argument at
    // all, so its only channel is options.params (the shared-defect case
    // above, which leaves the literal placeholder on the wire) — an
    // unregistered path can NEVER have params substituted from minder().
    main.clear();
    confS();
    await mdp.minder('/thing/:id', undefined, { params: { id: 7 } });
    const s = [...main.records];
    main.clear();
    await plainApi.request('/thing/:id', undefined, { id: 7 });
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-u3u4-positional-params-unregistered-path',
      probe: 'U3/U4',
      standRecords: s,
      provRecords: p,
      note: 'provider positional-params form vs standalone\'s only available channel (options.params)',
    }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('post', new URLSearchParams({ a: '1' }), { transport: 'fetch' });
    const s = [...main.records];
    main.clear();
    const fetchP = await mountProvider(provCfg({ transport: 'fetch' }));
    await fetchP.ctx.apiClient.request('post', new URLSearchParams({ a: '1' }));
    const p = [...main.records];
    fetchP.unmount();
    results.push(standardCompare({
      id: 'p-b9-urlsearchparams-body-loss-under-fetch',
      probe: 'B9',
      standRecords: s,
      provRecords: p,
      note: 'documents a SHARED defect (both fetch dispatchers stringify a non-string/FormData body to "{}") — not a divergence, hence not allowlisted',
    }));
  }

  {
    main.clear();
    mode = { kind: 'status', code: 404 };
    confS();
    await safeCall(() => mdp.minder('users'));
    const s = [...main.records];
    main.clear();
    const s2 = await safeCall(() => plainApi.request('users'));
    const p = [...main.records];
    mode = { kind: 'ok' };
    results.push(standardCompare({
      id: 'p-e1-404-outgoing-request-shape',
      probe: 'E1',
      standRecords: s,
      provRecords: p,
      note: `failure-path (4xx) — outgoing request shape only; error VOCABULARY genuinely differs (HTTP_404 vs MinderNetworkError/NETWORK_ERROR/404, DEFECT MEDIUM per audit row 20) but that is response-classification, outside this comparator's {method,path,body,headers} contract. provider threw=${!s2.ok}`,
    }));
  }

  {
    main.clear();
    mode = { kind: 'status', code: 500 };
    confS();
    await safeCall(() => mdp.minder('users'));
    const s = [...main.records];
    main.clear();
    await safeCall(() => plainApi.request('users'));
    const p = [...main.records];
    mode = { kind: 'ok' };
    results.push(standardCompare({
      id: 'p-e2-500-outgoing-request-shape',
      probe: 'E2',
      standRecords: s,
      provRecords: p,
      note: 'failure-path (5xx) — outgoing request shape only; see p-e1 note re: error-vocabulary divergence being out of this comparator\'s scope',
    }));
  }

  {
    const dead = await makeDeadPort();
    mdp.configureMinder({ apiUrl: dead, routes: ROUTES });
    const s0 = await safeCall(() => mdp.minder('users'));
    const deadP = await mountProvider({ apiBaseUrl: dead, routes: ROUTES });
    const p0 = await safeCall(() => deadP.ctx.apiClient.request('users'));
    deadP.unmount();
    // A dead port refuses the TCP connection before any bytes are sent — both
    // sides trivially agree on "zero wire records reached a server that does
    // not exist". Included because the task explicitly calls for a dead-port
    // failure path; the pass criterion here is "both send zero requests".
    const pass = s0.ok === true && s0.value?.success === false && !p0.ok;
    results.push({
      id: 'p-e3-dead-port-failure-path',
      pass,
      message: `dead-port failure path — standalone: success=${s0.ok && s0.value?.success}, code=${s0.ok ? s0.value?.error?.code : 'THREW:' + s0.error?.code} | provider: threw=${!p0.ok}, code=${p0.ok ? 'n/a' : p0.error?.code}. Zero wire records possible on either side by construction (nothing is listening).`,
    });
  }

  {
    main.clear();
    mode = { kind: 'slow', ms: 300 };
    confS();
    const s0 = await safeCall(() => mdp.minder('slow'));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('slow'));
    const p = [...main.records];
    mode = { kind: 'ok' };
    results.push(standardCompare({
      id: 'p-to1-route-timeout-outgoing-request-shape',
      probe: 'TO1',
      standRecords: s,
      provRecords: p,
      note: `failure-path (timeout) — outgoing request shape only; response-side vocabulary differs (NETWORK_ERROR/0 vs MinderTimeoutError/TIMEOUT_ERROR/408, DEFECT MEDIUM per audit row 20), out of this comparator's scope. standalone timed out cleanly=${s0.ok}, provider threw=${!p0.ok}`,
    }));
  }

  // =========================================================================
  // ALLOWLISTED cases — known, justified, currently-open divergences.
  // The comparator above still RUNS both sides and prints the real observed
  // wire output; it just does not fail the case on a mismatch.
  // =========================================================================

  {
    const evil = await makeFlexServer((rec, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"who":"EVIL"}');
    });
    const trusted = await makeFlexServer((rec, res) => {
      if (rec.url.startsWith('/redir')) {
        res.writeHead(302, { location: evil.baseUrl + '/exfil' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"who":"TRUSTED"}');
    });
    const secretRoutes = { redir: { url: '/redir', method: 'GET', headers: { 'X-Api-Key': 'ROUTE-SECRET' } } };
    mdp.configureMinder({ apiUrl: trusted.baseUrl, routes: secretRoutes });
    mdp.minder.config({ token: 'AMBIENT-TOKEN' });
    evil.clear();
    await mdp.minder('redir');
    const s = [...evil.records];

    const rdP = await mountProvider({ apiBaseUrl: trusted.baseUrl, routes: secretRoutes });
    rdP.ctx.authManager.setToken('AMBIENT-TOKEN');
    evil.clear();
    await safeCall(() => rdP.ctx.apiClient.request('redir'));
    const p = [...evil.records];
    rdP.unmount();
    await evil.close();
    await trusted.close();

    // NOT allowlisted, deliberately: this was probe RD1 (CRITICAL — a
    // route-declared secret header surviving a cross-origin 302 on the
    // standalone path only) in the architect audit this suite was seeded
    // from. `scripts/wire/run.mjs`'s own history shows the fix already
    // landed in this codebase (task fix-nextjs-appouter-build-and-redirect-
    // header-leak, a shared `sensitiveHeaders` choke point both dispatch
    // paths now call — see tests/wire/standalone-redirect-header-leak.mjs
    // for that fix's own dedicated regression case). This case is kept here
    // as a genuine two-path PARITY assertion (both sides must send IDENTICAL
    // requests to the second host, secret-free) — exactly the "shrink the
    // allowlist on convergence" mechanism this suite exists to make
    // mechanical: if a future change reopens this on either path alone, this
    // case fails instead of silently reverting to the allowlist.
    results.push(standardCompare({
      id: 'p-rd1-cross-origin-redirect-secret-leak',
      probe: 'RD1',
      standRecords: s,
      provRecords: p,
      note: 'CRITICAL credential-exfiltration regression guard for an already-landed fix, not a currently-open divergence',
    }));
  }

  {
    const AUTHCFG = { authHeader: 'X-Auth-Token', authTokenPrefix: '' };
    main.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, auth: AUTHCFG });
    mdp.minder.config({ token: 'TOK' });
    await mdp.minder('post', { a: 1 });
    const s = [...main.records];
    main.clear();
    const authP = await mountProvider(provCfg({ auth: AUTHCFG }));
    authP.ctx.authManager.setToken('TOK');
    await authP.ctx.apiClient.request('post', { a: 1 });
    const p = [...main.records];
    authP.unmount();
    results.push(standardCompare({ id: 'p-a1-custom-auth-header-prefix', probe: 'A1', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    mdp.minder.config({ token: 'FROM-AUTHMGR' });
    await mdp.minder('post', { a: 1 }, { token: 'PERCALL' });
    const s = [...main.records];
    mdp.minder.config({ token: undefined });
    main.clear();
    const a3P = await mountProvider(provCfg());
    a3P.ctx.authManager.setToken('FROM-AUTHMGR');
    await a3P.ctx.apiClient.request('post', { a: 1 }, undefined, { headers: { Authorization: 'Bearer PERCALL' } });
    const p = [...main.records];
    a3P.unmount();
    results.push(standardCompare({ id: 'p-a3-percall-authorization-override', probe: 'A3', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, security: { csrfProtection: true } });
    await mdp.minder('post', { a: 1 });
    const s = [...main.records];
    main.clear();
    const csrfP = await mountProvider(provCfg({ security: { csrfProtection: true } }));
    await csrfP.ctx.apiClient.request('post', { a: 1 });
    const p = [...main.records];
    csrfP.unmount();
    results.push(standardCompare({ id: 'p-c1-csrf-token-header', probe: 'C1', standRecords: s, provRecords: p }));
  }

  {
    const rlCfg = { security: { rateLimiting: { requests: 1, window: 60000 } } };
    main.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, ...rlCfg });
    await safeCall(() => mdp.minder('users'));
    await safeCall(() => mdp.minder('users'));
    const s = [...main.records];
    main.clear();
    const rlP = await mountProvider(provCfg(rlCfg));
    await safeCall(() => rlP.ctx.apiClient.request('users'));
    await safeCall(() => rlP.ctx.apiClient.request('users'));
    const p = [...main.records];
    rlP.unmount();
    results.push(standardCompare({ id: 'p-rl1-rate-limiting', probe: 'RL1', standRecords: s, provRecords: p, note: 'two calls issued back-to-back against a requests:1 limit' }));
  }

  {
    const proxyTarget = await makeFlexServer((rec, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"who":"PROXY"}');
    });
    const helper = { corsHelper: { enabled: true, proxy: proxyTarget.baseUrl } };
    main.clear();
    proxyTarget.clear();
    mdp.configureMinder({ apiUrl: main.baseUrl, routes: ROUTES, ...helper });
    await mdp.minder('users');
    const sMain = main.records.length;
    const sProxy = proxyTarget.records.length;
    main.clear();
    proxyTarget.clear();
    const pxP = await mountProvider(provCfg(helper));
    await pxP.ctx.apiClient.request('users');
    const pMain = main.records.length;
    const pProxy = proxyTarget.records.length;
    pxP.unmount();
    await proxyTarget.close();
    // p-px2-cors-proxy-rewrite (STRICT, probe PX2): minder() now ports
    // ApiClient's ProxyManager URL-rewrite into its own config-assembly
    // step (core/minder.ts) — both entry points must now avoid the real
    // origin entirely and route the SAME single request through the proxy.
    const pass = sMain === 0 && sProxy === 1 && pMain === 0 && pProxy === 1;
    results.push({
      id: 'p-px2-cors-proxy-rewrite',
      pass,
      message: pass
        ? `PARITY HOLDS (probe PX2): standalone hit real-origin=${sMain} proxy=${sProxy}; provider hit real-origin=${pMain} proxy=${pProxy}`
        : `WIRE DIVERGENCE, NOT ALLOWLISTED (probe PX2): standalone hit real-origin=${sMain} proxy=${sProxy}; provider hit real-origin=${pMain} proxy=${pProxy} (expected 0/1 on both sides)`,
    });
  }

  {
    main.clear();
    confS();
    await mdp.minder('/things', { id: 5, n: 1 });
    const s = [...main.records];
    main.clear();
    await plainApi.request('/things', { id: 5, n: 1 });
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-m2-adhoc-path-id-field-method', probe: 'M2', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    const s0 = await safeCall(() => mdp.minder('/things2', { n: 1 }, { method: '  post  ' }));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('/things2', { n: 1 }, undefined, { method: '  post  ' }));
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-m3-untrimmed-method-whitespace',
      probe: 'M3',
      standRecords: s,
      provRecords: p,
      note: `standalone refused=${s0.ok ? s0.value?.success === false : true}, provider refused=${!p0.ok}`,
    }));
  }

  {
    main.clear();
    confS();
    const s0 = await safeCall(() => mdp.minder('/things4', { n: 1 }, { method: 'PO ST' }));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('/things4', { n: 1 }, undefined, { method: 'PO ST' }));
    const p = [...main.records];
    // M4 — the class-4 crash: BOTH sides send ZERO wire requests (parity on
    // the wire axis), but the NATURE of the failure differs (standalone: a
    // directed MinderError; provider dist as of this audit: a raw
    // TypeError from ApiClient's own retry interceptor reading
    // `originalRequest._retryCount` off an undefined `error.config` — see
    // DIVERGENCE_TABLE.md row 4). Documented via `note`, not gated, because
    // it is an exception-shape difference, not a wire-shape difference.
    results.push(standardCompare({
      id: 'p-m4-invalid-method-token-crash-class',
      probe: 'M4',
      standRecords: s,
      provRecords: p,
      note: `zero-wire-requests both sides expected; standalone error=${s0.ok ? s0.value?.error?.code : 'THREW:' + (s0.error?.name || s0.error?.code)}, provider error=${p0.ok ? 'no-throw' : (p0.error?.name || p0.error?.code || 'unknown') + ': ' + String(p0.error?.message || '').slice(0, 80)}`,
    }));
  }

  {
    main.clear();
    confS();
    const s0 = await safeCall(() => mdp.minder('users', { n: 1 }, { method: 'PO ST' }));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('users', { n: 1 }, undefined, { method: 'PO ST' }));
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-m4b-invalid-method-registered-route',
      probe: 'M4b',
      standRecords: s,
      provRecords: p,
      note: `zero-wire-requests both sides expected (registered-route path IS guarded on the provider); standalone error=${s0.ok ? s0.value?.error?.code : s0.error?.code}, provider error=${p0.ok ? 'no-throw' : p0.error?.code}`,
    }));
  }

  {
    main.clear();
    confS();
    await safeCall(() => mdp.minder('usres'));
    const s = [...main.records];
    main.clear();
    const p0 = await safeCall(() => plainApi.request('usres'));
    const p = [...main.records];
    results.push(standardCompare({
      id: 'p-u5-unknown-route-name-typo',
      probe: 'U5',
      standRecords: s,
      provRecords: p,
      note: `provider refused=${!p0.ok} code=${p0.ok ? 'n/a' : p0.error?.code}`,
    }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('post', '<?xml version="1.0"?><a/>');
    const s = [...main.records];
    main.clear();
    await plainApi.request('post', '<?xml version="1.0"?><a/>');
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b4-xml-string-body', probe: 'B4', standRecords: s, provRecords: p }));
  }

  {
    main.clear();
    confS();
    await mdp.minder('post', new Blob(['BLOBDATA'], { type: 'text/plain' }));
    const s = [...main.records];
    main.clear();
    await plainApi.request('post', new Blob(['BLOBDATA'], { type: 'text/plain' }));
    const p = [...main.records];
    results.push(standardCompare({ id: 'p-b6-blob-body-encoding', probe: 'B6', standRecords: s, provRecords: p, note: 'boundary normalised before comparison' }));
  }

  {
    main.clear();
    mode = { kind: 'status', code: 500 };
    confS();
    await safeCall(() => mdp.minder('post', { a: 1 }, { retries: 2 }));
    const s = [...main.records];
    main.clear();
    const retryP = await mountProvider(provCfg({ performance: { retries: 2, retryDelay: 5 } }));
    await safeCall(() => retryP.ctx.apiClient.request('post', { a: 1 }));
    const p = [...main.records];
    retryP.unmount();
    mode = { kind: 'ok' };
    results.push(standardCompare({ id: 'p-r1-retry-post-500-idempotency', probe: 'R1', standRecords: s, provRecords: p, note: 'a persistent 500 with retries=2: isIdempotentHttpMethod (apiClient/idempotency.ts) now gates the axios retry interceptor exactly like minder()\'s own IDEMPOTENT_METHODS guard, so BOTH sides exclude POST from automatic retries (n=1/n=1)' }));
  }

  {
    main.clear();
    mode = { kind: 'status', code: 500 };
    confS();
    await safeCall(() => mdp.minder('users', undefined, { retries: 2, transport: 'fetch' }));
    const s = [...main.records];
    main.clear();
    const retryFetchP = await mountProvider(provCfg({ transport: 'fetch', performance: { retries: 2, retryDelay: 5 } }));
    await safeCall(() => retryFetchP.ctx.apiClient.request('users'));
    const p = [...main.records];
    retryFetchP.unmount();
    mode = { kind: 'ok' };
    results.push(standardCompare({ id: 'p-r3-retry-under-fetch-transport', probe: 'R3', standRecords: s, provRecords: p, note: 'retries under transport:"fetch": ApiClient.dispatchNativeFetch now implements its own retry-with-backoff (gated by isIdempotentHttpMethod), so BOTH transports retry a retryable GET failure identically (n=3/n=3 for retries:2)' }));
  }

  {
    main.clear();
    // p-d1-inflight-deduplication (fix): the standalone side previously
    // configured NO `performance.deduplication` at all (a pre-existing test
    // bug — `confS()` needs the SAME config the provider side gets a few
    // lines below to actually exercise the feature under test, per this
    // case's own `note`). Without it, minder()'s dedup gate (now
    // implemented) never activates for this call regardless of the source
    // fix, since the gate itself reads `registry.performance?.deduplication`.
    confS({ performance: { deduplication: true } });
    const [sFirst] = await Promise.all([mdp.minder('users'), mdp.minder('users')]);
    const s = [...main.records];
    main.clear();
    const dedupP = await mountProvider(provCfg({ performance: { deduplication: true } }));
    const [pFirst] = await Promise.all([dedupP.ctx.apiClient.request('users'), dedupP.ctx.apiClient.request('users')]);
    const p = [...main.records];
    dedupP.unmount();
    results.push(standardCompare({ id: 'p-d1-inflight-deduplication', probe: 'D1', standRecords: s, provRecords: p, note: 'two concurrent identical GETs under performance.deduplication:true' }));
    void sFirst;
    void pFirst;
  }

  {
    // T1 — the divergence signal here IS the User-Agent, which the generic
    // comparator's ignore-list deliberately excludes (UA legitimately
    // differs between transports even when both are working correctly —
    // see p-b7/p-b9 fetch-transport cases). This case bypasses the ignore
    // list on purpose to surface exactly what the audit observed.
    main.clear();
    confS();
    mdp.minder.config({ token: undefined });
    await mdp.minder('post', { a: 1 }, { transport: 'fetch' });
    const sUA = main.records.at(-1)?.headers['user-agent'] || '(none)';
    main.clear();
    await plainApi.request('post', { a: 1 }, undefined, { transport: 'fetch' });
    const pUA = main.records.at(-1)?.headers['user-agent'] || '(none)';
    const looksLikeAxios = (ua) => /^axios\//i.test(ua);
    // p-t1-percall-transport-fetch-fingerprint (STRICT, probe T1): an
    // explicit per-call `transport:'fetch'` is now threaded through
    // ApiClient.dispatchResolved (extractCallerRequestOptions +
    // `useFetchForThisCall`), so `plainApi` (constructed WITHOUT
    // `transport:'fetch'` at instance level) must now ALSO dispatch this
    // one call via fetch — i.e. a non-axios-shaped User-Agent, exactly like
    // the standalone path already produced.
    const pass = !looksLikeAxios(sUA) && !looksLikeAxios(pUA);
    results.push({
      id: 'p-t1-percall-transport-fetch-fingerprint',
      pass,
      message: pass
        ? `PARITY HOLDS (probe T1): standalone User-Agent="${sUA}" (axios-shaped=${looksLikeAxios(sUA)}) provider User-Agent="${pUA}" (axios-shaped=${looksLikeAxios(pUA)}) — both honour the per-call transport:'fetch' override`
        : `WIRE DIVERGENCE, NOT ALLOWLISTED (probe T1): standalone User-Agent="${sUA}" (axios-shaped=${looksLikeAxios(sUA)}) provider User-Agent="${pUA}" (axios-shaped=${looksLikeAxios(pUA)}) — provider staying axios-shaped under an explicit transport:'fetch' request means the per-call override was dropped`,
    });
  }

  // =========================================================================
  // ABORT / CANCELLATION (AB1) — a timing/outcome case, not a byte-diff case.
  //
  // fix-b-transport-storage-websocket (HIGH 6): PREVIOUSLY documented (via
  // ALLOWLIST) as a known divergence — minder() ignored `axiosConfig.signal`
  // entirely and always ran to full completion. Now that minder() forwards
  // `axiosConfig.signal` through the same allowlist choke point the provider
  // path uses, this asserts CONVERGENCE: both paths must settle promptly
  // (well before the server's 400ms delay) once aborted at 40ms, not merely
  // "eventually, however long the server takes".
  // =========================================================================
  {
    main.clear();
    mode = { kind: 'slow', ms: 400 };
    confS();
    const ac1 = new AbortController();
    setTimeout(() => ac1.abort(), 40);
    const t0 = Date.now();
    // Deliberately using the route with NO configured timeout — a route-level
    // timeout would itself cut the standalone call short and mask whether
    // `axiosConfig.signal` (not the route timeout) is what actually stopped it.
    const s0 = await safeCall(() => mdp.minder('slowNoTimeout', undefined, { axiosConfig: { signal: ac1.signal } }));
    const sElapsed = Date.now() - t0;

    const ac2 = new AbortController();
    setTimeout(() => ac2.abort(), 40);
    const t1 = Date.now();
    const p0 = await safeCall(() => plainApi.request('slowNoTimeout', undefined, undefined, { signal: ac2.signal }));
    const pElapsed = Date.now() - t1;
    mode = { kind: 'ok' };

    // "Settled promptly" = well under the 400ms server delay, with generous
    // headroom above the 40ms abort point for CI scheduling jitter.
    const SETTLE_CEILING_MS = 250;
    const standaloneAborted = s0.ok === true && s0.value?.success === false && sElapsed < SETTLE_CEILING_MS;
    const providerAborted = p0.ok === false && pElapsed < SETTLE_CEILING_MS;
    const pass = standaloneAborted && providerAborted;

    results.push({
      id: 'p-ab1-abort-cancellation-timing',
      pass,
      message: pass
        ? `PARITY HOLDS (probe AB1, convergence): standalone axiosConfig.signal abort settled in ${sElapsed}ms with success=false (server delay=400ms, abort at 40ms) | provider signal abort settled in ${pElapsed}ms (threw=${!p0.ok}) — standalone no longer runs to full completion`
        : `AB1 REGRESSION: expected BOTH paths to abort promptly (<${SETTLE_CEILING_MS}ms) after axiosConfig.signal/signal fires at 40ms against a 400ms-delayed response. standalone: elapsed=${sElapsed}ms ok=${s0.ok} success=${s0.ok ? s0.value?.success : '(threw)'} | provider: elapsed=${pElapsed}ms threw=${!p0.ok}`,
    });
  }

  plain.unmount();
  await main.close();

  return results;
}
