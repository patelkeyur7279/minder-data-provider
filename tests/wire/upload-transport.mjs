/**
 * BLOCKER 2 / HIGH (transport-and-packaging fix) — file upload transport
 * parity, driven against a REAL `node:http` server.
 *
 * BLOCKER 2 — file upload ignored `transport:'fetch'` and crashed bare
 * workerd. Root causes closed here:
 *   - PROVIDER path (ApiClient.dispatchNativeFetch): a FormData body reached
 *     the `JSON.stringify(requestConfig.data)` branch, stringifying it to
 *     the literal string '{}' — a broken, empty body, regardless of
 *     transport, the moment an upload was routed through native fetch.
 *   - STANDALONE `minder()` path: `isComplexRequest` (file upload /
 *     progress) unconditionally forced axios, even when the caller
 *     explicitly set `transport:'fetch'` — the exact "went through axios
 *     despite transport:'fetch' being set" symptom the report describes,
 *     and the SAME `JSON.stringify(FormData)` → '{}' bug in its own
 *     hand-rolled fetch branch once that override was lifted.
 * Both fixes route uploads through the SAME transport-selection/body-
 * building logic the ordinary (non-upload) request path already uses —
 * `dispatchNativeFetch` for the provider, the existing fetch branch for
 * standalone — rather than a second, upload-specific implementation.
 *
 * "Simulated bare workerd" cases follow the wave brief's own fallback
 * instruction verbatim (mirroring tests/wire/platform-contract.mjs's P2b):
 * real workerd is not available in this environment, so a stubbed global
 * `fetch` rejects any call whose `RequestInit` carries a `cache` field
 * (workerd's real, documented rejection of that field) and the case proves
 * the upload still completes — i.e. the dispatch never sets one. Flagged
 * here and in the report as a SIMULATION, not a real-workerd run.
 *
 * HIGH — Content-Type: application/json was dropped under the provider path
 * with `transport:'fetch'` (server received `text/plain;charset=UTF-8`)
 * while standalone `minder()` correctly sent `application/json` for the
 * SAME body/option. Root cause: `dispatchNativeFetch` never merged in the
 * axios INSTANCE's own default headers (Content-Type/Accept — see
 * ApiClient's constructor), which axios's own dispatch merges in
 * automatically but this transport bypasses entirely. Fixed by replicating
 * that merge inside `dispatchNativeFetch` itself.
 */
import net from 'node:net';

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

/** A small, real File — Node 20+'s global File/FormData (the same ones the built dist reads at runtime). */
function makeTestFile() {
  return new File(['hello upload contents'], 'upload-test.txt', { type: 'text/plain' });
}

