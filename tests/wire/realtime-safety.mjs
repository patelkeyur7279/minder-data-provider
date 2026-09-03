/**
 * N3 (adversarial re-probe, fix-2.2.0-blockers) — `useWebSocket().connect()`
 * failure CRASHES a Node host process via an unhandled promise rejection,
 * reproduced against a REAL dead port (same bug class as F5 — see
 * query-failure-safety.mjs — but for the realtime/WebSocket path instead of
 * the GET auto-fetch path).
 *
 * ROOT CAUSE: `WebSocketManager.connect()` (src/core/WebSocketManager.ts)
 * builds `new Promise((resolve, reject) => { ... })` and returns it as-is.
 * The public hook `useWebSocket()` (src/hooks/index.ts) did
 * `connect: () => rt?.connect()` — handing the SAME promise straight back to
 * the caller with no handler attached anywhere in the chain. A consumer that
 * fires `connect()` without itself `.catch()`-ing or `await`-ing it (a very
 * common "fire and forget" pattern, e.g. `<button onClick={connect}>`) left
 * that promise's eventual rejection (a real ECONNREFUSED against a dead
 * port, a restarted server, a network blip, ...) with NO handler at all —
 * Node's default `unhandledRejection` behavior (mode `'throw'` since Node 15)
 * terminates the process outright on nothing more than one failed realtime
 * connection attempt.
 *
 * FIX: both `WebSocketManager.connect()` and the hook's `connect()` wrapper
 * now attach a permanent, silent no-op `.catch()` directly to the promise
 * they hand back BEFORE returning it — this does not swallow or redirect the
 * rejection for a caller that DOES attach its own `.catch()`/`await` (every
 * handler attached to a promise fires independently when it settles); it
 * only guarantees at least one handler exists so Node/browsers never
 * classify the settlement as "unhandled".
 *
 * This suite proves BOTH halves against a real dead port:
 *   1. DISCARDED path: calling `connect()` and dropping the returned promise
 *      (the exact hostile pattern from the bug report) must NOT crash the
 *      process.
 *   2. CAUGHT path: a caller that DOES attach `.catch()` to the same
 *      `connect()` call must still observe the real rejection — proving the
 *      internal safety net doesn't mask genuine failures from a caller who
 *      wants to handle them.
 *
 * WHY THIS MUST RUN IN AN ISOLATED CHILD PROCESS: an unhandled rejection in
 * THIS process would kill scripts/wire/run.mjs itself mid-suite (exactly the
 * severity being tested), taking every other driver's results down with it.
 * `execFileSync` isolates the crash to a throwaway child — if the child dies
 * (non-zero exit, a signal, or a timeout because it hung instead of
 * completing), the PARENT (this file, running inside the main wire-suite
 * process) observes that failure safely and records it as a FAILING case
 * instead of also going down. No `process.on('unhandledRejection', ...)`
 * handler is installed in the child — the goal is to observe Node's REAL
 * default behavior for this library's own promise handling, not to mask it.
 *
 * Node's own global `WebSocket` (undici-backed, stable since Node 21) is what
 * actually dials the dead port here — no mocking of the WebSocket transport
 * itself, exactly like query-failure-safety.mjs uses a real dead TCP port
 * rather than a mocked axios/fetch failure.
 */
import { execFileSync } from 'node:child_process';
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

export async function run(ctx) {
  const results = [];
  results.push(...(await runWebSocketCase(ctx)));
  results.push(...(await runSseDirectCase(ctx)));
  results.push(...(await runSseContextCase(ctx)));
  results.push(...(await runWebSocketClientDirectCase(ctx)));
  return results;
}

