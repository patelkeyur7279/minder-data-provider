/**
 * F1-F4 (adversarial re-probe of the C5 id-VALUE guard in
 * `useMinder.helpers.ts`'s `assertValidResourceId`/`assertAddressable`).
 *
 * An architect drove a real `node:http` recorder with hostile inputs against
 * the BUILT dist and found the guard's own stated invariant ("escapes the
 * URL SEGMENT" — see the block comment above `ID_PATH_HOSTILE_PATTERN` in
 * `useMinder.helpers.ts`) did not hold for every URL-significant character,
 * and that the type/shape checks let the single commonest real mistake
 * (passing the whole record instead of `record.id`) straight through. Every
 * case below reproduces one of those REAL OBSERVED WIRE OUTPUTS verbatim
 * (same route shapes, same hostile values) and asserts BOTH that the call
 * THROWS and that ZERO requests ever reached the recorder — a throw alone is
 * not proof; a throw AFTER the request already went out would still be the
 * defect (mirrors the C5 methodology in tests/wire/method-contract.mjs).
 *
 *   F1 — '?' and '#' (and other request-line-significant characters) were
 *        missing from `ID_PATH_HOSTILE_PATTERN`, so a hostile id escaped the
 *        URL segment into a query string or fragment: `operations.delete
 *        ('5#')` on `/t/:id/comments` sent `DELETE /t/5` (deleting the
 *        PARENT), and `operations.update('5?force=1')` on `/h38/:id` sent
 *        `PUT /h38/5?force=1` (caller-controlled query injection).
 *   F2 — only null/undefined/NaN were type-checked, so `delete({})` sent
 *        `DELETE /h21/[object%20Object]`, `Infinity`/`-Infinity` sent
 *        literally, `true`/an array/a `Date`/a `Symbol` all silently
 *        `String()`-coerced into a plausible-looking id.
 *   F3 — a route whose `:id` placeholder lives only in the QUERY STRING
 *        (`/q-only?uid=:id`) satisfied the "has an :id placeholder" check
 *        even though the URL PATH stays collection-shaped.
 *   F4 — a malformed percent-escape (overlong UTF-8) made
 *        `decodeURIComponent` throw, and the old code treated "cannot
 *        decode" as "cannot find anything hostile" instead of "cannot prove
 *        safe" and let it through unmodified.
 *
 * POSITIVE CONTROLS (a guard that refuses valid input is its own defect):
 * `0`, a leading-zero string `'007'`, a UUID, a 24-hex Mongo-style ObjectId,
 * a `bigint`, and a nested route (`/pos-t/:id/comments`) all must still
 * resolve and dispatch the exact expected method+URL.
 */

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireAbs, importAbs, resolveEntry } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  const recorder = await ctx.startRecordingServer();
  // See tests/wire/method-contract.mjs's header comment for why teardownDom()
  // is deliberately never called within this process.
  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  /** Mounts `<MinderDataProvider><Probe/></MinderDataProvider>` with hook-level options threaded through. */
  async function mountProviderHookWithOptions(mdp, routeName, hookOptions, config, ready = (r) => r !== undefined) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder(routeName, hookOptions);
      return null;
    }
    const resolvedConfig = mdp.configureMinder(config);
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
    );
    await waitFor(() => ready(box.current), { timeout: 2000 });
    return { box, unmount };
  }

  /** Human-safe stringification for messages — plain JSON.stringify throws on a bigint. */
  function describeId(id) {
    if (typeof id === 'bigint') return `${id}n`;
    try {
      return JSON.stringify(id);
    } catch {
      return String(id);
    }
  }

  /**
   * HOSTILE case: `operations.create/update/delete(hostileId, ...)` on a
   * route whose SHAPE is otherwise fine (a genuine ':id' path placeholder,
   * or — for the F3 case — deliberately NOT one) must THROW and send ZERO
   * requests to the recorder.
   */
  async function hostileCase(resultId, mdp, opName, method, urlTemplate, routeName, hostileId, hostileLabel) {
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method, url: urlTemplate } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        if (opName === 'update') {
          await box.current.operations.update(hostileId, { title: 'hello' });
        } else {
          await box.current.operations.delete(hostileId);
        }
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const pass = threw && zeroRequests;
      results.push({
        id: resultId,
        pass,
        message: pass
          ? `operations.${opName}(${hostileLabel}) on route "${urlTemplate}" refused ("${errMessage}") — zero requests reached the wire`
          : threw
            ? `operations.${opName}(${hostileLabel}) threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the server: ${JSON.stringify(recorder.records)}`
            : `operations.${opName}(${hostileLabel}) did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * POSITIVE CONTROL: a LEGITIMATE id on a route that DOES carry a genuine
   * ':id' path placeholder must resolve and dispatch the exact expected
   * method+URL with NO error — proves the guard is not over-tightened.
   */
  async function positiveCase(resultId, mdp, opName, method, urlTemplate, routeName, id, expectedUrl) {
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method, url: urlTemplate } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        if (opName === 'update') {
          await box.current.operations.update(id, { title: 'hello' });
        } else {
          await box.current.operations.delete(id);
        }
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !threw && !!rec && rec.method === method && rec.url === expectedUrl;
      results.push({
        id: resultId,
        pass,
        message: pass
          ? `operations.${opName}(${describeId(id)}) — a LEGITIMATE id — correctly sent ${method} ${expectedUrl}`
          : threw
            ? `operations.${opName}(${describeId(id)}) — a LEGITIMATE id — was WRONGLY REFUSED: "${errMessage}" (over-tightened guard)`
            : `operations.${opName}(${describeId(id)}) sent ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}, expected ${method} ${expectedUrl}`,
      });
    } finally {
      unmount();
    }
  }

  const hostileCaseIds = [
    'f1-delete-fragment-escapes-to-parent-refuses',
    'f1-update-fragment-escapes-to-parent-refuses',
    'f1-delete-query-injection-refuses',
    'f1-update-query-injection-refuses',
    'f1-delete-crlf-injection-refuses',
    'f1-delete-encoded-crlf-injection-refuses',
    'f1-delete-encoded-query-injection-refuses',
    'f1-delete-nul-byte-refuses',
    'f1-delete-embedded-space-refuses',
    'f2-delete-plain-object-id-refuses',
    'f2-update-plain-object-id-refuses',
    'f2-delete-infinity-id-refuses',
    'f2-delete-neg-infinity-id-refuses',
    'f2-delete-boolean-id-refuses',
    'f2-delete-array-id-refuses',
    'f2-delete-date-id-refuses',
    'f2-delete-symbol-id-refuses',
    'f3-query-only-id-placeholder-refuses',
    'f4-overlong-utf8-percent-escape-refuses',
    'f4-bare-trailing-percent-refuses',
    'f5-delete-bare-dot-refuses',
    'f5-update-bare-dot-refuses',
    'f5-delete-encoded-dot-lower-refuses',
    'f5-delete-encoded-dot-upper-refuses',
    'f5-delete-double-encoded-dot-refuses',
    'f5-delete-triple-dot-refuses',
  ];

  try {
    // --- F1: '?'/'#' (and other request-line-significant characters) escape the URL segment ---
    // Exact reproduction: route /t/:id/comments, operations.delete('5#') previously sent DELETE /t/5.
    await hostileCase('f1-delete-fragment-escapes-to-parent-refuses', mdpCjs, 'delete', 'DELETE', '/t/:id/comments', 'tThing', '5#', "'5#'");
    // Exact reproduction: route /u/:id/draft, operations.update('5#', {title}) previously sent PUT /u/5.
    await hostileCase('f1-update-fragment-escapes-to-parent-refuses', mdpEsm, 'update', 'PUT', '/u/:id/draft', 'uThing', '5#', "'5#'");
    // Exact reproduction: route /flat/:id, operations.delete('5?a=1') previously sent DELETE /flat/5?a=1.
    await hostileCase('f1-delete-query-injection-refuses', mdpCjs, 'delete', 'DELETE', '/flat/:id', 'flatThing', '5?a=1', "'5?a=1'");
    // Exact reproduction: route /h38/:id, operations.update('5?force=1') previously sent PUT /h38/5?force=1.
    await hostileCase('f1-update-query-injection-refuses', mdpEsm, 'update', 'PUT', '/h38/:id', 'h38Thing', '5?force=1', "'5?force=1'");
    // Invented beyond the report: raw CR/LF enables request-line/header injection — never valid unencoded.
    await hostileCase('f1-delete-crlf-injection-refuses', mdpCjs, 'delete', 'DELETE', '/crlf/:id', 'crlfThing', '5\r\nX-Evil: 1', "'5\\r\\nX-Evil: 1'");
    // Invented: the SAME CRLF injection, percent-encoded — must be caught after decoding, like traversal.
    await hostileCase('f1-delete-encoded-crlf-injection-refuses', mdpEsm, 'delete', 'DELETE', '/crlf-enc/:id', 'crlfEncThing', '5%0d%0aX-Evil:1', "'5%0d%0aX-Evil:1'");
    // Invented: a percent-encoded '?a=1' must be caught via the decoded-string check too, not just raw.
    await hostileCase('f1-delete-encoded-query-injection-refuses', mdpCjs, 'delete', 'DELETE', '/enc-query/:id', 'encQueryThing', '5%3Fa%3D1', "'5%3Fa%3D1'");
    // Invented: a raw NUL byte — Node's own http layer would reject it, but the guard should refuse first with a directed error.
    await hostileCase('f1-delete-nul-byte-refuses', mdpEsm, 'delete', 'DELETE', '/nul/:id', 'nulThing', '5\x00evil', "'5\\x00evil'");
    // Invented: an embedded raw space breaks HTTP request-line parsing — distinct from the existing whitespace-ONLY check.
    await hostileCase('f1-delete-embedded-space-refuses', mdpCjs, 'delete', 'DELETE', '/space/:id', 'spaceThing', '5 evil', "'5 evil'");

    // --- F2: type/finiteness — the commonest real mistake (whole record instead of record.id) ---
    // Exact reproduction: delete({}) previously sent DELETE /h21/[object%20Object].
    await hostileCase('f2-delete-plain-object-id-refuses', mdpEsm, 'delete', 'DELETE', '/h21/:id', 'h21Thing', {}, '{} (the whole record instead of record.id)');
    // Exact reproduction: update({}) previously sent PUT /h37/[object%20Object].
    await hostileCase('f2-update-plain-object-id-refuses', mdpCjs, 'update', 'PUT', '/h37/:id', 'h37Thing', {}, '{} (the whole record instead of record.id)');
    // Exact reproduction: Infinity previously sent /h15/Infinity.
    await hostileCase('f2-delete-infinity-id-refuses', mdpEsm, 'delete', 'DELETE', '/h15/:id', 'h15Thing', Infinity, 'Infinity');
    // Exact reproduction: -Infinity previously sent /h16/-Infinity.
    await hostileCase('f2-delete-neg-infinity-id-refuses', mdpCjs, 'delete', 'DELETE', '/h16/:id', 'h16Thing', -Infinity, '-Infinity');
    // Exact reproduction: true previously sent /h26/true.
    await hostileCase('f2-delete-boolean-id-refuses', mdpEsm, 'delete', 'DELETE', '/h26/:id', 'h26Thing', true, 'true');
    // Exact reproduction: ['a','b'] previously sent /h22/a,b.
    await hostileCase('f2-delete-array-id-refuses', mdpCjs, 'delete', 'DELETE', '/h22/:id', 'h22Thing', ['a', 'b'], "['a','b']");
    // Exact reproduction: new Date(0) previously sent /h27/Thu Jan 01 1970....
    await hostileCase('f2-delete-date-id-refuses', mdpEsm, 'delete', 'DELETE', '/h27/:id', 'h27Thing', new Date(0), 'new Date(0)');
    // Exact reproduction: Symbol('s') previously sent /h28/Symbol(s).
    await hostileCase('f2-delete-symbol-id-refuses', mdpCjs, 'delete', 'DELETE', '/h28/:id', 'h28Thing', Symbol('s'), "Symbol('s')");

    // --- F3: ':id' accepted in a QUERY position — the exact guard this exists to prevent ---
    // Exact reproduction: route /q-only?uid=:id, operations.delete('5') previously produced DELETE /q-only?uid=5.
    await hostileCase('f3-query-only-id-placeholder-refuses', mdpEsm, 'delete', 'DELETE', '/q-only?uid=:id', 'qOnlyThing', '5', "'5'");

    // --- F4: malformed percent-escapes must not bypass decoding ---
    // Exact reproduction: delete('%c0%ae%c0%ae') (overlong UTF-8 for '../') previously sent DELETE /h11/%c0%ae%c0%ae.
    await hostileCase('f4-overlong-utf8-percent-escape-refuses', mdpCjs, 'delete', 'DELETE', '/h11/:id', 'h11Thing', '%c0%ae%c0%ae', "'%c0%ae%c0%ae'");
    // Invented: a bare trailing '%' is also a malformed escape decodeURIComponent throws on.
    await hostileCase('f4-bare-trailing-percent-refuses', mdpEsm, 'delete', 'DELETE', '/bare-pct/:id', 'barePctThing', '5%', "'5%'");

    // --- F5 (fix-route-param-dot-segment-detector, RELEASE BLOCKER): a bare
    // '.' segment (and every encoding of it) normalizes exactly like '..'
    // does — '/things/.' -> '/things/' — but was NOT refused by the prior
    // '..'-only blacklist. These reproduce the architect probe's finding
    // against the REAL built dist via a real node:http recorder: zero
    // requests must reach the wire for any of them.
    await hostileCase('f5-delete-bare-dot-refuses', mdpCjs, 'delete', 'DELETE', '/dot/:id', 'dotThing', '.', "'.'");
    await hostileCase('f5-update-bare-dot-refuses', mdpEsm, 'update', 'PUT', '/dot-upd/:id', 'dotUpdThing', '.', "'.'");
    // Percent-encoded '.' — single-encoded, both hex-digit cases — must be
    // caught after decoding, exactly like the existing '..' encodings are.
    await hostileCase('f5-delete-encoded-dot-lower-refuses', mdpEsm, 'delete', 'DELETE', '/dot-enc-lo/:id', 'dotEncLoThing', '%2e', "'%2e'");
    await hostileCase('f5-delete-encoded-dot-upper-refuses', mdpCjs, 'delete', 'DELETE', '/dot-enc-hi/:id', 'dotEncHiThing', '%2E', "'%2E'");
    // Double-encoded '.' ('%25' decodes to '%', then '%2e' decodes to '.').
    await hostileCase('f5-delete-double-encoded-dot-refuses', mdpEsm, 'delete', 'DELETE', '/dot-enc2/:id', 'dotEnc2Thing', '%252e', "'%252e'");
    // Three dots — nothing-but-dots of any length, not just length 1 or 2.
    await hostileCase('f5-delete-triple-dot-refuses', mdpCjs, 'delete', 'DELETE', '/dot3/:id', 'dot3Thing', '...', "'...'");
  } catch (err) {
    for (const id of hostileCaseIds) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  const positiveCaseIds = [
    'pos-zero-id-succeeds',
    'pos-leading-zero-string-id-succeeds',
    'pos-uuid-id-succeeds',
    'pos-objectid-hex24-id-succeeds',
    'pos-bigint-id-succeeds',
    'pos-nested-route-valid-id-succeeds',
  ];

  try {
    // POSITIVE CONTROLS — legitimate ids must still work (a guard that refuses valid input is its own defect).
    await positiveCase('pos-zero-id-succeeds', mdpCjs, 'delete', 'DELETE', '/pos-zero/:id', 'posZeroThing', 0, '/pos-zero/0');
    await positiveCase('pos-leading-zero-string-id-succeeds', mdpEsm, 'delete', 'DELETE', '/pos-007/:id', 'pos007Thing', '007', '/pos-007/007');
    await positiveCase('pos-uuid-id-succeeds', mdpCjs, 'delete', 'DELETE', '/pos-uuid/:id', 'posUuidThing', '3fa85f64-5717-4562-b3fc-2c963f66afa6', '/pos-uuid/3fa85f64-5717-4562-b3fc-2c963f66afa6');
    await positiveCase('pos-objectid-hex24-id-succeeds', mdpEsm, 'delete', 'DELETE', '/pos-oid/:id', 'posOidThing', '507f1f77bcf86cd799439011', '/pos-oid/507f1f77bcf86cd799439011');
    await positiveCase('pos-bigint-id-succeeds', mdpCjs, 'delete', 'DELETE', '/pos-bigint/:id', 'posBigintThing', 10n, '/pos-bigint/10');
    await positiveCase('pos-nested-route-valid-id-succeeds', mdpEsm, 'delete', 'DELETE', '/pos-t/:id/comments', 'posNestedThing', '42', '/pos-t/42/comments');
  } catch (err) {
    for (const id of positiveCaseIds) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  await recorder.close();
  return results;
}
