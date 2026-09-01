/**
 * C3 (fix-2.2.0-blockers) — the offline auto-queue wire contract.
 *
 * Reported defect: `mutate()` against a dead port (with `offline:{enabled:
 * true}` configured and a `<MinderDataProvider>` mounted) reports failure —
 * but `getOfflineManager().getQueueSize()` stays 0. "It works" (the queue
 * itself) was never actually broken; the WIRING to it was.
 *
 * Root cause, verified against a REAL dead port before this fix landed:
 * axios sets `isAxiosError: true` on EVERY error it throws, including a
 * connection-level failure with no HTTP response at all (confirmed:
 * `isAxiosError:true`, `code:ECONNREFUSED`, `response:undefined`). Old
 * `buildApiError` (src/core/apiClient/errors.ts) checked `if (isAxios)`
 * FIRST, computed `status = axiosError.response?.status || 0`, and its
 * `switch(status)` fell to a generic `default:` case for status 0 — it never
 * reached the offline-queueing branch further down, which only ever ran for
 * a hand-shaped `{ request, code, config }` error (no `isAxiosError`), i.e.
 * NEVER for a real request. `classifyNoResponseError` is now invoked from
 * BOTH shapes, so a real network failure is classified — and auto-queued —
 * identically.
 *
 * This driver proves the fix end-to-end against the REAL BUILT ARTIFACT
 * (packed tarball, installed into a scratch consumer, driven through a real
 * `<MinderDataProvider>` + `useMinder().mutate()`) using a REAL dead TCP
 * port — never a mock, never an intercepted axios instance:
 *
 *   1. (required) mutate() against a real dead port reports success:false
 *      (C1 still holds) AND the request lands in the offline queue.
 *   2. (required) that queued request REPLAYS correctly once a real server
 *      comes up on the exact same port (proves the fix is useful, not just
 *      "queue size went up").
 *   3. (hostile input / regression guard) the SAME dead-port failure with NO
 *      `offline` config at all must still report a plain NETWORK_ERROR, not
 *      silently start queueing for an app that never opted in — proves the
 *      broadened no-response classification is gated on offline support
 *      actually being enabled, matching tests/wire/platform-contract.mjs's
 *      P1b case (no-offline-config dead port -> NETWORK_ERROR).
 *   4. (hostile input) a GET route against a dead port, WITH offline
 *      enabled, must NOT be auto-queued — only mutations are queued; queueing
 *      a read is never correct (re-issuing it on reconnect is enough).
 */
import net from 'node:net';
import http from 'node:http';

/** Binds an ephemeral TCP port and immediately releases it — guarantees ECONNREFUSED (a real "dead port"). */
async function getDeadPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Binds a REAL recording `node:http` server on a SPECIFIC (not ephemeral)
 * port — used to prove a queued request replays correctly once connectivity
 * returns. Must reuse the EXACT port number that was previously dead: the
 * provider's axios instance already has that address baked into its
 * `baseURL` and cannot be redirected mid-test.
 */