function stubWorkerdFetch(realFetch) {
  return (url, init) => {
    if (init && Object.prototype.hasOwnProperty.call(init, 'cache')) {
      throw new TypeError("The 'cache' field on 'RequestInitializerDict' is not implemented.");
    }
    return realFetch(url, init);
  };
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireAbs, importAbs, resolveEntry } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  /** Mounts <MinderDataProvider>, calls useMinder('thing').upload.uploadFile(file), and unmounts. */
  async function mountProviderUpload(mdp, config, file) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder('thing');
      return null;
    }
    const resolvedConfig = mdp.configureMinder(config);
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
    );
    await waitFor(() => box.current !== undefined, { timeout: 2000 });
    try {
      return await box.current.upload.uploadFile(file);
    } finally {
      unmount();
    }
  }

  // ── BLOCKER 2a — provider upload honours transport:'fetch': real native
  //    fetch dispatch, real multipart round trip, axios's own dispatch never
  //    invoked. ──────────────────────────────────────────────────────────
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = (...args) => {
      fetchCallCount++;
      return realFetch(...args);
    };
    try {
      const result = await mountProviderUpload(
        mdpEsm,
        { apiUrl: recorder.baseUrl, routes: { thing: { method: 'POST', url: '/upload-fetch-transport' } }, transport: 'fetch' },
        makeTestFile(),
      );
      const rec = recorder.records[recorder.records.length - 1];
      const userAgent = rec?.headers?.['user-agent'] ?? '';
      const wentThroughAxios = /axios/i.test(userAgent);
      const contentType = (rec?.headers?.['content-type'] ?? '');
      const isMultipart = /multipart\/form-data;\s*boundary=/i.test(contentType);
      const bodyLooksReal =
        !!rec && rec.rawBody !== '{}' && rec.rawBody.includes('upload-test.txt') && rec.rawBody.includes('hello upload contents');
      const pass = fetchCallCount > 0 && !wentThroughAxios && !!rec && rec.method === 'POST' && isMultipart && bodyLooksReal && result != null;
      results.push({
        id: 'blocker2-provider-upload-honors-transport-fetch',
        pass,
        message: pass
          ? `provider upload under transport:'fetch' dispatched via native fetch() (${fetchCallCount} call(s)) with a real multipart body (content-type=${JSON.stringify(contentType)}) and no axios User-Agent on the wire`
          : `fetchCallCount=${fetchCallCount} userAgent=${JSON.stringify(userAgent)} contentType=${JSON.stringify(contentType)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // ── BLOCKER 2b — SIMULATED bare workerd: fetch stub rejects any
  //    RequestInit.cache field; the provider upload must still complete. ──
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    globalThis.fetch = stubWorkerdFetch(realFetch);
    try {
      const result = await mountProviderUpload(
        mdpCjs,
        { apiUrl: recorder.baseUrl, routes: { thing: { method: 'POST', url: '/upload-workerd-sim' } }, transport: 'fetch' },
        makeTestFile(),
      );
      const rec = recorder.records[recorder.records.length - 1];
      const bodyLooksReal = !!rec && rec.rawBody !== '{}' && rec.rawBody.includes('upload-test.txt');
      // NEGATIVE-CONTROL-DRIVEN HARDENING: a bare "did it complete" check
      // alone is too weak here — in a real Node test process axios's OWN
      // Node http adapter never touches `global.fetch` at all, so an upload
      // silently routed through axios instead of fetch would ALSO complete
      // successfully against this fetch stub (proven directly: reverting the
      // transport-selection fix and rerunning this suite left this exact
      // assertion passing on the pre-fix code). Asserting axios's own
      // `User-Agent: axios/<ver>` is ABSENT is what actually proves the
      // simulated-workerd fetch stub was reached at all — see the sibling
      // "honors-transport-fetch" case for the same reasoning.
      const userAgent = rec?.headers?.['user-agent'] ?? '';
      const wentThroughAxios = /axios/i.test(userAgent);
      const pass = !!rec && rec.method === 'POST' && !wentThroughAxios && bodyLooksReal && result != null;
      results.push({
        id: 'blocker2-provider-upload-simulated-workerd-completes',
        pass,
        message: pass
          ? "under a fetch stub that throws on any RequestInit.cache field (simulated workerd), a file upload through transport:'fetch' still completed a real multipart round trip via native fetch (no axios User-Agent) — the dispatch never sets 'cache'"
          : `simulated-workerd upload failed: userAgent=${JSON.stringify(userAgent)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // ── BLOCKER 2c — standalone minder() upload honours an EXPLICIT
  //    transport:'fetch' instead of always forcing axios. ────────────────
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = (...args) => {
      fetchCallCount++;
      return realFetch(...args);
    };
    try {
      mdpEsm.configureMinder({ apiUrl: recorder.baseUrl, routes: {} });
      const result = await mdpEsm.minder('/standalone-upload-fetch-transport', makeTestFile(), { transport: 'fetch' });
      const rec = recorder.records[recorder.records.length - 1];
      const userAgent = rec?.headers?.['user-agent'] ?? '';
      const wentThroughAxios = /axios/i.test(userAgent);
      const contentType = rec?.headers?.['content-type'] ?? '';
      const isMultipart = /multipart\/form-data;\s*boundary=/i.test(contentType);
      const bodyLooksReal = !!rec && rec.rawBody !== '{}' && rec.rawBody.includes('upload-test.txt');
      const pass = fetchCallCount > 0 && !wentThroughAxios && !!rec && isMultipart && bodyLooksReal && result?.success === true;
      results.push({
        id: 'blocker2-standalone-upload-honors-transport-fetch',
        pass,
        message: pass
          ? `standalone minder(url, file, {transport:'fetch'}) dispatched via native fetch() with a real multipart body (content-type=${JSON.stringify(contentType)}) and no axios User-Agent on the wire`
          : `fetchCallCount=${fetchCallCount} userAgent=${JSON.stringify(userAgent)} contentType=${JSON.stringify(contentType)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // ── BLOCKER 2d — SIMULATED bare workerd: standalone minder() upload. ───
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    globalThis.fetch = stubWorkerdFetch(realFetch);
    try {
      mdpCjs.configureMinder({ apiUrl: recorder.baseUrl, routes: {} });
      const result = await mdpCjs.minder('/standalone-upload-workerd-sim', makeTestFile(), { transport: 'fetch' });
      const rec = recorder.records[recorder.records.length - 1];
      const bodyLooksReal = !!rec && rec.rawBody !== '{}' && rec.rawBody.includes('upload-test.txt');
      // NEGATIVE-CONTROL-DRIVEN HARDENING (see the provider-side sibling
      // case's comment): axios's Node http adapter never touches
      // `global.fetch`, so this fetch stub alone cannot distinguish "used
      // native fetch" from "silently fell back to axios and never noticed
      // the stub" — proven directly by reverting `useFetch`'s explicit-
      // transport override and observing this exact assertion still pass on
      // the pre-fix code. The absent axios User-Agent is the real proof the
      // stub was reached.
      const userAgent = rec?.headers?.['user-agent'] ?? '';
      const wentThroughAxios = /axios/i.test(userAgent);
      const pass = !!rec && !wentThroughAxios && bodyLooksReal && result?.success === true;
      results.push({
        id: 'blocker2-standalone-upload-simulated-workerd-completes',
        pass,
        message: pass
          ? "under a fetch stub that throws on any RequestInit.cache field (simulated workerd), standalone minder(url, file, {transport:'fetch'}) still completed a real multipart round trip via native fetch (no axios User-Agent)"
          : `simulated-workerd standalone upload failed: userAgent=${JSON.stringify(userAgent)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // ── BLOCKER 2e — FAILURE PATH: provider upload under transport:'fetch'
  //    against a real dead port reports a clean failure — no crash, no hang,
  //    not the workerd-style RequestInit crash masquerading as something
  //    else. `apiClient.uploadFile()` rejects on failure (unlike mutate()'s
  //    MinderResult wrapping), so a caught, network-shaped rejection IS the
  //    documented clean-failure shape here. ──────────────────────────────
  {
    const deadPort = await getDeadPort();
    let threw = null;
    try {
      await mountProviderUpload(
        mdpEsm,
        { apiUrl: `http://127.0.0.1:${deadPort}`, routes: { thing: { method: 'POST', url: '/upload-dead' } }, transport: 'fetch' },
        makeTestFile(),
      );
    } catch (err) {
      threw = err?.message ?? String(err);
    }
    const looksLikeGenuineCrash = threw !== null && /cannot read propert|is not a function|is not defined|RequestInitializerDict/i.test(threw);
    const pass = threw !== null && !looksLikeGenuineCrash;
    results.push({
      id: 'blocker2-provider-upload-dead-port-clean-failure',
      pass,
      message: pass
        ? `provider upload under transport:'fetch' against a dead port reported a clean, network-shaped failure ("${threw}") — no crash`
        : `expected a clean network-shaped failure; got threw=${JSON.stringify(threw)}`,
    });
  }

  // ── HIGH — Content-Type: application/json parity: the provider path
  //    under transport:'fetch' must send the SAME Content-Type standalone
  //    minder() already sends for an identical plain-object JSON body. ────
  {
    const recorder = await ctx.startRecordingServer();
    try {
      const box = { current: undefined };
      function Probe() {
        box.current = mdpEsm.useMinder('thing');
        return null;
      }
      const resolvedConfig = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { thing: { method: 'POST', url: '/high-content-type-provider' } },
        transport: 'fetch',
      });
      const { unmount } = renderHeadless(
        ReactDOMClient,
        dom.window.document,
        React.createElement(mdpEsm.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
      );
      await waitFor(() => box.current !== undefined, { timeout: 2000 });
      let result;
      try {
        result = await box.current.mutate({ title: 'hello' });
      } finally {
        unmount();
      }
      const rec = recorder.records[recorder.records.length - 1];
      const contentType = (rec?.headers?.['content-type'] ?? '').toLowerCase();
      const pass = !!rec && contentType.startsWith('application/json') && result?.success === true;
      results.push({
        id: 'high-content-type-json-provider-fetch-matches-standalone',
        pass,
        message: pass
          ? `provider path under transport:'fetch' sent content-type: ${JSON.stringify(contentType)} for a plain JSON body — matches standalone minder()'s existing behaviour, not text/plain`
          : `expected content-type to start with 'application/json'; got ${JSON.stringify(contentType)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      await recorder.close();
    }
  }

  return results;
}
