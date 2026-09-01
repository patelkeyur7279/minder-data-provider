/**
 * H2 (+ its overlap with B2) — a genuinely windowless Node runtime leg.
 *
 * `XSSSanitizer` and `ApiClient` are both deliberately unexported (see
 * FIX_PLAN.md L1: "ApiClient itself stays unexported deliberately"), so the
 * only publicly reachable way to observe the sanitizer's fail-closed
 * behaviour is through the documented data-call surface with
 * `security.sanitization` configured. This drives that surface from a FRESH
 * `node -e` CHILD PROCESS — no jsdom, no `window`, no React — because
 * jsdom's ambient `window` global actively hides the H2 defect class
 * (FIX_PLAN.md §5, "Matrix": "a Node-runtime leg with no jsdom ... catches
 * the H2 class of defect").
 *
 * Expected final contract once B2 (wiring sanitization into standalone
 * `minder()`) and H2 (fail-closed off-browser) have BOTH landed: requesting
 * `security.sanitization` outside a browser must either (a) throw
 * `SANITIZER_UNAVAILABLE`, or (b) never be silently treated as "sanitized"
 * while shipping the raw, unsanitized payload — i.e. it must not report
 * success while quietly doing nothing. This case intentionally exercises
 * BOTH defects at once (standalone `minder()` is the only public surface
 * that reaches this code path outside a provider); a failure here can be
 * either "B2 not wired yet" or "H2 not fail-closed yet" — the result
 * message says which was observed.
 */
import { execFileSync } from 'node:child_process';

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];

  const recorder = await ctx.startRecordingServer();
  try {
    // Sanity: throws here (a driver-level error, not a silent skip) if the
    // scratch install is somehow broken, before we hand resolution off to
    // the CHILD process below (which resolves independently via its own
    // `require.resolve(..., { paths: [scratchDir] })`).
    requireFromScratch(scratchDir, 'minder-data-provider/package.json');

    const childScript = `
      const path = require('path');
      const pkgRoot = path.dirname(require.resolve('minder-data-provider/package.json', { paths: [${JSON.stringify(scratchDir)}] }));
      const pkg = require(path.join(pkgRoot, 'package.json'));
      const entry = path.join(pkgRoot, pkg.exports['.'].require);
      const mdp = require(entry);

      const out = { hasWindow: typeof window !== 'undefined' };
      try {
        mdp.configureMinder({
          apiUrl: ${JSON.stringify(recorder.baseUrl)},
          security: { sanitization: { enabled: true, fields: ['bio'] } },
          routes: { createUser: { method: 'POST', url: '/users' } },
        });
      } catch (e) {
        out.configureThrew = String(e && e.message || e);
      }

      mdp.minder('createUser', { bio: '<script>alert(1)</script>', title: 'ok' }, { method: 'POST' })
        .then((result) => {
          out.minderThrew = false;
          out.result = { success: result.success, errorMessage: result.error && String(result.error.message || result.error) };
          process.stdout.write(JSON.stringify(out));
        })
        .catch((e) => {
          out.minderThrew = true;
          out.errorMessage = String(e && e.message || e);
          process.stdout.write(JSON.stringify(out));
        });
    `;

    const stdout = execFileSync(process.execPath, ['-e', childScript], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout.trim().split('\n').pop());

    const record = recorder.records.find((r) => r.url.includes('/users'));
    const sentRaw = record ? record.rawBody.includes('<script>alert(1)</script>') : null;

    // Pass criteria (the CORRECT end-state contract, per header comment):
    //   - `window` really is undefined in the child (sanity — proves this is
    //     the leg jsdom would hide), AND
    //   - the raw <script> payload never reaches the wire for the opted-in
    //     `bio` field, AND
    //   - EITHER the call surfaced a SANITIZER_UNAVAILABLE-shaped error (fail
    //     closed, H2's intended fix) OR the wire body no longer contains the
    //     raw <script> payload for the opted-in `bio` field (B2 + sanitizer
    //     actually applied).
    //
    // `minder()` has a pre-existing, deliberate "never throw" contract (see
    // src/core/minder.ts: "Handle error - NEVER throw") — without
    // `{ throwOnError: true }` a failure resolves the promise with
    // `{ success: false, error }` rather than rejecting it. So a
    // SANITIZER_UNAVAILABLE failure can surface either as a rejected promise
    // (`parsed.minderThrew`/`parsed.errorMessage`, e.g. if a caller opts into
    // `throwOnError`) OR as a resolved `MinderResult` with `success: false`
    // (`parsed.result`, the actual default-path shape observed here). Both
    // are valid fail-closed evidence; checking only the rejection path is
    // what made this case assert a promise-rejection contract minder() never
    // promised for the non-`throwOnError` default path exercised above.
    const rawLeaked = sentRaw === true;
    const sanitizerUnavailableMessage = parsed.minderThrew
      ? (parsed.errorMessage ?? '')
      : (parsed.result && parsed.result.errorMessage) ?? '';
    const failedClosed =
      /SANITIZER_UNAVAILABLE|sanitiz/i.test(sanitizerUnavailableMessage) &&
      (parsed.minderThrew === true || (parsed.result && parsed.result.success === false));
    const actuallySanitized = sentRaw === false;
    const pass = parsed.hasWindow === false && !rawLeaked && (failedClosed || actuallySanitized);

    results.push({
      id: 'h2-sanitize-fails-closed-outside-browser',
      pass,
      message: pass
        ? `windowless Node runtime: ${failedClosed ? `SANITIZER_UNAVAILABLE (fail-closed, ${parsed.minderThrew ? 'rejected promise' : 'resolved success:false result'})` : 'field was actually sanitized on the wire'}`
        : `windowless Node runtime did NOT fail closed and did NOT sanitize — raw <script> payload ${rawLeaked ? 'reached the wire unmodified' : 'status unclear'} (sentRaw=${sentRaw}, child=${JSON.stringify(parsed)}). This is the B2/H2 overlap: standalone minder() must wire the sanitizer AND that sanitizer must fail closed off-browser.`,
    });
  } catch (err) {
    results.push({
      id: 'h2-sanitize-fails-closed-outside-browser',
      pass: false,
      message: `driver threw: ${err?.message ?? err}`,
    });
  } finally {
    await recorder.close();
  }

  return results;
}