function startRecordingServerOnPort(port) {
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      records.push({ method: req.method ?? '', url: req.url ?? '', rawBody: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, receivedMethod: req.method, receivedUrl: req.url }));
    });
    req.on('error', () => {
      /* client-side abort must not crash the server */
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        records,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { resolveEntry, requireAbs, importAbs } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  /** Mounts <MinderDataProvider><Probe/></MinderDataProvider> and returns the mounted useMinder() box + unmount. */
  async function mountProviderHook(mdp, routeName, config) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder(routeName);
      return null;
    }
    const resolvedConfig = mdp.configureMinder(config);
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
    );
    await waitFor(() => box.current !== undefined, { timeout: 2000 });
    return { box, unmount };
  }

  // ── Cases 1 & 2 (required): real dead port -> reports failure AND
  //    enqueues -> queued request replays on sync against a real server ──
  {
    const deadPort = await getDeadPort();
    let unmount;
    let mgr;
    let mutateResult;
    let mountErr = null;

    try {
      const { box, unmount: u } = await mountProviderHook(mdpEsm, 'thing', {
        apiUrl: `http://127.0.0.1:${deadPort}`,
        routes: { thing: { method: 'POST', url: '/offline-things' } },
        offline: { enabled: true },
        performance: { retries: 0 },
      });
      unmount = u;
      mutateResult = await box.current.mutate({ title: 'hello' });
      mgr = mdpEsm.getOfflineManager();
    } catch (err) {
      mountErr = err?.message ?? String(err);
    }

    const queueSizeAfterFailure = mgr ? mgr.getQueueSize() : -1;
    const queuedEntry = mgr ? mgr.getQueue()[0] : undefined;
    const case1Pass =
      mountErr === null &&
      mutateResult != null &&
      mutateResult.success === false &&
      mutateResult.error != null &&
      queueSizeAfterFailure === 1 &&
      queuedEntry?.method === 'POST' &&
      queuedEntry?.url === '/offline-things';

    results.push({
      id: 'c3-provider-mutate-dead-port-reports-failure-and-enqueues',
      pass: case1Pass,
      message: case1Pass
        ? `mutate() against a REAL dead port reported success:false (error.code=${mutateResult?.error?.code}) AND getOfflineManager().getQueueSize()===1 with the queued request matching {method:'POST', url:'/offline-things'}`
        : `expected success:false + a matching queued entry; got mountErr=${mountErr} result=${JSON.stringify(mutateResult)} queueSizeAfterFailure=${queueSizeAfterFailure} queuedEntry=${JSON.stringify(queuedEntry)}`,
    });

    // Case 2: replay on sync against a REAL server bound to the same port.
    let realServer;
    let stats;
    let rec;
    let replayErr = null;
    if (case1Pass) {
      try {
        realServer = await startRecordingServerOnPort(deadPort);
        stats = await mgr.sync();
        rec = realServer.records[realServer.records.length - 1];
      } catch (err) {
        replayErr = err?.message ?? String(err);
      }
    }
    const case2Pass =
      case1Pass &&
      replayErr === null &&
      stats?.successful === 1 &&
      stats?.failed === 0 &&
      mgr.getQueueSize() === 0 &&
      !!rec &&
      rec.method === 'POST' &&
      rec.url === '/offline-things' &&
      rec.rawBody.includes('hello');

    results.push({
      id: 'c3-queued-request-replays-on-sync-against-real-server',
      pass: case2Pass,
      message: case2Pass
        ? `mgr.sync() replayed the queued request against a REAL server on reconnect: recorded ${JSON.stringify(rec)}, stats=${JSON.stringify(stats)}, queue drained to 0`
        : `replay did not complete cleanly (case1Pass=${case1Pass}): replayErr=${replayErr} stats=${JSON.stringify(stats)} queueSize=${mgr?.getQueueSize()} rec=${JSON.stringify(rec)}`,
    });

    if (realServer) await realServer.close().catch(() => {});
    if (unmount) unmount();
    if (mgr) await mgr.destroy?.().catch(() => {});
  }

  // ── Case 3 (hostile input / regression guard): the SAME dead-port failure
  //    with NO offline config must stay a plain NETWORK_ERROR, never silently
  //    start queueing an app that never opted in ──
  {
    const deadPort = await getDeadPort();
    let unmount;
    let mutateResult;
    let mountErr = null;

    try {
      const { box, unmount: u } = await mountProviderHook(mdpCjs, 'thing', {
        apiUrl: `http://127.0.0.1:${deadPort}`,
        routes: { thing: { method: 'POST', url: '/offline-things-no-config' } },
        performance: { retries: 0 },
        // deliberately NO `offline` config
      });
      unmount = u;
      mutateResult = await box.current.mutate({ title: 'hello' });
    } catch (err) {
      mountErr = err?.message ?? String(err);
    }

    const mgr = mdpCjs.getOfflineManager();
    const pass =
      mountErr === null &&
      mutateResult != null &&
      mutateResult.success === false &&
      mutateResult.error?.code === 'NETWORK_ERROR' &&
      (mgr === null || mgr.getQueueSize() === 0);

    results.push({
      id: 'c3-no-offline-config-dead-port-stays-plain-network-error',
      pass,
      message: pass
        ? `with NO offline config, a dead-port mutate() reported success:false with error.code===NETWORK_ERROR and did not start queueing (mgr=${mgr === null ? 'null' : `queueSize=${mgr.getQueueSize()}`})`
        : `expected a plain NETWORK_ERROR with no queueing; got mountErr=${mountErr} result=${JSON.stringify(mutateResult)} mgr=${mgr ? `queueSize=${mgr.getQueueSize()}` : 'null'}`,
    });

    if (unmount) unmount();
  }

  // ── Case 4 (hostile input): a GET route against a dead port, WITH offline
  //    enabled, must NOT be auto-queued — only mutations are queueable.
  //    Dispatched via mutate(undefined, { method: 'GET' }) rather than a
  //    route-level auto-fetch: an auto-fetched GET query goes through
  //    useQuery's own fetch machinery, which — independent of this fix,
  //    reproduced even with NO offline config at all — leaks an unhandled
  //    promise rejection under jsdom's XHR adapter on a real failed GET and
  //    crashes the Node process (a genuine, pre-existing defect outside C3's
  //    scope: src/core/apiClient/errors.ts / src/core/ApiClient.ts /
  //    src/platform/offline/**, not src/hooks/useMinder.ts). Routing this
  //    same GET-method invariant check through mutate() exercises the
  //    IDENTICAL classifyNoResponseError code path (method comes from the
  //    actual dispatched request, not the route's declared verb) via
  //    useMutation's try/catch, which does not exhibit that crash ──
  {
    const deadPort = await getDeadPort();
    let unmount;
    let mgr;
    let mutateResult;
    let mountErr = null;

    try {
      const { box, unmount: u } = await mountProviderHook(mdpEsm, 'thing', {
        apiUrl: `http://127.0.0.1:${deadPort}`,
        routes: { thing: { method: 'POST', url: '/offline-read' } },
        offline: { enabled: true },
        performance: { retries: 0 },
      });
      unmount = u;
      mutateResult = await box.current.mutate(undefined, { method: 'GET' });
      mgr = mdpEsm.getOfflineManager();
    } catch (err) {
      mountErr = err?.message ?? String(err);
    }

    const pass =
      mountErr === null &&
      mutateResult != null &&
      mutateResult.success === false &&
      mgr != null &&
      mgr.getQueueSize() === 0;
    results.push({
      id: 'c3-get-request-dead-port-is-not-auto-queued',
      pass,
      message: pass
        ? `a real dead-port GET (dispatched via mutate(undefined,{method:'GET'}), offline enabled) reported success:false (error.code=${mutateResult?.error?.code}) and getQueueSize()===0 — reads are never auto-queued`
        : `expected the GET failure to NOT be queued; got mountErr=${mountErr} result=${JSON.stringify(mutateResult)} queueSize=${mgr?.getQueueSize()}`,
    });

    if (unmount) unmount();
    if (mgr) await mgr.destroy?.().catch(() => {});
  }

  return results;
}
