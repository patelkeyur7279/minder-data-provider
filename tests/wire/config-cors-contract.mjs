/**
 * B4 + M3 — `configureMinder()` on the web platform, and the `/web` subpath
 * export specifically.
 *
 * Both cases run in FRESH CHILD PROCESSES (not in-process), because
 * `PlatformDetector.detect()` caches its result in a module-level static
 * field for the lifetime of the process — running these alongside other
 * drivers that also `require('minder-data-provider')` from the same scratch
 * install would read a platform cached by whichever driver happened to run
 * first, which is exactly the kind of cross-case contamination a "real
 * behaviour" suite must not have.
 *
 *   B4: configureMinder({ apiUrl }) with no `cors` specified must not
 *       silently produce `cors.enabled: true` (which rewrites every request
 *       through a proxy route — `/api/minder-proxy` — that doesn't exist).
 *   M3: `configureMinder` imported from `minder-data-provider/web` must be
 *       the REAL implementation (registers `routes`), not the `@deprecated`
 *       baseURL/headers-only stub at `src/core/minder.ts:163`, which returns
 *       `void` and registers nothing.
 */
import { execFileSync } from 'node:child_process';

function runChild(scratchDir, subpathExportKey, body) {
  const script = `
    global.window = {};
    global.navigator = { userAgent: 'wire-suite' };
    const path = require('path');
    const pkgRoot = path.dirname(require.resolve('minder-data-provider/package.json', { paths: [${JSON.stringify(scratchDir)}] }));
    const pkg = require(path.join(pkgRoot, 'package.json'));
    const entry = path.join(pkgRoot, pkg.exports[${JSON.stringify(subpathExportKey)}].require);
    const mdp = require(entry);
    ${body}
  `;
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const results = [];

  // --- B4 ---
  try {
    const stdout = runChild(
      scratchDir,
      '.',
      `
        let out;
        try {
          const cfg = mdp.configureMinder({ apiUrl: 'https://api.example.com' });
          out = { ok: true, cors: cfg.cors };
        } catch (e) {
          out = { ok: false, threw: String(e && e.message || e) };
        }
        process.stdout.write(JSON.stringify(out));
      `,
    );
    const parsed = JSON.parse(stdout.trim().split("\n").pop());
    // Correct contract: either cors isn't silently auto-enabled, or if it IS
    // enabled by default an explicit proxy must already be configured (never
    // a silent rewrite to a route the app never created) — configureMinder
    // itself throwing at config time (documented as the escalated fix in
    // FIX_PLAN.md B4) also satisfies "not silently auto-enabled".
    const corsEnabled = parsed.ok && parsed.cors && parsed.cors.enabled === true;
    const hasExplicitProxy = parsed.ok && parsed.cors && !!parsed.cors.proxy;
    const pass = !parsed.ok ? true : !corsEnabled || hasExplicitProxy;
    results.push({
      id: 'b4-configureMinder-web-cors-not-autoenabled',
      pass,
      message: pass
        ? `configureMinder({apiUrl}) on web did not silently rewrite requests through an unconfigured proxy (${JSON.stringify(parsed)})`
        : `configureMinder({apiUrl}) on web silently returned cors.enabled:true with no proxy configured — every request gets rewritten to '/api/minder-proxy' with no warning outside NODE_ENV==='development' (${JSON.stringify(parsed)})`,
    });
  } catch (err) {
    results.push({ id: 'b4-configureMinder-web-cors-not-autoenabled', pass: false, message: `driver threw: ${err?.message ?? err}` });
  }

  // --- M3 ---
  try {
    const stdout = runChild(
      scratchDir,
      './web',
      `
        let out;
        try {
          const cfg = mdp.configureMinder({ apiUrl: 'https://api.example.com', routes: { users: '/users' } });
          out = { ok: true, hasRoutes: !!(cfg && cfg.routes && cfg.routes.users), returnedUndefined: cfg === undefined };
        } catch (e) {
          out = { ok: false, threw: String(e && e.message || e) };
        }
        process.stdout.write(JSON.stringify(out));
      `,
    );
    const parsed = JSON.parse(stdout.trim().split("\n").pop());
    const pass = parsed.ok && parsed.hasRoutes === true;
    results.push({
      id: 'm3-platform-web-configureMinder-registers-routes',
      pass,
      message: pass
        ? `minder-data-provider/web's configureMinder registered routes.users — the real implementation`
        : `minder-data-provider/web's configureMinder did NOT register routes (${JSON.stringify(parsed)}) — it is still the deprecated core stub (src/core/minder.ts:163), which returns void and registers nothing`,
    });
  } catch (err) {
    results.push({ id: 'm3-platform-web-configureMinder-registers-routes', pass: false, message: `driver threw: ${err?.message ?? err}` });
  }

  return results;
}
