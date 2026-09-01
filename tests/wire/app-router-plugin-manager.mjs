/**
 * fix-a-app-router-crash-offline-parity (BLOCKER 1, B1/B1b) — the
 * `peekPluginManager()` fix for server-side `minder()` throwing
 * `TypeError: Cannot read properties of undefined (reading 'size')` inside
 * Next.js App Router Route Handlers and Server Components.
 *
 * ROOT CAUSE (see src/plugins/PluginSystem.ts's full write-up, and
 * src/core/minder.ts:178-191): under tsup's cross-entry `splitting:true`,
 * the `PluginManager` class declaration, the `pluginManager` Proxy
 * assignment, and the eager plugin instances are all emitted into ONE
 * shared chunk whose top-level code is wrapped in esbuild's deferred
 * "call once" initializer. esbuild reliably inserts the matching trigger
 * call at every import site WITHIN ITS OWN bundle graph, but Next.js App
 * Router's webpack, which re-processes the built ESM a SECOND time, does
 * not reliably preserve that trigger — so accessing the `pluginManager`
 * Proxy (or even a plain accessor that still calls `new PluginManager()`)
 * throws inside that specific re-bundled environment. THE FIX:
 * `peekPluginManager()` reads the shared store slot WITHOUT the `??=`
 * construction, so the zero-plugins path (the common case for a bare
 * `await minder(...)`) never resolves the `PluginManager` class reference
 * at all — every plugin-hook call site in minder.ts/ApiClient.ts/
 * OfflineManager.ts already guards on `pm && pm.size > 0`, so "no manager
 * constructed yet" and "zero plugins registered" are the same answer.
 *
 * HONEST LIMITATION OF THIS DRIVER (documented, not hidden): this wire
 * suite's architecture (npm pack -> scratch consumer -> plain Node
 * `require`/`import`, see scripts/wire/run.mjs's header) never invokes a
 * SECOND bundler (webpack/Next.js) over the built artifact — by design, it
 * asserts what a real `npm install` consumer's plain module loader sees. A
 * plain Node script importing the published package was already confirmed
 * (during this fix's own investigation) to never crash on this issue, since
 * Node evaluates a module's top-level code eagerly and completely — it is
 * NOT subject to the specific chunk-reprocessing behavior that only Next.js
 * App Router's webpack triggers. That means neither this driver, nor any
 * driver in this suite's current architecture, can reproduce the EXACT
 * Next.js-webpack-specific trigger. A genuinely bundler-faithful
 * reproduction (a real `next build` + Route Handler + Server Component) was
 * run manually against this exact build during this task (see the task
 * report) and confirmed `minder()` returns a `MinderResult` (no throw)
 * there too.
 *
 * What THIS driver DOES verify, faithfully, against the real built
 * artifact: the documented never-throws contract holds for a bare
 * `await minder(...)` call — with NO plugin ever registered, from a FRESH
 * module graph (an isolated child process, so no earlier case in this
 * process can have already warmed/constructed a PluginManager) — against a
 * REAL dead port, through both the ESM (`.`) and the Node-targeted
 * (`./node`) entry points a Route Handler or Server Component would
 * plausibly import from, and that this holds across REPEATED calls in the
 * same process (matching serverless function reuse across requests).
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 * Runs `script` in a FRESH, isolated child Node process (its own module
 * graph — nothing has ever imported `minder-data-provider` before this
 * script does) and returns { code, stdout, stderr }. Isolation matters
 * twice over here: (1) it guarantees no earlier case's plugin-manager
 * access has already constructed one in this process (the "fresh App
 * Router route" scenario), and (2) if the never-throws contract genuinely
 * regressed, an UNCAUGHT exception would otherwise crash scripts/wire/
 * run.mjs itself mid-suite (the same isolation rationale
 * tests/wire/query-failure-safety.mjs documents).
 */
function runInFreshProcess(script) {
  const dir = mkdtempSync(join(tmpdir(), 'mdp-wire-app-router-'));
  const file = join(dir, 'probe.mjs');
  writeFileSync(file, script, 'utf8');
  try {
    const stdout = execFileSync(process.execPath, [file], { encoding: 'utf8', timeout: 15000 });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : -1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : String(err.message ?? err),
    };
  }
}

/**
 * `configureMinder()` writes a `[Minder] ... [DEBUG] [Config] Minder
 * configured {...}` line to stdout BEFORE the probe script's own JSON
 * result — a plain `JSON.parse(stdout)` fails on that leading text. Every
 * probe script below writes a unique marker line immediately before its
 * JSON payload; this pulls out ONLY what follows the marker.
 */