async function runWebSocketCase(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];
  const discardedId = 'n3-ws-connect-dead-port-discarded-no-unhandled-rejection-no-crash';
  const caughtId = 'n3-ws-connect-dead-port-caught-still-rejects';

  try {
    // Sanity: throws here (a driver-level error, not a silent skip) if the
    // scratch install is somehow broken, before handing off to the CHILD.
    requireFromScratch(scratchDir, 'minder-data-provider/package.json');
    requireFromScratch(scratchDir, 'jsdom/package.json');
    requireFromScratch(scratchDir, 'react/package.json');

    const deadPort = await getDeadPort();

    const childScript = `
      const path = require('path');
      const scratchDir = ${JSON.stringify(scratchDir)};
      const resolveFromScratch = (spec) => require.resolve(spec, { paths: [scratchDir] });

      const pkgRoot = path.dirname(resolveFromScratch('minder-data-provider/package.json'));
      const pkg = require(path.join(pkgRoot, 'package.json'));
      const entry = path.join(pkgRoot, pkg.exports['.'].require);
      const mdp = require(entry);

      // Mirrors scripts/wire/lib/react-harness.mjs's setupDom() — every
      // module here MUST resolve from the SAME scratch node_modules the
      // installed package resolves its own react peer-import from, or React
      // ends up with two separate module instances ("Invalid hook call").
      // Deliberately NOT copying a 'WebSocket' global onto globalThis here:
      // Node's own native WebSocket (undici-backed) is what must be
      // exercised — the whole point is a REAL dead-port dial, not a mock.
      const { JSDOM } = require(resolveFromScratch('jsdom'));
      const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
      globalThis.HTMLElement = dom.window.HTMLElement;
      globalThis.customElements = dom.window.customElements;
      globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
      globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
      globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || clearTimeout;

      const React = require(resolveFromScratch('react'));
      const ReactDOMClient = require(resolveFromScratch('react-dom/client'));

      // Deliberately NO process.on('unhandledRejection', ...) handler — see
      // this file's header comment. If the bug is present, Node's own
      // default behavior kills this child process before it ever reaches
      // the JSON.stringify(out) below, and the PARENT observes that via a
      // non-zero exit / signal from execFileSync.

      const config = mdp.configureMinder({
        apiUrl: 'http://127.0.0.1:${deadPort}',
        websocket: { url: 'ws://127.0.0.1:${deadPort}', reconnect: false },
      });

      const box = { current: undefined };
      function Probe() {
        box.current = mdp.useWebSocket();
        return null;
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = ReactDOMClient.createRoot(container);
      root.render(React.createElement(mdp.MinderDataProvider, { config }, React.createElement(Probe)));

      setTimeout(() => {
        // PHASE 1 (the bug report's exact hostile pattern): call connect()
        // and DROP the returned promise — no .catch(), no await, nothing.
        box.current.connect();

        setTimeout(() => {
          // PHASE 2: the SAME call pattern, but this time the caller DOES
          // attach its own .catch() — must still observe the real rejection,
          // proving the internal safety net doesn't mask genuine failures.
          let caughtRejected = false;
          let caughtMessage = null;
          const p = box.current.connect();
          const caughtPromise = p
            ? p.then(
                () => { caughtRejected = false; },
                (err) => { caughtRejected = true; caughtMessage = String(err && err.message || err); }
              )
            : Promise.resolve();

          caughtPromise.finally(() => {
            const out = {
              hasWindow: typeof window !== 'undefined',
              discardedSurvived: true, // reaching this line at all proves it
              gotConnectPromise: !!p,
              caughtRejected,
              caughtMessage,
            };
            process.stdout.write(JSON.stringify(out));
            process.exit(0);
          });
        }, 1500);
      }, 250);
    `;

    let stdout = null;
    let crashed = false;
    let crashDetail = '';
    try {
      stdout = execFileSync(process.execPath, ['-e', childScript], {
        encoding: 'utf8',
        timeout: 15000,
        killSignal: 'SIGKILL',
        // CRITICAL: see query-failure-safety.mjs's header comment for why
        // `cwd` must be the SCRATCH consumer, never the repo root (self-
        // reference resolution would otherwise silently pull in the repo's
        // own unpacked dist/ and a second React module instance).
        cwd: scratchDir,
      });
    } catch (err) {
      crashed = true;
      crashDetail =
        (err?.signal ? `killed by signal ${err.signal}` : `exit code ${err?.status}`) +
        (err?.stderr ? ` — stderr: ${String(err.stderr).slice(0, 800)}` : '');
    }

    if (crashed) {
      results.push({
        id: discardedId,
        pass: false,
        message: `child process CRASHED on a discarded WebSocket connect() against a real dead port (${crashDetail}) — an unhandled rejection in the realtime path took the whole process down`,
      });
      results.push({
        id: caughtId,
        pass: false,
        message: `driver could not evaluate the caught-path — the child process already crashed on the discarded-path (${crashDetail})`,
      });
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        results.push({
          id: discardedId,
          pass: false,
          message: `child process exited cleanly but produced unparsable output: ${JSON.stringify(stdout)} (${e?.message ?? e})`,
        });
        results.push({
          id: caughtId,
          pass: false,
          message: `driver could not evaluate the caught-path — output was unparsable`,
        });
        parsed = undefined;
      }
      if (parsed) {
        const survived = parsed.hasWindow === true && parsed.discardedSurvived === true;
        results.push({
          id: discardedId,
          pass: survived,
          message: survived
            ? 'child process survived a DISCARDED WebSocket connect() promise against a real dead port with NO unhandled rejection'
            : `child process did not crash, but did not reach the expected checkpoint: ${JSON.stringify(parsed)}`,
        });

        const caughtOk = survived && parsed.gotConnectPromise === true && parsed.caughtRejected === true && !!parsed.caughtMessage;
        results.push({
          id: caughtId,
          pass: caughtOk,
          message: caughtOk
            ? `a caller that DOES attach .catch() to connect() still observes the real dead-port rejection (error: "${parsed.caughtMessage}") — the internal safety net does not mask genuine failures`
            : `expected connect() to still hand back a promise that rejects for an explicit .catch(); got ${JSON.stringify(parsed)}`,
        });
      }
    }
  } catch (err) {
    results.push({
      id: discardedId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
    results.push({
      id: caughtId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  return results;
}

/**
 * N3 re-audit (fix-2.2.0-blockers, FIX-B): `SseTransport` (src/core/realtime/SseTransport.ts)
 * is exported DIRECTLY from the `minder-data-provider/realtime` subpath
 * (src/core/realtime/index.ts) — a consumer can `new SseTransport(cfg, authManager)`
 * and call `.connect()` with ZERO hook and ZERO `MinderContext` in between.
 * `useWebSocket()`'s guard (src/hooks/index.ts) never runs on this path, and
 * before this fix `SseTransport.connect()` itself had no internal guard
 * either (unlike `WebSocketManager.connect()`, which already did) — so a
 * discarded `connect()` against a real dead port produced the identical
 * process-killing unhandled rejection as the pre-fix WS case above, just via
 * a completely different, hook-free entry point.
 *
 * `reconnect: { maxAttempts: 1 }` forces the FIRST connection failure to be
 * terminal (`giveUp()` → `failInitial()` → reject) instead of silently
 * backing off — this is what makes both phases deterministic and fast rather
 * than waiting out real reconnect backoff.
 */
async function runSseDirectCase(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];
  const discardedId = 'n3-sse-transport-direct-connect-dead-port-discarded-no-crash';
  const caughtId = 'n3-sse-transport-direct-connect-dead-port-caught-still-rejects';

  try {
    requireFromScratch(scratchDir, 'minder-data-provider/package.json');

    const deadPort = await getDeadPort();

    const childScript = `
      const path = require('path');
      const scratchDir = ${JSON.stringify(scratchDir)};
      const resolveFromScratch = (spec) => require.resolve(spec, { paths: [scratchDir] });

      const pkgRoot = path.dirname(resolveFromScratch('minder-data-provider/package.json'));
      const pkg = require(path.join(pkgRoot, 'package.json'));
      // Deliberately the './realtime' subpath, NOT the root entry — this is
      // the exact hook-free, context-free import path a consumer would use.
      const realtimeEntry = path.join(pkgRoot, pkg.exports['./realtime'].require);
      const { SseTransport } = require(realtimeEntry);

      const config = {
        url: 'http://127.0.0.1:${deadPort}/sse',
        auth: false, // never touches authManager — a bare stub object is fine below
        reconnect: { maxAttempts: 1, baseDelayMs: 50, maxDelayMs: 1000, jitter: false },
        stallTimeoutMs: 45000,
        lastEventIdHeader: 'Last-Event-ID',
        withCredentials: false,
      };

      // Deliberately NO process.on('unhandledRejection', ...) handler — see
      // the header comment above runWebSocketCase for why: the goal is to
      // observe Node's REAL default behavior, not mask it.

      // PHASE 1 (the bug report's exact hostile pattern): construct directly
      // and call connect(), DROP the returned promise entirely.
      const transport1 = new SseTransport(config, {}, undefined, false);
      transport1.connect();

      setTimeout(() => {
        // PHASE 2: a FRESH instance, same call pattern, but this caller DOES
        // attach its own rejection handler — must still observe the real
        // dead-port failure.
        const transport2 = new SseTransport(config, {}, undefined, false);
        let caughtRejected = false;
        let caughtMessage = null;
        const p = transport2.connect();
        const caughtPromise = p
          ? p.then(
              () => { caughtRejected = false; },
              (err) => { caughtRejected = true; caughtMessage = String(err && err.message || err); }
            )
          : Promise.resolve();

        caughtPromise.finally(() => {
          const out = {
            discardedSurvived: true, // reaching this line at all proves it
            gotConnectPromise: !!p,
            caughtRejected,
            caughtMessage,
          };
          process.stdout.write(JSON.stringify(out));
          process.exit(0);
        });
      }, 1500);
    `;

    let stdout = null;
    let crashed = false;
    let crashDetail = '';
    try {
      stdout = execFileSync(process.execPath, ['-e', childScript], {
        encoding: 'utf8',
        timeout: 15000,
        killSignal: 'SIGKILL',
        cwd: scratchDir,
      });
    } catch (err) {
      crashed = true;
      crashDetail =
        (err?.signal ? `killed by signal ${err.signal}` : `exit code ${err?.status}`) +
        (err?.stderr ? ` — stderr: ${String(err.stderr).slice(0, 800)}` : '');
    }

    if (crashed) {
      results.push({
        id: discardedId,
        pass: false,
        message: `child process CRASHED on a discarded direct SseTransport.connect() against a real dead port (${crashDetail}) — an unhandled rejection in the hook-free SSE path took the whole process down`,
      });
      results.push({
        id: caughtId,
        pass: false,
        message: `driver could not evaluate the caught-path — the child process already crashed on the discarded-path (${crashDetail})`,
      });
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        results.push({
          id: discardedId,
          pass: false,
          message: `child process exited cleanly but produced unparsable output: ${JSON.stringify(stdout)} (${e?.message ?? e})`,
        });
        results.push({
          id: caughtId,
          pass: false,
          message: `driver could not evaluate the caught-path — output was unparsable`,
        });
        parsed = undefined;
      }
      if (parsed) {
        const survived = parsed.discardedSurvived === true;
        results.push({
          id: discardedId,
          pass: survived,
          message: survived
            ? 'child process survived a DISCARDED direct SseTransport.connect() promise against a real dead port with NO unhandled rejection'
            : `child process did not crash, but did not reach the expected checkpoint: ${JSON.stringify(parsed)}`,
        });

        const caughtOk = survived && parsed.gotConnectPromise === true && parsed.caughtRejected === true && !!parsed.caughtMessage;
        results.push({
          id: caughtId,
          pass: caughtOk,
          message: caughtOk
            ? `a caller that DOES attach .catch() to the direct SseTransport.connect() still observes the real dead-port rejection (error: "${parsed.caughtMessage}") — the internal safety net does not mask genuine failures`
            : `expected connect() to still hand back a promise that rejects for an explicit .catch(); got ${JSON.stringify(parsed)}`,
        });
      }
    }
  } catch (err) {
    results.push({
      id: discardedId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
    results.push({
      id: caughtId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  return results;
}

/**
 * N3 re-audit (fix-2.2.0-blockers, FIX-B): the SAME bug class, but for
 * `LazySseTransport` (src/core/realtime/LazySseTransport.ts) reached the way
 * the architect's finding named EXACTLY: "reachable via
 * useMinderContext().realtimeManager.connect() which bypasses the hook guard
 * entirely." `useWebSocket()` (src/hooks/index.ts) attaches its own `.catch()`
 * to whatever `rt.connect()` hands back, but a consumer reading
 * `realtimeManager` straight off `useMinderContext()` and calling `.connect()`
 * on it skips that hook completely — the guard has to live inside
 * `LazySseTransport.connect()` itself (and it now does).
 *
 * `<MinderDataProvider>` is configured with `realtime: { transport: 'sse' }`,
 * which (per src/core/realtime/selectTransport.ts) makes `realtimeManager` a
 * `LazySseTransport` — never a `WebSocketManager` — proving this exercises the
 * lazy-loaded SSE class specifically, not the already-fixed WS path.
 */
async function runSseContextCase(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];
  const discardedId = 'n3-sse-context-realtimemanager-connect-dead-port-discarded-no-crash';
  const caughtId = 'n3-sse-context-realtimemanager-connect-dead-port-caught-still-rejects';

  try {
    requireFromScratch(scratchDir, 'minder-data-provider/package.json');
    requireFromScratch(scratchDir, 'jsdom/package.json');
    requireFromScratch(scratchDir, 'react/package.json');

    const deadPort = await getDeadPort();

    const childScript = `
      const path = require('path');
      const scratchDir = ${JSON.stringify(scratchDir)};
      const resolveFromScratch = (spec) => require.resolve(spec, { paths: [scratchDir] });

      const pkgRoot = path.dirname(resolveFromScratch('minder-data-provider/package.json'));
      const pkg = require(path.join(pkgRoot, 'package.json'));
      const entry = path.join(pkgRoot, pkg.exports['.'].require);
      const mdp = require(entry);

      const { JSDOM } = require(resolveFromScratch('jsdom'));
      const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
      globalThis.HTMLElement = dom.window.HTMLElement;
      globalThis.customElements = dom.window.customElements;
      globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
      globalThis.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
      globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame || clearTimeout;

      const React = require(resolveFromScratch('react'));
      const ReactDOMClient = require(resolveFromScratch('react-dom/client'));

      // Deliberately NO process.on('unhandledRejection', ...) handler.

      // Hand-built MinderConfig — NOT routed through configureMinder(). Its
      // WEB preset unconditionally injects a default 'websocket' block and
      // has no 'realtime' handling at all (src/config/index.ts never reads
      // userConfig.realtime), so selectRealtimeTransport() would see
      // config.websocket set and pick 'ws' regardless of what's asked for
      // here — a separate gap reported alongside this fix, not this suite's
      // concern. <MinderDataProvider config={...}> documents accepting a
      // hand-built MinderConfig directly (llms.txt; same pattern already
      // proven by the N4 hand-built-config cases in method-contract.mjs), and
      // MinderDataProvider.tsx uses it as 'finalConfig' verbatim (no
      // 'environments' key here, so no environmentManager rewrite either) —
      // this is the one reliable way to actually select transport:'sse'.
      const config = {
        apiBaseUrl: 'http://127.0.0.1:${deadPort}',
        routes: {},
        realtime: {
          transport: 'sse',
          url: 'http://127.0.0.1:${deadPort}/sse',
          auth: false,
          reconnect: { maxAttempts: 1, baseDelayMs: 50, maxDelayMs: 1000, jitter: false },
        },
      };

      const box = { current: undefined };
      function Probe() {
        // Direct useMinderContext() access — NOT useWebSocket(). This is the
        // exact bypass the architect's finding names.
        box.current = mdp.useMinderContext();
        return null;
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = ReactDOMClient.createRoot(container);
      root.render(React.createElement(mdp.MinderDataProvider, { config }, React.createElement(Probe)));

      setTimeout(() => {
        const rt = box.current.realtimeManager;

        // PHASE 1 (the bug report's exact hostile pattern): call connect()
        // straight off the context value and DROP the returned promise.
        rt.connect();

        setTimeout(() => {
          // PHASE 2: the SAME call pattern, but this caller DOES attach its
          // own rejection handler — must still observe the real rejection.
          let caughtRejected = false;
          let caughtMessage = null;
          const p = rt.connect();
          const caughtPromise = p
            ? p.then(
                () => { caughtRejected = false; },
                (err) => { caughtRejected = true; caughtMessage = String(err && err.message || err); }
              )
            : Promise.resolve();

          caughtPromise.finally(() => {
            // Proof this actually exercised the SSE path (not WS): the
            // constructor NAME can be mangled by minification/bundling, so
            // instead assert on the REJECTION REASON itself — SseTransport's
            // own error messages/codes always contain 'SSE' (e.g. 'SSE
            // reconnect gave up after N attempts', SSE_MAX_ATTEMPTS),
            // whereas WebSocketManager's dead-port failure is always the
            // literal 'WebSocket error' (see the WS case above). This is
            // stronger evidence than a class name check because it proves
            // the rejection genuinely originated from the SSE transport's
            // own code path, not merely that some object was constructed.
            const isLazySse = typeof caughtMessage === 'string' && caughtMessage.includes('SSE');
            const out = {
              hasWindow: typeof window !== 'undefined',
              isLazySse,
              discardedSurvived: true,
              gotConnectPromise: !!p,
              caughtRejected,
              caughtMessage,
            };
            process.stdout.write(JSON.stringify(out));
            process.exit(0);
          });
        }, 1500);
      }, 250);
    `;

    let stdout = null;
    let crashed = false;
    let crashDetail = '';
    try {
      stdout = execFileSync(process.execPath, ['-e', childScript], {
        encoding: 'utf8',
        timeout: 15000,
        killSignal: 'SIGKILL',
        cwd: scratchDir,
      });
    } catch (err) {
      crashed = true;
      crashDetail =
        (err?.signal ? `killed by signal ${err.signal}` : `exit code ${err?.status}`) +
        (err?.stderr ? ` — stderr: ${String(err.stderr).slice(0, 800)}` : '');
    }

    if (crashed) {
      results.push({
        id: discardedId,
        pass: false,
        message: `child process CRASHED on a discarded useMinderContext().realtimeManager.connect() (transport:'sse') against a real dead port (${crashDetail}) — an unhandled rejection in the context-direct SSE path took the whole process down`,
      });
      results.push({
        id: caughtId,
        pass: false,
        message: `driver could not evaluate the caught-path — the child process already crashed on the discarded-path (${crashDetail})`,
      });
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        results.push({
          id: discardedId,
          pass: false,
          message: `child process exited cleanly but produced unparsable output: ${JSON.stringify(stdout)} (${e?.message ?? e})`,
        });
        results.push({
          id: caughtId,
          pass: false,
          message: `driver could not evaluate the caught-path — output was unparsable`,
        });
        parsed = undefined;
      }
      if (parsed) {
        const survived = parsed.hasWindow === true && parsed.isLazySse === true && parsed.discardedSurvived === true;
        results.push({
          id: discardedId,
          pass: survived,
          message: survived
            ? "child process survived a DISCARDED useMinderContext().realtimeManager.connect() (LazySseTransport) promise against a real dead port with NO unhandled rejection"
            : `child process did not crash, but did not reach the expected checkpoint (or realtimeManager was not a LazySseTransport): ${JSON.stringify(parsed)}`,
        });

        const caughtOk = survived && parsed.gotConnectPromise === true && parsed.caughtRejected === true && !!parsed.caughtMessage;
        results.push({
          id: caughtId,
          pass: caughtOk,
          message: caughtOk
            ? `a caller that DOES attach .catch() to useMinderContext().realtimeManager.connect() still observes the real dead-port rejection (error: "${parsed.caughtMessage}") — the internal safety net does not mask genuine failures`
            : `expected connect() to still hand back a promise that rejects for an explicit .catch(); got ${JSON.stringify(parsed)}`,
        });
      }
    }
  } catch (err) {
    results.push({
      id: discardedId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
    results.push({
      id: caughtId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  return results;
}

/**
 * fix-b-transport-storage-websocket (HIGH 8): `WebSocketClient`
 * (src/websocket/WebSocketClient.ts) — the STANDALONE class exported
 * directly from the `minder-data-provider/websocket` subpath
 * (`new WebSocketClient(config)` / `createWebSocketClient(config)`, ZERO
 * hook and ZERO `MinderContext` in between) — is the LAST known site of the
 * exact same unhandled-rejection bug class already fixed for
 * `WebSocketManager`, `SseTransport`, `LazySseTransport`,
 * `GlobalAuthManager.setToken`, and the GET auto-fetch path: `connect()`
 * built `new Promise((resolve, reject) => {...})` and returned it AS-IS —
 * a discarded `client.connect()` against a dead port rejected with NO
 * handler attached anywhere in this class, which is Node's exact
 * `unhandledRejection` crash trigger (mode `'throw'` since Node 15).
 *
 * FIX: `connect()` now attaches a permanent, silent no-op `.catch()`
 * directly to the promise it hands back BEFORE returning it — mirrors
 * `WebSocketManager.connect()`'s identical `connectPromise.catch(() => {})`
 * fix. Proven both ways, same as every other case in this file: (1) a
 * DISCARDED `connect()` promise against a real dead port must not crash the
 * process, and (2) a caller that DOES attach `.catch()` must still observe
 * the real rejection.
 *
 * Runs in an isolated child process for the SAME reason as the other cases
 * here — an unhandled rejection in the driver's own process would kill
 * scripts/wire/run.mjs mid-suite. No React/JSDOM needed: `WebSocketClient`
 * has no hook dependency at all, so this is a bare `require()` + call.
 */
async function runWebSocketClientDirectCase(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];
  const discardedId = 'hi8-websocketclient-direct-connect-dead-port-discarded-no-crash';
  const caughtId = 'hi8-websocketclient-direct-connect-dead-port-caught-still-rejects';

  try {
    requireFromScratch(scratchDir, 'minder-data-provider/package.json');

    const deadPort = await getDeadPort();

    const childScript = `
      const path = require('path');
      const scratchDir = ${JSON.stringify(scratchDir)};
      const resolveFromScratch = (spec) => require.resolve(spec, { paths: [scratchDir] });

      const pkgRoot = path.dirname(resolveFromScratch('minder-data-provider/package.json'));
      const pkg = require(path.join(pkgRoot, 'package.json'));
      // Deliberately the './websocket' subpath, NOT the root entry — the
      // exact hook-free, context-free import a consumer would use.
      const websocketEntry = path.join(pkgRoot, pkg.exports['./websocket'].require);
      const { WebSocketClient } = require(websocketEntry);

      // Deliberately NO process.on('unhandledRejection', ...) handler — see
      // the header comment above runWebSocketCase for why: the goal is to
      // observe Node's REAL default behavior, not mask it. Node's own global
      // WebSocket (undici-backed) is what actually dials the dead port.

      // PHASE 1 (the bug report's exact hostile pattern): construct directly
      // and call connect(), DROP the returned promise entirely.
      const client1 = new WebSocketClient({ url: 'ws://127.0.0.1:${deadPort}', reconnect: false });
      client1.connect();

      setTimeout(() => {
        // PHASE 2: a FRESH instance, same call pattern, but this caller DOES
        // attach its own rejection handler — must still observe the real
        // dead-port failure.
        const client2 = new WebSocketClient({ url: 'ws://127.0.0.1:${deadPort}', reconnect: false });
        let caughtRejected = false;
        let caughtMessage = null;
        const p = client2.connect();
        const caughtPromise = p
          ? p.then(
              () => { caughtRejected = false; },
              (err) => { caughtRejected = true; caughtMessage = String(err && err.message || err); }
            )
          : Promise.resolve();

        caughtPromise.finally(() => {
          const out = {
            discardedSurvived: true, // reaching this line at all proves it
            gotConnectPromise: !!p,
            caughtRejected,
            caughtMessage,
          };
          process.stdout.write(JSON.stringify(out));
          process.exit(0);
        });
      }, 1500);
    `;

    let stdout = null;
    let crashed = false;
    let crashDetail = '';
    try {
      stdout = execFileSync(process.execPath, ['-e', childScript], {
        encoding: 'utf8',
        timeout: 15000,
        killSignal: 'SIGKILL',
        cwd: scratchDir,
      });
    } catch (err) {
      crashed = true;
      crashDetail =
        (err?.signal ? `killed by signal ${err.signal}` : `exit code ${err?.status}`) +
        (err?.stderr ? ` — stderr: ${String(err.stderr).slice(0, 800)}` : '');
    }

    if (crashed) {
      results.push({
        id: discardedId,
        pass: false,
        message: `child process CRASHED on a discarded direct WebSocketClient.connect() against a real dead port (${crashDetail}) — an unhandled rejection in the standalone /websocket subpath took the whole process down`,
      });
      results.push({
        id: caughtId,
        pass: false,
        message: `driver could not evaluate the caught-path — the child process already crashed on the discarded-path (${crashDetail})`,
      });
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        results.push({
          id: discardedId,
          pass: false,
          message: `child process exited cleanly but produced unparsable output: ${JSON.stringify(stdout)} (${e?.message ?? e})`,
        });
        results.push({
          id: caughtId,
          pass: false,
          message: `driver could not evaluate the caught-path — output was unparsable`,
        });
        parsed = undefined;
      }
      if (parsed) {
        const survived = parsed.discardedSurvived === true;
        results.push({
          id: discardedId,
          pass: survived,
          message: survived
            ? 'child process survived a DISCARDED direct WebSocketClient.connect() promise against a real dead port with NO unhandled rejection'
            : `child process did not crash, but did not reach the expected checkpoint: ${JSON.stringify(parsed)}`,
        });

        const caughtOk = survived && parsed.gotConnectPromise === true && parsed.caughtRejected === true && !!parsed.caughtMessage;
        results.push({
          id: caughtId,
          pass: caughtOk,
          message: caughtOk
            ? `a caller that DOES attach .catch() to the direct WebSocketClient.connect() still observes the real dead-port rejection (error: "${parsed.caughtMessage}") — the internal safety net does not mask genuine failures`
            : `expected connect() to still hand back a promise that rejects for an explicit .catch(); got ${JSON.stringify(parsed)}`,
        });
      }
    }
  } catch (err) {
    results.push({
      id: discardedId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
    results.push({
      id: caughtId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  return results;
}
