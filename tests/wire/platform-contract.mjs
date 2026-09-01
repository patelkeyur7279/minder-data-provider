/**
 * P1 / P2 (fix-2.2.0-blockers) — platform defects.
 *
 * P1 — NEXT.JS APP ROUTER: `globalThis[undefined] = {}` in the cross-entry
 * singleton store (src/core/singletons.ts's `minderStore()`) whenever nothing
 * else in that route's module graph happened to have already run the
 * deferred esbuild chunk-init first. Root-caused by direct dist-chunk
 * inspection (see the wave report) — the empirically OBSERVED crash on the
 * pre-fix build, calling `minderStore()` with NOTHING else having run first,
 * was:
 *
 *   TypeError: Cannot assign to read only property 'undefined' of object '#<Object>'
 *
 * (`globalThis.undefined` is a spec-mandated non-writable global property —
 * `globalThis[o] ??= {}` with `o` undefined tries to WRITE it, which throws
 * in the strict-mode ESM chunk.) The fix computes the store's `Symbol.for`
 * key INSIDE `minderStore()` itself instead of a module-top-level `const`,
 * so there is no separate deferred initializer for a bundler to fail to
 * trigger — see singletons.ts for the full postmortem.
 *
 * The three P1 cases below each run in a FRESH CHILD `node` PROCESS — a
 * genuinely fresh module graph, with NOTHING else having imported/rendered
 * anything from this package first — because running them in-process
 * (sharing this suite's own process with every other driver, several of
 * which mount `<MinderDataProvider>` first) would make the singleton store
 * ALREADY populated by accident before these cases ever ran, exactly the
 * "happy path only" trap the packet warns about: a false PASS even on the
 * unfixed build. A fresh process is the only reliable way to simulate "no
 * provider (or anything else) ran earlier in this module graph."
 *
 * P2 — BARE CLOUDFLARE WORKERD: the provider's `ApiClient` was hard-wired to
 * axios, and the documented `transport:'fetch'` escape hatch (already
 * honored by standalone `minder()`) was silently ignored under a provider.
 * Fixed in ApiClient.ts: `transport:'fetch'` (or an auto-detected edge
 * runtime) now dispatches via native `fetch()` and never calls
 * `axiosInstance.request(...)`. These cases run in-process (no import-order
 * fragility here — the dispatch choice is a deterministic per-instance
 * decision, not a lazy-init race) and are driven against a REAL
 * `node:http` server, proving the native-fetch path actually completes a
 * real round trip, not just "didn't call axios."
 *
 * Real workerd is not available in this environment. P2's "simulated
 * workerd" case follows the wave brief's own fallback instruction verbatim:
 * stub global `fetch` to reject any call whose `RequestInit` carries a
 * `cache` field (workerd's real, documented rejection of that field) and
 * prove the native-fetch dispatch never sends one. This is a SIMULATION, not
 * a real-workerd run — flagged here and in the wave report.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Runs `scriptBody` in a FRESH, isolated `node` child process, with its
 * working directory (and therefore its ESM `node_modules` resolution root)
 * anchored at the scratch consumer — so `import 'minder-data-provider'`
 * resolves exactly the way a real consumer's own fresh process (e.g. a new
 * Next.js RSC request) would, with NOTHING preloaded. The script must print
 * exactly one line starting with `RESULT:` containing a JSON payload; this
 * is parsed and returned. A non-JSON/missing RESULT line, or a nonzero exit
 * with no RESULT line, is reported as a driver-level failure (the script
 * crashed before it could even report — itself evidence of the bug).
 *
 * Deliberately ASYNC (`execFile`, not `execFileSync`): several of these
 * probes make a REAL HTTP request back to a recording server living in THIS
 * (parent) process. A *synchronous* child-process call blocks this process's
 * entire event loop for its whole duration — the recording server could
 * never actually accept/answer the child's connection, and every case would
 * time out regardless of whether the underlying fix works (a false FAIL,
 * the mirror image of the "happy path only" trap: a test that can't
 * possibly pass either way is exactly as useless as one that always passes).
 */
