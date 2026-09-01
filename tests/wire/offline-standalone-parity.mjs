/**
 * fix-a-app-router-crash-offline-parity (H1/H1b) — the offline auto-queue
 * wire contract for the STANDALONE `minder()` path.
 *
 * Reported defect, reproduced against the REAL BUILT dist before this fix
 * landed:
 *
 *   configureMinder({ apiUrl: 'http://127.0.0.1:1', offline: { enabled: true } });
 *   await minder('/things', { a: 1 });
 *     -> success:false, error.code 'NETWORK_ERROR', getOfflineManager().getQueueSize() === 0
 *
 * The IDENTICAL failure through `<MinderDataProvider>` + `useMinder().mutate()`
 * correctly reports `OFFLINE_ERROR` and queues (see
 * tests/wire/offline-contract.mjs's `c3-*` cases) — the tenth instance in
 * this release of the "works on the provider path, silently no-ops
 * standalone" defect shape (sanitization no-op, DELETE-body drop, six
 * credential-exfiltration channels, ...).
 *
 * Root cause: the standalone path's own error classifier
 * (core/minder/utils.ts's `handleError`) was a SECOND, independent
 * implementation of "is this a no-response failure" that never consulted
 * offline state at all. THE FIX: `handleError`'s no-response branch now
 * delegates to the SAME choke point the provider path already used
 * (apiClient/errors.ts's `buildApiError` / `classifyNoResponseError`),
 * reading the OfflineManager instance through the SAME registry
 * (platform/offline/registry.ts's `getActiveOfflineManager`) `ApiClient`
 * itself reads — so a standalone auto-queue lands in the EXACT instance
 * `configureMinder({ offline })` wired, not a second, disconnected one.
 * There is structurally nowhere left for the two paths to disagree.
 *
 * This driver proves the fix end-to-end against the REAL BUILT ARTIFACT
 * (packed tarball, installed into a scratch consumer) using a REAL dead TCP
 * port — never a mock, never an intercepted axios instance. Cases 1-4 mirror
 * tests/wire/offline-contract.mjs's C3 structure through the standalone
 * `minder()` call instead of `<MinderDataProvider>` + `useMinder().mutate()`.
 * Case 5 is the H1b "one shared choke point" proof: a standalone failure and
 * a provider failure, against the SAME `configureMinder`-wired instance,
 * land in the SAME queue — proving genuine convergence, not two
 * coincidentally-matching independent implementations.
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
 * axios instance already has that address baked into its `baseURL` and
 * cannot be redirected mid-test.
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
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  // ── Cases 1 & 2 (required): standalone minder() against a real dead port
  //    -> reports failure AND enqueues -> queued request replays on sync
  //    against a real server ──
  {
    const deadPort = await getDeadPort();
    mdpEsm.configureMinder({
      apiUrl: `http://127.0.0.1:${deadPort}`,
      routes: { thing: { method: 'POST', url: '/offline-things-standalone' } },
      offline: { enabled: true },
      performance: { retries: 0 },
    });

    const result = await mdpEsm.minder('thing', { title: 'hello' });
    const mgr = mdpEsm.getOfflineManager();
    const queueSizeAfterFailure = mgr ? mgr.getQueueSize() : -1;
    const queuedEntry = mgr ? mgr.getQueue()[0] : undefined;
    const case1Pass =
      result != null &&
      result.success === false &&
      result.error != null &&
      result.error.code === 'OFFLINE_ERROR' &&
      queueSizeAfterFailure === 1 &&
      queuedEntry?.method === 'POST' &&
      queuedEntry?.url === '/offline-things-standalone';

    results.push({
      id: 'osp-standalone-minder-dead-port-reports-failure-and-enqueues',
      pass: case1Pass,
      message: case1Pass
        ? `standalone minder() against a REAL dead port reported success:false (error.code=${result?.error?.code}) AND getOfflineManager().getQueueSize()===1 with the queued request matching {method:'POST', url:'/offline-things-standalone'}`
        : `expected success:false + error.code OFFLINE_ERROR + a matching queued entry; got result=${JSON.stringify(result)} queueSizeAfterFailure=${queueSizeAfterFailure} queuedEntry=${JSON.stringify(queuedEntry)}`,
    });

    // NOTE (discovered while building this driver, OUT OF H1/H1b's scope --
    // H1/H1b are about the ENQUEUE side, which case 1 above proves): unlike
    // the provider path (whose OfflineManager is wired with an ApiClient
    // `requestExecutor` that replays through a baseURL-aware axios instance
    // -- see tests/wire/offline-contract.mjs's replay case, which DOES
    // succeed), the standalone path has no executor wired, so
    // OfflineManager falls back to a bare `fetch(request.url, ...)`
    // (OfflineManager.ts's own comment: "no ApiClient wired — RN /
    // standalone"). The queued `url` is stored RELATIVE (matching the
    // provider path's existing, already-tested contract -- changing that
    // representation is a separate, riskier fix left for a follow-up task),
    // so a bare `fetch('/relative/path')` with no base throws "Failed to
    // parse URL". This case documents that KNOWN, pre-existing limitation
    // honestly (sync() must not crash/hang and must report a clean FAILED
    // stat, not silently drop the entry or throw out of sync() itself)
    // rather than asserting a replay success that does not actually happen
    // today.
    let realServer;
    let stats;
    let syncErr = null;
    if (case1Pass) {
      try {
        realServer = await startRecordingServerOnPort(deadPort);
        stats = await mgr.sync();
      } catch (err) {
        syncErr = err?.message ?? String(err);
      }
    }
    const case2Pass =
      case1Pass &&
      syncErr === null &&
      stats?.total === 1 &&
      stats?.successful === 0 &&
      stats?.failed === 1 &&
      Array.isArray(stats?.errors) &&
      stats.errors.length === 1 &&
      /parse url/i.test(String(stats.errors[0]?.error ?? '')) &&
      realServer.records.length === 0;

    results.push({
      id: 'osp-standalone-sync-fails-cleanly-without-baseurl-known-limitation',
      pass: case2Pass,
      message: case2Pass
        ? `mgr.sync() did NOT crash/hang for the standalone-queued (relative-URL) entry -- it reported a clean failed stat (${JSON.stringify(stats)}) instead of a raw exception; a real server on the same port saw ZERO requests. KNOWN LIMITATION (not H1/H1b): standalone has no baseURL-aware requestExecutor wired for replay, unlike the provider path (see tests/wire/offline-contract.mjs's passing replay case) -- flagged as a follow-up, not fixed here`
        : `expected sync() to fail CLEANLY with a single 'parse URL' error stat, not crash or silently succeed; got syncErr=${syncErr} stats=${JSON.stringify(stats)} realServerRecords=${realServer?.records?.length}`,
    });

    if (realServer) await realServer.close().catch(() => {});
    if (mgr) await mgr.destroy?.().catch(() => {});
  }

  // ── Case 3 (hostile input / regression guard): the SAME dead-port failure
  //    with NO offline config must stay a plain NETWORK_ERROR, never
  //    silently start queueing for a standalone caller that never opted in ──
  {
    const deadPort = await getDeadPort();
    mdpCjs.configureMinder({
      apiUrl: `http://127.0.0.1:${deadPort}`,
      routes: { thing: { method: 'POST', url: '/offline-things-standalone-no-config' } },
      performance: { retries: 0 },
      // deliberately NO `offline` config
    });

    const result = await mdpCjs.minder('thing', { title: 'hello' });
    const mgr = mdpCjs.getOfflineManager();
    const pass =
      result != null &&
      result.success === false &&
      result.error?.code === 'NETWORK_ERROR' &&
      (mgr === null || mgr.getQueueSize() === 0);

    results.push({
      id: 'osp-no-offline-config-standalone-dead-port-stays-plain-network-error',
      pass,
      message: pass
        ? `with NO offline config, a standalone dead-port minder() reported success:false with error.code===NETWORK_ERROR and did not start queueing (mgr=${mgr === null ? 'null' : `queueSize=${mgr.getQueueSize()}`})`
        : `expected a plain NETWORK_ERROR with no queueing; got result=${JSON.stringify(result)} mgr=${mgr ? `queueSize=${mgr.getQueueSize()}` : 'null'}`,
    });
  }

  // ── Case 4 (hostile input): a GET route against a dead port, WITH offline
  //    enabled, must NOT be auto-queued — only mutations are queueable ──
  {
    const deadPort = await getDeadPort();
    mdpEsm.configureMinder({
      apiUrl: `http://127.0.0.1:${deadPort}`,
      routes: { thing: { method: 'GET', url: '/offline-read-standalone' } },
      offline: { enabled: true },
      performance: { retries: 0 },
    });

    const result = await mdpEsm.minder('thing');
    const mgr = mdpEsm.getOfflineManager();
    const pass = result != null && result.success === false && mgr != null && mgr.getQueueSize() === 0;

    results.push({
      id: 'osp-get-request-standalone-dead-port-is-not-auto-queued',
      pass,
      message: pass
        ? `a real dead-port GET (standalone minder(), offline enabled) reported success:false (error.code=${result?.error?.code}) and getQueueSize()===0 — reads are never auto-queued`
        : `expected the GET failure to NOT be queued; got result=${JSON.stringify(result)} queueSize=${mgr?.getQueueSize()}`,
    });

    if (mgr) await mgr.destroy?.().catch(() => {});
  }

  // ── Case 5 (H1b — the "one shared choke point" proof): a standalone
  //    minder() failure and a <MinderDataProvider> + useMinder().mutate()
  //    failure, against the SAME configureMinder-wired instance, land in the
  //    SAME OfflineManager queue. Proves the two paths share ONE classifier
  //    and ONE OfflineManager instance — not two independently-matching
  //    implementations that happen to agree today and can silently drift
  //    apart again tomorrow (exactly how this defect shape has recurred nine
  //    times already this release) ──
  {
    const { setupDom, renderHeadless, waitFor } = ctx.react;
    const deadPort = await getDeadPort();
    const resolvedConfig = mdpEsm.configureMinder({
      apiUrl: `http://127.0.0.1:${deadPort}`,
      routes: {
        standaloneThing: { method: 'POST', url: '/offline-parity-standalone' },
        providerThing: { method: 'POST', url: '/offline-parity-provider' },
      },
      offline: { enabled: true },
      performance: { retries: 0 },
    });

    const standaloneResult = await mdpEsm.minder('standaloneThing', { a: 1 });

    const { React, ReactDOMClient, dom } = setupDom(scratchDir);
    const box = { current: undefined };
    function Probe() {
      box.current = mdpEsm.useMinder('providerThing');
      return null;
    }
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdpEsm.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
    );
    await waitFor(() => box.current !== undefined, { timeout: 2000 });
    const providerResult = await box.current.mutate({ b: 2 });

    const mgr = mdpEsm.getOfflineManager();
    const queue = mgr ? mgr.getQueue() : [];
    const pass =
      standaloneResult?.success === false &&
      providerResult?.success === false &&
      mgr != null &&
      queue.length === 2 &&
      queue.some((q) => q.url === '/offline-parity-standalone') &&
      queue.some((q) => q.url === '/offline-parity-provider');

    results.push({
      id: 'osp-standalone-and-provider-share-one-offline-manager-instance',
      pass,
      message: pass
        ? `standalone minder() (success:${standaloneResult?.success}) AND provider useMinder().mutate() (success:${providerResult?.success}) both failed against the SAME dead port and BOTH landed in the SAME OfflineManager queue (2 entries: ${JSON.stringify(queue.map((q) => q.url))}) — one shared choke point, not two independent implementations`
        : `expected both failures to share one queue of 2 entries; got standaloneResult=${JSON.stringify(standaloneResult)} providerResult=${JSON.stringify(providerResult)} queue=${JSON.stringify(queue)}`,
    });

    unmount();
    if (mgr) await mgr.destroy?.().catch(() => {});
  }

  return results;
}
