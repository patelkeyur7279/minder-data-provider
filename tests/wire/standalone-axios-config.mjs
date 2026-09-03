/**
 * fix-b-transport-storage-websocket (HIGH 7): standalone `minder()` never
 * read `options.axiosConfig` at all — `validateStatus` (which HTTP status
 * codes axios treats as success vs. throws for) had ZERO effect. A real
 * `node:http` server answering with a genuine 404 always produced
 * `{ success: false, status: 404 }`, even when the caller explicitly passed
 * `axiosConfig: { validateStatus: () => true }` asking to treat that status
 * as success. THE FIX (src/core/minder.ts): `options.axiosConfig` is now run
 * through the SAME allowlist choke point the provider (`ApiClient`) path
 * already uses for its own per-call option bag
 * (`src/core/apiClient/requestOptions.ts`'s `assertNoOriginOrTransportOptions`
 * + `pickForwardableRequestOptions`), so `validateStatus` (and `signal`,
 * `timeout`, `responseType`, `onUploadProgress`/`onDownloadProgress`,
 * `withCredentials`, `paramsSerializer`, `decompress`) now actually reach
 * axios — while `url`/`baseURL`/`proxy`/`adapter`/`transformRequest`/...
 * remain refused with a directed `MinderSecurityError`, proven below by the
 * SAME real server never receiving a hostile redirected request.
 *
 * HIGH 6 (`axiosConfig.signal` / `abort()`) is covered end-to-end by
 * tests/wire/two-path-parity.mjs's `p-ab1-abort-cancellation-timing` case
 * (previously an ALLOWLISTED known divergence, now asserted as convergence)
 * — not duplicated here.
 */
import http from 'node:http';

function makeStatusServer(statusCode, body) {
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      records.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
      res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    req.on('error', () => {
      /* client-side abort — must not crash the server */
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        records,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { importAbs, resolveEntry } = ctx.load;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdp = await importAbs(entry.esm);

  const server = await makeStatusServer(404, { error: 'not found (but treat me as success)' });

  try {
    const routeName = 'axiosConfigValidateStatusThing';
    mdp.configureMinder({
      apiUrl: server.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/1' } },
    });

    // --- Case 1: axiosConfig.validateStatus overrides axios's default 2xx-only success classification ---
    const overridden = await mdp.minder(routeName, undefined, {
      axiosConfig: { validateStatus: () => true },
    });
    const overriddenPass = overridden?.success === true && overridden?.status === 404;
    results.push({
      id: 'hi7-standalone-axiosconfig-validatestatus-accepts-404',
      pass: overriddenPass,
      message: overriddenPass
        ? `standalone minder() with axiosConfig.validateStatus:()=>true against a real 404 resolved success=true status=404 (validateStatus now reaches axios)`
        : `axiosConfig.validateStatus had no effect: got ${JSON.stringify({ success: overridden?.success, status: overridden?.status, error: overridden?.error })}`,
    });

    // --- Case 2 (negative control / regression guard): default validateStatus still rejects the SAME real 404 ---
    const defaultResult = await mdp.minder(routeName, undefined, {});
    const defaultPass = defaultResult?.success === false && defaultResult?.status === 404;
    results.push({
      id: 'hi7-standalone-default-validatestatus-still-rejects-404',
      pass: defaultPass,
      message: defaultPass
        ? `standalone minder() WITHOUT axiosConfig against the SAME real 404 still resolves success=false status=404 — the fix is opt-in, not a default-behavior change`
        : `REGRESSION: default (no axiosConfig) call against a real 404 no longer fails as expected: ${JSON.stringify({ success: defaultResult?.success, status: defaultResult?.status })}`,
    });

    // --- Case 3 (security negative control): axiosConfig cannot smuggle an origin/transport override ---
    // Reuses the SAME choke point as options.baseURL's own guard — proves
    // routing axiosConfig through pickForwardableRequestOptions/
    // assertNoOriginOrTransportOptions didn't reopen the credential-
    // exfiltration channel those functions exist to close. Zero requests
    // should reach EITHER host: the real server here (refused before dispatch)
    server.records.length = 0;
    const hostile = await mdp.minder(routeName, undefined, {
      axiosConfig: { baseURL: 'http://127.0.0.1:1', proxy: { host: '127.0.0.1', port: 1 } },
    });
    const refused =
      hostile?.success === false &&
      hostile?.error?.code === 'UNSAFE_REQUEST_OPTION_OVERRIDE' &&
      server.records.length === 0;
    results.push({
      id: 'sec-standalone-axiosconfig-rejects-origin-transport-override',
      pass: refused,
      message: refused
        ? `standalone minder() refused axiosConfig.baseURL/proxy with UNSAFE_REQUEST_OPTION_OVERRIDE BEFORE dispatch — the route's own real server received ZERO requests`
        : `SECURITY FAILURE: axiosConfig origin/transport override was not refused as expected: ${JSON.stringify({ success: hostile?.success, code: hostile?.error?.code, realServerRequests: server.records.length })}`,
    });
  } finally {
    await server.close();
  }

  return results;
}