function runFreshProcess(scratchDir, scriptBody) {
  const scriptPath = join(scratchDir, `.p1-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(scriptPath, scriptBody, 'utf8');
  return new Promise((resolve) => {
    execFile('node', [scriptPath], { cwd: scratchDir, encoding: 'utf8', timeout: 15000 }, (err, stdout, stderr) => {
      const crashed = !!err;
      const resultLine = (stdout || '').split('\n').find((line) => line.startsWith('RESULT:'));
      if (!resultLine) {
        resolve({ crashed: true, stderr: stderr || err?.message || '', stdout: stdout || '', result: null });
        return;
      }
      try {
        resolve({ crashed, stderr: stderr || '', stdout, result: JSON.parse(resultLine.slice('RESULT:'.length)) });
      } catch {
        resolve({ crashed: true, stderr: `RESULT line was not valid JSON: ${resultLine}`, stdout, result: null });
      }
    });
  });
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireAbs, importAbs, resolveEntry } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  // ── P1 — fresh-process cases ──────────────────────────────────────────

  // P1a: standalone (server-side) minder(), no provider, HAPPY PATH — proves
  // it completes a real round trip against a real HTTP server from a
  // completely fresh module graph.
  {
    const recorder = await ctx.startRecordingServer();
    try {
      const { result, crashed, stderr } = await runFreshProcess(
        scratchDir,
        `
        import { minder, configureMinder } from 'minder-data-provider';
        configureMinder({ apiUrl: ${JSON.stringify(recorder.baseUrl)}, routes: {} });
        const result = await minder('/p1-probe', undefined, { method: 'GET', timeout: 3000 });
        console.log('RESULT:' + JSON.stringify({ success: result.success, errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null }));
        process.exit(0);
        `,
      );
      const pass = !crashed && result?.success === true && result?.errorCode === null && recorder.records.length > 0;
      results.push({
        id: 'p1-nextjs-server-minder-no-provider-succeeds',
        pass,
        message: pass
          ? 'standalone minder(), called first thing in a fresh process with nothing else having run, completed a real round trip'
          : `standalone minder() in a fresh process did not complete cleanly: crashed=${crashed} result=${JSON.stringify(result)} stderr=${stderr}`,
      });
    } finally {
      await recorder.close();
    }
  }

  // P1b: standalone minder(), no provider, FAILURE PATH — against a real
  // dead port, from a fresh process. Must report a genuine NETWORK_ERROR,
  // never the singleton-store TypeError masquerading as an UNKNOWN_ERROR.
  {
    const deadPort = await getDeadPort();
    const { result, crashed, stderr } = await runFreshProcess(
      scratchDir,
      `
      import { minder, configureMinder } from 'minder-data-provider';
      configureMinder({ apiUrl: 'http://127.0.0.1:${deadPort}', routes: {} });
      const result = await minder('/p1-probe', undefined, { method: 'GET', timeout: 2000 });
      console.log('RESULT:' + JSON.stringify({ success: result.success, errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null }));
      process.exit(0);
      `,
    );
    const msg = String(result?.errorMessage ?? '');
    const looksLikeSingletonCrash = /read only property|globalThis|undefined/i.test(msg) && result?.errorCode !== 'NETWORK_ERROR';
    const pass = !crashed && result?.success === false && result?.errorCode === 'NETWORK_ERROR' && !looksLikeSingletonCrash;
    results.push({
      id: 'p1-nextjs-server-minder-no-provider-dead-port-clean-network-error',
      pass,
      message: pass
        ? 'standalone minder() against a dead port, from a fresh process, reported a clean NETWORK_ERROR — not the singleton-store crash'
        : `expected a clean NETWORK_ERROR; got crashed=${crashed} result=${JSON.stringify(result)} stderr=${stderr}`,
    });
  }

  // P1c: useAuthToken(), no <MinderDataProvider> ancestor, from a fresh
  // process — README's documented standalone pattern.
  {
    const { result, crashed, stderr } = await runFreshProcess(
      scratchDir,
      `
      import { JSDOM } from 'jsdom';
      const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
      globalThis.HTMLElement = dom.window.HTMLElement;
      globalThis.customElements = dom.window.customElements;
      globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      globalThis.cancelAnimationFrame = clearTimeout;

      const React = await import('react');
      const { createRoot } = await import('react-dom/client');
      const { useAuthToken } = await import('minder-data-provider');

      let hookResult, threw = null;
      function Probe() {
        try { hookResult = useAuthToken(); } catch (e) { threw = e.message; }
        return null;
      }
      const container = document.getElementById('root');
      const root = createRoot(container);
      const origErr = console.error;
      console.error = () => {};
      root.render(React.createElement(Probe));
      await new Promise((r) => setTimeout(r, 50));
      console.error = origErr;
      console.log('RESULT:' + JSON.stringify({ threw, isLoggedIn: hookResult?.isLoggedIn ?? null }));
      process.exit(0);
      `,
    );
    const pass = !crashed && result?.threw === null && result?.isLoggedIn === false;
    results.push({
      id: 'p1-nextjs-useauthtoken-no-provider-no-crash',
      pass,
      message: pass
        ? 'useAuthToken(), rendered with no provider in a fresh module graph, did not throw and returned isLoggedIn:false'
        : `useAuthToken() in a fresh process did not behave cleanly: crashed=${crashed} result=${JSON.stringify(result)} stderr=${stderr}`,
    });
  }

  // P1d: zero-config useMinder(url), no configureMinder, no provider, from a
  // fresh process — the README's headline example.
  {
    const recorder = await ctx.startRecordingServer();
    try {
      const { result, crashed, stderr } = await runFreshProcess(
        scratchDir,
        `
        import { JSDOM } from 'jsdom';
        const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
        globalThis.window = dom.window;
        globalThis.document = dom.window.document;
        Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
        globalThis.HTMLElement = dom.window.HTMLElement;
        globalThis.customElements = dom.window.customElements;
        globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        globalThis.cancelAnimationFrame = clearTimeout;

        const React = await import('react');
        const { createRoot } = await import('react-dom/client');
        const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
        const { useMinder } = await import('minder-data-provider');

        let box = { current: undefined };
        let threw = null;
        function Probe() {
          try { box.current = useMinder(${JSON.stringify(recorder.baseUrl + '/p1-probe')}); }
          catch (e) { threw = e.message; }
          return null;
        }
        const container = document.getElementById('root');
        const root = createRoot(container);
        const client = new QueryClient();
        const origErr = console.error;
        console.error = () => {};
        root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
        const start = Date.now();
        while (Date.now() - start < 3000 && !(box.current && (box.current.data || box.current.error))) {
          await new Promise((r) => setTimeout(r, 25));
        }
        console.error = origErr;
        console.log('RESULT:' + JSON.stringify({ threw, hasData: !!box.current?.data, hasError: !!box.current?.error }));
        process.exit(0);
        `,
      );
      const pass = !crashed && result?.threw === null && result?.hasData === true && recorder.records.length > 0;
      results.push({
        id: 'p1-nextjs-zero-config-usemander-no-provider-no-crash',
        pass,
        message: pass
          ? 'zero-config useMinder(url), no provider, in a fresh module graph, rendered and fetched real data with no crash'
          : `zero-config useMinder() in a fresh process did not behave cleanly: crashed=${crashed} result=${JSON.stringify(result)} stderr=${stderr}`,
      });
    } finally {
      await recorder.close();
    }
  }

  // ── P2 — in-process cases (deterministic dispatch selection, no import-
  //    order fragility) ────────────────────────────────────────────────
  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  async function mountProviderMutate(mdp, config, data) {
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
      return await box.current.mutate(data);
    } finally {
      unmount();
    }
  }

  // P2a: transport:'fetch' HONORED under a provider — real fetch dispatch,
  // real round trip, axios's own request dispatch never invoked.
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = (...args) => {
      fetchCallCount++;
      return realFetch(...args);
    };
    try {
      const result = await mountProviderMutate(
        mdpEsm,
        { apiUrl: recorder.baseUrl, routes: { thing: { method: 'POST', url: '/p2-fetch-transport' } }, transport: 'fetch' },
        { title: 'hello' },
      );
      const rec = recorder.records[recorder.records.length - 1];
      // Wire-level, spy-independent proof of WHICH transport actually
      // dispatched: axios always stamps its own `User-Agent: axios/<ver>`
      // (setupInterceptors / axios's own adapters) — this dispatch never
      // sets one, so its absence is direct evidence the request went out
      // through native fetch, not axios's request/response pipeline.
      const userAgent = rec?.headers?.['user-agent'] ?? '';
      const wentThroughAxios = /axios/i.test(userAgent);
      const pass =
        fetchCallCount > 0 &&
        !wentThroughAxios &&
        !!rec &&
        rec.method === 'POST' &&
        rec.rawBody.includes('hello') &&
        result?.success === true;
      results.push({
        id: 'p2-transport-fetch-honored-under-provider',
        pass,
        message: pass
          ? `transport:'fetch' under a provider dispatched via native fetch() (${fetchCallCount} call(s) observed) with no axios User-Agent on the wire, and completed a real round trip`
          : `fetchCallCount=${fetchCallCount} userAgent=${JSON.stringify(userAgent)} rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // P2b: SIMULATED workerd — stub fetch rejects any call carrying a
  // RequestInit `cache` field (workerd's real, documented behavior); proves
  // the native-fetch dispatch's RequestInit never sets one. Explicitly a
  // simulation — see file header and the wave report.
  {
    const recorder = await ctx.startRecordingServer();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      if (init && Object.prototype.hasOwnProperty.call(init, 'cache')) {
        throw new TypeError("The 'cache' field on 'RequestInitializerDict' is not implemented.");
      }
      return realFetch(url, init);
    };
    try {
      const result = await mountProviderMutate(
        mdpCjs,
        { apiUrl: recorder.baseUrl, routes: { thing: { method: 'POST', url: '/p2-workerd-sim' } }, transport: 'fetch' },
        { title: 'hello' },
      );
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'POST' && result?.success === true;
      results.push({
        id: 'p2-transport-fetch-simulated-workerd-rejects-cache-field',
        pass,
        message: pass
          ? "under a fetch stub that throws on any RequestInit.cache field (simulated workerd), transport:'fetch' still completed a real round trip — the dispatch never sets 'cache'"
          : `simulated-workerd request failed: rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
      });
    } finally {
      globalThis.fetch = realFetch;
      await recorder.close();
    }
  }

  // P2c: FAILURE PATH — transport:'fetch' under a provider against a real
  // dead port must report a clean failure, not crash / hang / unhandled
  // rejection.
  {
    const deadPort = await getDeadPort();
    let result;
    let threw = null;
    try {
      result = await mountProviderMutate(
        mdpEsm,
        { apiUrl: `http://127.0.0.1:${deadPort}`, routes: { thing: { method: 'POST', url: '/p2-dead' } }, transport: 'fetch' },
        { title: 'hello' },
      );
    } catch (e) {
      threw = e?.message ?? String(e);
    }
    const pass = threw === null && result != null && result.success === false && result.error != null;
    results.push({
      id: 'p2-transport-fetch-dead-port-reports-clean-network-error',
      pass,
      message: pass
        ? "transport:'fetch' under a provider against a dead port reported a clean failure result, no crash"
        : `expected a clean failure result; got threw=${threw} result=${JSON.stringify(result)}`,
    });
  }

  return results;
}
