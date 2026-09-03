/**
 * fix-b-redirect-credential-leak (BLOCKER 2) — the STANDALONE `minder()`
 * mirror of `tests/wire/method-contract.mjs`'s
 * `sec-cross-origin-redirect-strips-route-header` case.
 *
 * A path-divergence audit (probe id RD1) found, with real wire evidence,
 * that on a cross-host redirect the STANDALONE `minder()` path delivered
 * the route's own declared `x-api-key` header to the evil host, while the
 * PROVIDER (`<MinderDataProvider>` + `ApiClient`) path correctly stripped
 * it — the provider path already set axios's `sensitiveHeaders` from the
 * route's own header names, and `minder.ts` never did. THE FIX:
 * `minder.ts` now sets `config.sensitiveHeaders` from the SAME shared
 * choke point ApiClient uses (`src/core/apiClient/sensitiveHeaders.ts`),
 * populated from the route's own declared headers plus the effective auth
 * header name plus the CSRF header name.
 *
 * This driver reproduces the exact reported shape end-to-end against the
 * REAL BUILT ARTIFACT (packed tarball, installed into a scratch consumer):
 * a real `node:http` "legit" server (the route's own, trusted host)
 * answers with a real cross-origin 302 to a SECOND, independent "evil"
 * server. Must: (a) the FIRST hop (the route's own host) receives
 * X-Api-Key normally — the redirect-follow itself must not be broken by
 * this fix, (b) the evil host receives the followed request, but (c) NEVER
 * the X-Api-Key header.
 */
import http from 'node:http';

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { importAbs, resolveEntry } = ctx.load;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpEsm = await importAbs(entry.esm);

  const evil = await ctx.startRecordingServer();

  /**
   * Real `node:http` server standing in for the route's own, trusted host.
   * Records every request it receives, then answers with a 302 pointing at
   * the evil server — mirrors method-contract.mjs's identical helper for
   * the provider-path case.
   */
  const legitRecords = [];
  const legitServer = http.createServer((req, res) => {
    legitRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
    res.writeHead(302, { Location: `${evil.baseUrl}/landed` });
    res.end();
  });
  const legit = await new Promise((resolve, reject) => {
    legitServer.on('error', reject);
    legitServer.listen(0, '127.0.0.1', () => {
      const address = legitServer.address();
      resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });

  try {
    const routeName = 'standaloneSecThingRedirect';
    mdpEsm.configureMinder({
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });

    const result = await mdpEsm.minder(routeName, undefined, { params: { id: '1' } });

    const firstHopGotKey = legitRecords.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
    const evilGotRequest = evil.records.length > 0;
    const evilGotKey = evil.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
    const pass = result?.success === true && firstHopGotKey && evilGotRequest && !evilGotKey;

    results.push({
      id: 'sec-standalone-cross-origin-redirect-strips-route-header',
      pass,
      message: pass
        ? `standalone minder() followed a real cross-origin 302 (route's own host -> a SECOND, independent server) successfully; the FIRST hop received X-Api-Key normally, but the redirect target NEVER received it`
        : `SECURITY FAILURE (redirect header leak): success=${result?.success}, first-hop got key=${firstHopGotKey}, evil got request=${evilGotRequest}, evil got key=${evilGotKey}, result=${JSON.stringify(result)}`,
    });
  } finally {
    await new Promise((resolve) => legitServer.close(() => resolve(undefined)));
  }

  // fix-percall-header-redirect-leak (defect 1, standalone minder() path —
  // the THIRD of the three confirmed-leaking dispatch paths). The case
  // above only ever proved ROUTE-DECLARED headers are stripped; this proves
  // a PER-CALL header (`minder(route, data, { headers })`) is stripped too
  // — `config.sensitiveHeaders` used to be set from `registryRoute?.headers`
  // only, at config-assembly time, before `options.headers` even merged
  // into `config.headers`. Same real-cross-origin-302 shape, own pair of
  // servers so the two cases stay fully isolated.
  const evil2 = await ctx.startRecordingServer();
  const legit2Records = [];
  const legit2Server = http.createServer((req, res) => {
    legit2Records.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
    res.writeHead(302, { Location: `${evil2.baseUrl}/landed` });
    res.end();
  });
  const legit2 = await new Promise((resolve, reject) => {
    legit2Server.on('error', reject);
    legit2Server.listen(0, '127.0.0.1', () => {
      const address = legit2Server.address();
      resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });

  try {
    const routeName2 = 'standaloneSecThingPerCallHeaderRedirect';
    mdpEsm.configureMinder({
      apiUrl: legit2.baseUrl,
      routes: { [routeName2]: { method: 'GET', url: '/things/:id' } },
    });

    const result2 = await mdpEsm.minder(routeName2, undefined, {
      params: { id: '1' },
      headers: { 'X-Custom-Secret-Token': 'STANDALONE-PER-CALL-SECRET', Accept: 'application/json' },
    });

    const firstHopGotSecret = legit2Records.some((r) => r.headers['x-custom-secret-token'] === 'STANDALONE-PER-CALL-SECRET');
    const evilGotRequest = evil2.records.length > 0;
    const evilGotSecret = evil2.records.some((r) => r.headers['x-custom-secret-token'] === 'STANDALONE-PER-CALL-SECRET');
    const evilGotBenign = evil2.records.some((r) => r.headers['accept'] === 'application/json');
    const pass2 = result2?.success === true && firstHopGotSecret && evilGotRequest && !evilGotSecret && evilGotBenign;

    results.push({
      id: 'sec-standalone-percall-header-cross-origin-redirect-strips',
      pass: pass2,
      message: pass2
        ? `standalone minder() with a PER-CALL secret header (options.headers) followed a real cross-origin 302 successfully; the FIRST hop received it normally, the redirect target NEVER did, and a benign per-call header (Accept) still reached the redirect target`
        : `SECURITY FAILURE (standalone per-call header redirect leak): success=${result2?.success}, first-hop got secret=${firstHopGotSecret}, evil got request=${evilGotRequest}, evil got secret=${evilGotSecret}, evil got benign header=${evilGotBenign}, result=${JSON.stringify(result2)}`,
    });
  } finally {
    await new Promise((resolve) => legit2Server.close(() => resolve(undefined)));
  }

  return results;
}
