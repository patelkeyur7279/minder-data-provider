/**
 * fix-a-hostile-route-params (RELEASE BLOCKER): the hostile-route-param
 * escape on the STANDALONE `minder()` path — `options.params` substituted
 * into a registered route's `:param` URL-PATH template with NO validation at
 * all, reached by a real `node:http` server, no jsdom, a bare tarball
 * install. Exact reproduction (see routeParamSafety.ts's header comment for
 * the full write-up):
 *
 *   configureMinder({ apiUrl, routes: { updateUser: { url: '/users/:id',
 *     method: 'PUT' } } });
 *   await minder('updateUser', { name: 'attacker-controlled body' },
 *     { params: { id: '..' } });
 *
 * previously sent `PUT /` — the SITE ROOT — carrying the full body, with
 * `success:true` and ZERO throw. Confirmed as a NEGATIVE CONTROL against the
 * pre-fix build in this task's own report: `id:'..'` -> `PUT /?id=..`
 * (site root, redundant query too), `id:'5#'` -> `PUT /users/5?id=5%23`
 * (fragment truncation AND a redundant/leaking query param), `id:'5?a=1'`
 * -> `PUT /users/5?a=1&id=5%3Fa%3D1` (live caller-controlled query
 * injection), `id:''` -> `PUT /users/?id=` (collection fallback). All four
 * reproduced verbatim against a REAL recording server before the fix, then
 * re-run after restoring it to confirm each is now refused with ZERO wire
 * requests.
 *
 * The fix (`resolveRequest.ts`'s `substituteUrlParams`, the SAME shared
 * PATH-substitution choke point `ApiClient.request`, `ApiClient.requestRaw`,
 * AND the standalone `minder()` all call) now runs every value through
 * `routeParamSafety.ts`'s `validateRouteParamValue` — the identical detector
 * `operations.update`/`operations.delete`'s `assertValidResourceId` uses —
 * before substitution, so the standalone path can no longer diverge from the
 * CRUD path's protection. This driver is the standalone-`minder()`-path
 * mirror of `tests/wire/crud-id-hostile-inputs.mjs`'s F1/F4 hostile cases
 * and positive controls.
 */

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireAbs, importAbs, resolveEntry } = ctx.load;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  const recorder = await ctx.startRecordingServer();

  /**
   * HOSTILE case: standalone `minder(routeName, data, { params })` against a
   * registered route whose SHAPE is otherwise fine (a genuine ':id' path
   * placeholder) must report `success:false` with ZERO requests reaching the
   * recorder — never a throw (minder()'s documented "never throws by
   * default" contract), never a silently-escaped URL.
   */
  async function hostileCase(resultId, mdp, method, urlTemplate, routeName, params, paramsLabel) {
    recorder.clear();
    mdp.configureMinder({
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method, url: urlTemplate } },
    });
    const result = await mdp.minder(routeName, { title: 'hello' }, { params });
    const zeroRequests = recorder.records.length === 0;
    const refused = result?.success === false && result?.error?.code === 'UNSAFE_ROUTE_PARAM_VALUE';
    const pass = refused && zeroRequests;
    results.push({
      id: resultId,
      pass,
      message: pass
        ? `minder("${routeName}", data, { params: ${paramsLabel} }) on route "${urlTemplate}" refused (error.code="${result?.error?.code}", "${result?.error?.message}") — zero requests reached the wire`
        : `minder("${routeName}", data, { params: ${paramsLabel} }) did NOT refuse as expected: success=${result?.success}, error=${JSON.stringify(result?.error)}, ${recorder.records.length} request(s) reached the server: ${JSON.stringify(recorder.records)}`,
    });
  }

  /**
   * POSITIVE CONTROL: a LEGITIMATE param on a route that DOES carry a
   * genuine ':id' path placeholder must dispatch the exact expected
   * method+URL, with success:true and NO redundant '?id=' query string
   * appended alongside the path substitution (the `consumedKeys` exclusion
   * fix in minder.ts).
   */
  async function positiveCase(resultId, mdp, method, urlTemplate, routeName, params, expectedUrl, paramsLabel) {
    recorder.clear();
    mdp.configureMinder({
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method, url: urlTemplate } },
    });
    const result = await mdp.minder(routeName, { title: 'hello' }, { params });
    const rec = recorder.records[recorder.records.length - 1];
    const pass = result?.success === true && !!rec && rec.method === method && rec.url === expectedUrl;
    results.push({
      id: resultId,
      pass,
      message: pass
        ? `minder("${routeName}", data, { params: ${paramsLabel} }) — LEGITIMATE — correctly sent ${method} ${expectedUrl} (success:${result?.success})`
        : `minder("${routeName}", data, { params: ${paramsLabel} }) sent ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}, expected ${method} ${expectedUrl} (success:${result?.success}, error=${JSON.stringify(result?.error)})`,
    });
  }

  const hostileCaseIds = [
    'sph-standalone-minder-dotdot-id-refuses',
    'sph-standalone-minder-fragment-id-refuses',
    'sph-standalone-minder-query-injection-id-refuses',
    'sph-standalone-minder-empty-id-refuses',
    'sph-standalone-minder-encoded-traversal-id-refuses',
    'sph-standalone-minder-bare-dot-id-refuses',
    'sph-standalone-minder-encoded-dot-lower-id-refuses',
    'sph-standalone-minder-encoded-dot-upper-id-refuses',
    'sph-standalone-minder-double-encoded-dot-id-refuses',
    'sph-standalone-minder-triple-dot-id-refuses',
  ];

  try {
    // Exact reproduction: route /users/:id, minder('updateUser', body, { params: { id: '..' } })
    // previously sent PUT / (the SITE ROOT) with the full body — confirmed by this task's own
    // negative control against the pre-fix build.
    await hostileCase(
      'sph-standalone-minder-dotdot-id-refuses',
      mdpCjs,
      'PUT',
      '/users/:id',
      'updateUser',
      { id: '..' },
      "{ id: '..' }"
    );
    // Exact reproduction: route /t/:id/comments, minder(..., { params: { id: '5#' } }) previously
    // sent PUT /t/5 (the PARENT resource) plus a redundant '?id=5%23'.
    await hostileCase(
      'sph-standalone-minder-fragment-id-refuses',
      mdpEsm,
      'PUT',
      '/t/:id/comments',
      'tThingStandalone',
      { id: '5#' },
      "{ id: '5#' }"
    );
    // Exact reproduction: route /flat/:id, minder(..., { params: { id: '5?a=1' } }) previously sent
    // PUT /flat/5?a=1&id=5%3Fa%3D1 — a LIVE caller-controlled query param merged onto the real request.
    await hostileCase(
      'sph-standalone-minder-query-injection-id-refuses',
      mdpCjs,
      'PUT',
      '/flat/:id',
      'flatThingStandalone',
      { id: '5?a=1' },
      "{ id: '5?a=1' }"
    );
    // Exact reproduction: route /users/:id, minder(..., { params: { id: '' } }) previously sent
    // PUT /users/?id= — the COLLECTION, not the single resource the caller intended.
    await hostileCase(
      'sph-standalone-minder-empty-id-refuses',
      mdpEsm,
      'PUT',
      '/users/:id',
      'usersEmptyStandalone',
      { id: '' },
      "{ id: '' }"
    );
    // Encoded traversal must be caught after bounded percent-decoding, mirroring the CRUD-path F4 coverage.
    await hostileCase(
      'sph-standalone-minder-encoded-traversal-id-refuses',
      mdpCjs,
      'PUT',
      '/enc/:id',
      'encThingStandalone',
      { id: '%2e%2e%2f' },
      "{ id: '%2e%2e%2f' }"
    );

    // fix-route-param-dot-segment-detector (RELEASE BLOCKER): a bare '.'
    // segment (and every encoding of it) normalizes exactly like '..' does
    // ('/users/.' -> '/users/') but was NOT refused by the prior '..'-only
    // blacklist — this is the standalone-minder()-path mirror of
    // crud-id-hostile-inputs.mjs's F5 cases, proving the SAME shared
    // choke point (substituteUrlParams -> validateRouteParamValue) closes
    // this gap for the standalone path too.
    await hostileCase(
      'sph-standalone-minder-bare-dot-id-refuses',
      mdpEsm,
      'PUT',
      '/dot-standalone/:id',
      'dotThingStandalone',
      { id: '.' },
      "{ id: '.' }"
    );
    await hostileCase(
      'sph-standalone-minder-encoded-dot-lower-id-refuses',
      mdpCjs,
      'PUT',
      '/dot-enc-lo-standalone/:id',
      'dotEncLoThingStandalone',
      { id: '%2e' },
      "{ id: '%2e' }"
    );
    await hostileCase(
      'sph-standalone-minder-encoded-dot-upper-id-refuses',
      mdpEsm,
      'PUT',
      '/dot-enc-hi-standalone/:id',
      'dotEncHiThingStandalone',
      { id: '%2E' },
      "{ id: '%2E' }"
    );
    await hostileCase(
      'sph-standalone-minder-double-encoded-dot-id-refuses',
      mdpCjs,
      'PUT',
      '/dot-enc2-standalone/:id',
      'dotEnc2ThingStandalone',
      { id: '%252e' },
      "{ id: '%252e' }"
    );
    await hostileCase(
      'sph-standalone-minder-triple-dot-id-refuses',
      mdpEsm,
      'PUT',
      '/dot3-standalone/:id',
      'dot3ThingStandalone',
      { id: '...' },
      "{ id: '...' }"
    );
  } catch (err) {
    for (const id of hostileCaseIds) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  const positiveCaseIds = [
    'sph-standalone-minder-zero-id-succeeds',
    'sph-standalone-minder-leading-zero-string-id-succeeds',
    'sph-standalone-minder-uuid-id-succeeds',
    'sph-standalone-minder-nested-route-id-succeeds',
    'sph-standalone-minder-no-redundant-query-param',
  ];

  try {
    // POSITIVE CONTROLS — legitimate params must still work (a guard that refuses valid input is its own defect).
    await positiveCase(
      'sph-standalone-minder-zero-id-succeeds',
      mdpEsm,
      'PUT',
      '/pos-zero-standalone/:id',
      'posZeroStandalone',
      { id: 0 },
      '/pos-zero-standalone/0',
      '{ id: 0 }'
    );
    await positiveCase(
      'sph-standalone-minder-leading-zero-string-id-succeeds',
      mdpCjs,
      'PUT',
      '/pos-007-standalone/:id',
      'pos007Standalone',
      { id: '007' },
      '/pos-007-standalone/007',
      "{ id: '007' }"
    );
    await positiveCase(
      'sph-standalone-minder-uuid-id-succeeds',
      mdpEsm,
      'PUT',
      '/pos-uuid-standalone/:id',
      'posUuidStandalone',
      { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      '/pos-uuid-standalone/3fa85f64-5717-4562-b3fc-2c963f66afa6',
      "{ id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }"
    );
    await positiveCase(
      'sph-standalone-minder-nested-route-id-succeeds',
      mdpCjs,
      'GET',
      '/pos-t-standalone/:id/comments',
      'posNestedStandalone',
      { id: '42' },
      '/pos-t-standalone/42/comments',
      "{ id: '42' }"
    );

    // no-redundant-query-param: a legitimate id substituted into the PATH must
    // not ALSO be appended as '?id=...' — proves the minder.ts `consumedKeys`
    // exclusion fix, not just the value-validation fix above.
    recorder.clear();
    mdpEsm.configureMinder({
      apiUrl: recorder.baseUrl,
      routes: { noRedundantQueryStandalone: { method: 'PUT', url: '/no-redundant-standalone/:id' } },
    });
    const result = await mdpEsm.minder('noRedundantQueryStandalone', { title: 'hello' }, { params: { id: '42' } });
    const rec = recorder.records[recorder.records.length - 1];
    const expectedUrl = '/no-redundant-standalone/42';
    const pass = result?.success === true && !!rec && rec.url === expectedUrl && !rec.url.includes('?');
    results.push({
      id: 'sph-standalone-minder-no-redundant-query-param',
      pass,
      message: pass
        ? `minder("noRedundantQueryStandalone", data, { params: { id: '42' } }) sent ${rec.method} ${rec.url} — id substituted into the PATH only, no redundant '?id=' query string`
        : `redundant-query-param regression: sent ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'} (expected ${expectedUrl} with no query string), success=${result?.success}`,
    });
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