const RESULT_MARKER = '===MDP_WIRE_RESULT===';
function extractJsonAfterMarker(stdout) {
  const idx = stdout.indexOf(RESULT_MARKER);
  if (idx === -1) return undefined;
  const jsonText = stdout.slice(idx + RESULT_MARKER.length).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return undefined;
  }
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { resolveEntry } = ctx.load;
  const results = [];

  const rootEntry = resolveEntry(scratchDir, '.');
  const nodeEntry = resolveEntry(scratchDir, './node');

  // ── Case 1 (required, B1): fresh process, ESM root entry, NO plugin ever
  //    registered — a bare minder() against a real dead port must return a
  //    MinderResult (success:false), never throw, never crash the process ──
  {
    const deadPort = await getDeadPort();
    const script = `
      import { minder, configureMinder } from ${JSON.stringify(rootEntry.esm)};
      configureMinder({ apiUrl: 'http://127.0.0.1:${deadPort}' });
      const result = await minder('/things', { a: 1 });
      process.stdout.write('\\n===MDP_WIRE_RESULT===' + JSON.stringify(result));
    `;
    const { code, stdout, stderr } = runInFreshProcess(script);
    let result;
    result = extractJsonAfterMarker(stdout);
    const pass = code === 0 && result != null && result.success === false && result.error != null && typeof result.error.code === 'string';
    results.push({
      id: 'arpm-fresh-process-esm-root-dead-port-never-throws',
      pass,
      message: pass
        ? `fresh-process minder() against a REAL dead port (ESM root entry, zero plugins ever registered) returned a MinderResult (success:false, error.code=${result.error.code}) — no throw, no crash (exit 0)`
        : `expected exit 0 with a MinderResult; got exit=${code} stdout=${stdout} stderr=${stderr}`,
    });
  }

  // ── Case 2 (required, B1): fresh process, CJS `./node` entry (the
  //    Node-targeted subpath a server-only Route Handler would plausibly
  //    use), same contract ──
  {
    const deadPort = await getDeadPort();
    const script = `
      const { minder, configureMinder } = require(${JSON.stringify(nodeEntry.cjs)});
      (async () => {
        configureMinder({ apiUrl: 'http://127.0.0.1:${deadPort}' });
        const result = await minder('/things', { a: 1 });
        process.stdout.write('\\n===MDP_WIRE_RESULT===' + JSON.stringify(result));
      })();
    `;
    const dir = mkdtempSync(join(tmpdir(), 'mdp-wire-app-router-cjs-'));
    const file = join(dir, 'probe.cjs');
    writeFileSync(file, script, 'utf8');
    let code, stdout, stderr;
    try {
      stdout = execFileSync(process.execPath, [file], { encoding: 'utf8', timeout: 15000 });
      code = 0;
      stderr = '';
    } catch (err) {
      code = typeof err.status === 'number' ? err.status : -1;
      stdout = err.stdout ? String(err.stdout) : '';
      stderr = err.stderr ? String(err.stderr) : String(err.message ?? err);
    }
    let result;
    result = extractJsonAfterMarker(stdout);
    const pass = code === 0 && result != null && result.success === false && result.error != null && typeof result.error.code === 'string';
    results.push({
      id: 'arpm-fresh-process-cjs-node-entry-dead-port-never-throws',
      pass,
      message: pass
        ? `fresh-process minder() against a REAL dead port (CJS ./node entry, zero plugins ever registered) returned a MinderResult (success:false, error.code=${result.error.code}) — no throw, no crash (exit 0)`
        : `expected exit 0 with a MinderResult; got exit=${code} stdout=${stdout} stderr=${stderr}`,
    });
  }

  // ── Case 3 (B1, serverless-reuse guard): the SAME process handling
  //    REPEATED requests (matching a warm serverless/App-Router function
  //    reused across invocations) never throws on the 2nd/3rd call either —
  //    proves the fix isn't a one-shot accident of module-init ordering ──
  {
    const deadPort = await getDeadPort();
    const script = `
      import { minder, configureMinder } from ${JSON.stringify(rootEntry.esm)};
      configureMinder({ apiUrl: 'http://127.0.0.1:${deadPort}' });
      const results = [];
      for (let i = 0; i < 3; i++) {
        results.push(await minder('/things-' + i, { a: i }));
      }
      process.stdout.write('\\n===MDP_WIRE_RESULT===' + JSON.stringify(results));
    `;
    const { code, stdout, stderr } = runInFreshProcess(script);
    let resultsArr;
    resultsArr = extractJsonAfterMarker(stdout);
    const pass =
      code === 0 &&
      Array.isArray(resultsArr) &&
      resultsArr.length === 3 &&
      resultsArr.every((r) => r && r.success === false && r.error && typeof r.error.code === 'string');
    results.push({
      id: 'arpm-repeated-calls-same-process-never-throws',
      pass,
      message: pass
        ? `3 sequential minder() calls against a real dead port, same process (warm-reuse simulation), all returned MinderResult(success:false) — no throw on any call`
        : `expected 3 clean MinderResults; got exit=${code} stdout=${stdout} stderr=${stderr}`,
    });
  }

  return results;
}
