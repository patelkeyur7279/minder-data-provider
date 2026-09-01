/**
 * F5 (adversarial re-probe, flagged by a separate agent, fix-2.2.0-blockers)
 * — a failed GET auto-fetch through `<MinderDataProvider>` could CRASH THE
 * NODE PROCESS via an unhandled promise rejection, reproduced against a
 * REAL dead port (this happens even with offline support disabled — it is
 * unrelated to the offline/C3 work).
 *
 * ROOT CAUSE (traced with a debug, unminified build + `process.on
 * ('unhandledRejection', ...)`): `ApiClient.request()` dispatches GET
 * requests through `RequestDeduplicator.deduplicate()`
 * (`src/utils/performance.ts`) whenever `performance.deduplication` is
 * enabled — the DEFAULT (`SmartConfig`/`config/index.ts` both default it to
 * `true`, so `this.deduplicator` is instantiated on every normal
 * `ApiClient`). `deduplicate()` does:
 *
 *     const promise = executor();
 *     ...
 *     promise.finally(() => { ...cleanup... });   // <-- BUG
 *     return promise;
 *
 * `.finally()` returns a NEW promise that adopts `promise`'s eventual state.
 * `promise` itself IS returned to and awaited by the caller (all the way up
 * to `useMinder`'s query function's own try/catch), so ITS rejection is
 * always handled and surfaces correctly through the hook's normal
 * `error`/`success:false` result — that part already worked. But the
 * DERIVED `.finally()` promise is referenced by nobody: when `promise`
 * rejects (a real no-response network failure normalizes to a thrown
 * `Minder*Error`), that orphaned derived promise ALSO rejects with no
 * handler ever attached to it, and Node's default `unhandledRejection`
 * behavior (mode `'throw'` since Node 15) terminates the process outright —
 * on nothing more than one transient network failure. The exact same
 * pattern existed a second time in `ApiClient.ts`'s own GET
 * request-cache-cleanup fallback path. Both are fixed by attaching a no-op
 * `.catch(() => {})` to the derived `.finally()` promise (the ORIGINAL
 * promise's rejection is untouched and still propagates normally).
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
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];
  const resultId = 'f5-get-autofetch-dead-port-no-unhandled-rejection-no-crash';

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
        routes: { thing: { method: 'GET', url: '/thing' } },
      });

      const box = { current: undefined };
      function Probe() {
        // retryConfig maxRetries:0 keeps this deterministic and fast — the
        // bug reproduces on the FIRST no-response failure, not specifically
        // after retries are exhausted (the deduplicator's floating promise
        // is created and orphaned on every dispatch, retried or not).
        box.current = mdp.useMinder('thing', { retryConfig: { maxRetries: 0 } });
        return null;
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = ReactDOMClient.createRoot(container);
      root.render(React.createElement(mdp.MinderDataProvider, { config }, React.createElement(Probe)));

      setTimeout(() => {
        const r = box.current;
        const out = {
          hasWindow: typeof window !== 'undefined',
          loading: r ? r.loading : null,
          success: r ? r.success : null,
          errorMessage: r && r.error ? String(r.error.message || r.error) : null,
        };
        process.stdout.write(JSON.stringify(out));
        process.exit(0);
      }, 2500);
    `;

    let stdout = null;
    let crashed = false;
    let crashDetail = '';
    try {
      stdout = execFileSync(process.execPath, ['-e', childScript], {
        encoding: 'utf8',
        timeout: 15000,
        killSignal: 'SIGKILL',
        // CRITICAL: `cwd` must be the SCRATCH consumer, never inherited from
        // the wire suite's own process (the repo root). `npm run test:wire`
        // runs with cwd = repo root, whose OWN package.json is ALSO named
        // "minder-data-provider" — Node's CommonJS self-reference resolution
        // (a package requiring itself by name) fires from an `[eval]`
        // script's cwd and takes priority over `require.resolve(...,
        // {paths})` below, silently resolving straight to the REPO'S OWN
        // (unpacked, un-isolated) `dist/`, which then pulls the REPO'S OWN
        // `node_modules/react` while `react-dom` still resolves from the
        // scratch consumer — two different React module instances, i.e. a
        // real "Invalid hook call" caused by this driver's own test
        // plumbing, not by the library. Verified empirically: with cwd left
        // at the repo root this reliably reproduces; pinning cwd to
        // `scratchDir` (whose package.json is named "minder-wire-consumer")
        // makes self-reference never apply, so resolution goes through
        // `paths` as intended and both `react`/`react-dom` resolve from the
        // SAME scratch install — exactly FIX_PLAN.md §5's "consumer
        // isolation is the entire point" invariant every other driver relies on.
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
        id: resultId,
        pass: false,
        message: `child process CRASHED on a failed GET auto-fetch against a real dead port (${crashDetail}) — an unhandled rejection in the query path took the whole process down`,
      });
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        results.push({
          id: resultId,
          pass: false,
          message: `child process exited cleanly but produced unparsable output: ${JSON.stringify(stdout)} (${e?.message ?? e})`,
        });
        parsed = undefined;
      }
      if (parsed) {
        // Pass requires BOTH: the process survived (no crash — the F5 defect
        // itself) AND the failure surfaced through the hook's normal error
        // channel (success:false with a real error) rather than e.g. hanging
        // forever in `loading:true` or silently reporting success.
        const surfacedProperly = parsed.success === false && !!parsed.errorMessage && parsed.loading === false;
        const pass = parsed.hasWindow === true && surfacedProperly;
        results.push({
          id: resultId,
          pass,
          message: pass
            ? `child process survived a failed GET auto-fetch against a real dead port with NO unhandled rejection, and the failure surfaced normally (success:false, error:"${parsed.errorMessage}")`
            : `child process did not crash, but the failure did not surface correctly: ${JSON.stringify(parsed)}`,
        });
      }
    }
  } catch (err) {
    results.push({
      id: resultId,
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  return results;
}
