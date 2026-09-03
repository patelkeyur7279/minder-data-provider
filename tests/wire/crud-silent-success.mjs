/**
 * fix-a-crud-silent-success — closes BLOCKER 1, BLOCKER 2, BLOCKER 3, HIGH 5,
 * every one of which shares the same shape: an `operations.*`/`uploadFile()`
 * promise RESOLVED (or silently coerced to a benign-looking value) even
 * though the server never received — or was never asked to accept — the
 * request the caller actually intended. All cases drive the REAL BUILT
 * ARTIFACT against a REAL `node:http` server (see FIX_PLAN.md §5,
 * "Consumer isolation is the entire point" — mirrors every sibling driver in
 * this directory).
 *
 * BLOCKER 1 — `useOneTouchCrud('items').operations.create()` (and
 * update()/delete()) previously called `apiClient.request(routeName, item)`
 * with NO method override. `resolveRequest`'s fallback then dispatched the
 * REGISTERED route's OWN declared method — GET, for the normal single-route
 * "base collection route reused by fetch/create/update/delete" shape — so
 * create() sent a GET (hitting the SAME handler the list fetch used) and
 * resolved with that GET response standing in for "the created item", never
 * sending a POST at all. Fixed by routing create/update/delete through
 * `resolveCrudOperationRoute` — the exact helper `useMinder.ts`'s own
 * (non-deprecated) CRUD mutations already use.
 *
 * BLOCKER 2 — `operations.fetch()` returned `(result.data || []) as T[]`
 * unconditionally. Against a real 5xx with no prior successful fetch to fall
 * back to, TanStack Query's `refetch()` settles with `data: undefined` and
 * `isError: true` — the old code silently turned that into `[]` and
 * RESOLVED, indistinguishable from "the collection is empty". Fixed by
 * checking `refetch()`'s own returned `isError`/`error` (accurate
 * synchronously, unlike the hook's destructured `error`, which is a
 * stale-until-next-render closure value) and rethrowing.
 *
 * BLOCKER 3 — `ApiClient.request()` had no handling for a route registry
 * entry that is still a raw STRING (the documented hand-built-config
 * shorthand — `<MinderDataProvider config={{ routes: { thing: '/thing' } }}>`
 * without going through `configureMinder()`'s `generateCrudRoutes`
 * expansion). Falling through into the `ApiRoute`-only resolution read
 * `.url`/`.method` off a string primitive (both silently `undefined`),
 * resolving an undefined URL with a default-GET method regardless of the
 * caller's body — `useMediaUpload('thing').uploadFile(file)` against this
 * exact shape sent a bodyless GET with no Content-Type/Content-Length while
 * still resolving successfully. Fixed by dispatching a string-shorthand
 * entry through the same ad-hoc raw-path escape hatch an unregistered
 * leading-'/' name already uses.
 *
 * HIGH 5 — `ApiClient`'s axios response-interceptor retry loop retried ANY
 * retryable failure (no response, 5xx, 429) regardless of HTTP method. A
 * transient network failure on a POST was silently RESUBMITTED — the server
 * received the same write TWICE — while the caller's `await` still observed
 * the eventual rejection. Fixed by gating the retry on
 * `isIdempotentHttpMethod` (apiClient/idempotency.ts) — the same
 * idempotent-only rule `core/minder.ts`'s standalone retry loop already
 * enforces, applied to this SEPARATE (axios-interceptor) retry loop.
 */
import http from 'node:http';
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
  return new File(['blocker3 upload contents'], 'shorthand-upload.txt', { type: 'text/plain' });
}

/**
 * Real `node:http` server that answers GET with a canned "list" response and
 * every other method with a canned "created" response carrying the received
 * method — lets a case assert not just THAT a request was sent, but which
 * handler actually answered it (proves a create() call didn't just replay
 * the GET handler's response).
 */
function startMethodAwareServer() {
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      records.push({ method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers }, rawBody });
      res.writeHead(req.method === 'GET' ? 200 : 201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, receivedMethod: req.method, receivedUrl: req.url }));
    });
    req.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        records,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

/** Real `node:http` server whose response status is controllable per-call via `setStatus`. */
function startToggleStatusServer(initialStatus) {
  let status = initialStatus;
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      records.push({ method: req.method ?? '', url: req.url ?? '', rawBody });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(status >= 400 ? JSON.stringify({ error: 'server exploded' }) : JSON.stringify([{ id: 1, name: 'Ada' }]));
    });
    req.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        records,
        setStatus: (s) => { status = s; },
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

/**
 * Real `node:http` server that reads each request's body fully (so it is
 * genuinely RECEIVED — the HIGH 5 report's own "the server receives the SAME
 * POST body TWICE") and then DESTROYS the socket without ever writing a
 * response — simulating a transient network failure AFTER the server has the
 * body, which is exactly the shape a naive method-agnostic retry duplicates.
 */
function startSocketDropServer() {
  const records = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      records.push({ method: req.method ?? '', url: req.url ?? '', rawBody });
      req.socket.destroy();
    });
    req.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        records,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { importAbs, requireAbs, resolveEntry } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const entry = resolveEntry(scratchDir, '.');
  const mdpEsm = await importAbs(entry.esm);
  const mdpCjs = requireAbs(entry.cjs);

  const { React, ReactDOMClient, dom } = setupDom(scratchDir);

  /** Mounts a Probe rendering `hookFn(mdp)`, waits for it to populate `box.current`, and returns `{ box, unmount }`. */
  function mountProbe(mdp, config, hookFn) {
    const box = { current: undefined };
    function Probe() {
      box.current = hookFn(mdp);
      return null;
    }
    const { unmount } = renderHeadless(
      ReactDOMClient,
      dom.window.document,
      React.createElement(mdp.MinderDataProvider, { config }, React.createElement(Probe)),
    );
    return { box, unmount };
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 1 — operations.create()/update()/delete() send the REAL method.
  // ══════════════════════════════════════════════════════════════════════
  {
    const recorder = await startMethodAwareServer();
    try {
      const config = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items' } }, // single base route, no create/update/delete siblings — the exact shape BLOCKER 1 was reported against.
      });
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useOneTouchCrud('items'));
      try {
        await waitFor(() => box.current !== undefined && recorder.records.length >= 1, { timeout: 3000 });
        const created = await box.current.operations.create({ name: 'Grace' });
        const postRecords = recorder.records.filter((r) => r.method === 'POST');
        const bodyMatches = postRecords.some((r) => r.rawBody === JSON.stringify({ name: 'Grace' }));
        const resolvedFromRealPost = created && created.receivedMethod === 'POST';
        const pass = postRecords.length === 1 && bodyMatches && resolvedFromRealPost;
        results.push({
          id: 'blocker1-onetouchcrud-create-sends-real-post',
          pass,
          message: pass
            ? `operations.create() sent a real POST /items with body ${JSON.stringify({ name: 'Grace' })} and resolved with the POST handler's own response (receivedMethod:"POST"), not the GET handler's`
            : `expected exactly one real POST with the create body; got postRecords=${JSON.stringify(postRecords)} created=${JSON.stringify(created)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  {
    const recorder = await startMethodAwareServer();
    try {
      const config = mdpCjs.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items/:id' } },
      });
      const { box, unmount } = mountProbe(mdpCjs, config, (mdp) => mdp.useOneTouchCrud('items'));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        const updated = await box.current.operations.update(42, { name: 'Ada Lovelace' });
        const putRecords = recorder.records.filter((r) => r.method === 'PUT');
        const pass =
          putRecords.length === 1 &&
          putRecords[0].url === '/items/42' &&
          putRecords[0].rawBody === JSON.stringify({ name: 'Ada Lovelace' }) &&
          updated?.receivedMethod === 'PUT';
        results.push({
          id: 'blocker1-onetouchcrud-update-sends-real-put',
          pass,
          message: pass
            ? `operations.update(42, ...) sent a real PUT /items/42 with the update body and resolved from the PUT handler`
            : `expected exactly one real PUT /items/42; got putRecords=${JSON.stringify(putRecords)} updated=${JSON.stringify(updated)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  {
    const recorder = await startMethodAwareServer();
    try {
      const config = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items/:id' } },
      });
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useOneTouchCrud('items'));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        const deleted = await box.current.operations.delete(7);
        const deleteRecords = recorder.records.filter((r) => r.method === 'DELETE');
        const pass = deleteRecords.length === 1 && deleteRecords[0].url === '/items/7' && deleted?.receivedMethod === 'DELETE';
        results.push({
          id: 'blocker1-onetouchcrud-delete-sends-real-delete',
          pass,
          message: pass
            ? `operations.delete(7) sent a real DELETE /items/7 and resolved from the DELETE handler`
            : `expected exactly one real DELETE /items/7; got deleteRecords=${JSON.stringify(deleteRecords)} deleted=${JSON.stringify(deleted)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 2 — operations.fetch() surfaces a real 5xx instead of []; a
  // genuine success still resolves the real array (positive control).
  // ══════════════════════════════════════════════════════════════════════
  {
    const recorder = await startToggleStatusServer(500);
    try {
      const config = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items' } },
        performance: { retries: 0 }, // deterministic: fail on the FIRST attempt, no retry delay to wait out.
      });
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useOneTouchCrud('items', { autoFetch: false }));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        let threw = null;
        let resolvedValue;
        try {
          resolvedValue = await box.current.operations.fetch();
        } catch (err) {
          threw = err?.message ?? String(err);
        }
        const pass = threw !== null && resolvedValue === undefined;
        results.push({
          id: 'blocker2-onetouchcrud-fetch-rejects-on-real-500',
          pass,
          message: pass
            ? `operations.fetch() against a real 500 REJECTED ("${threw}") instead of silently resolving an empty array`
            : `expected a rejection; got threw=${JSON.stringify(threw)} resolvedValue=${JSON.stringify(resolvedValue)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  {
    const recorder = await startToggleStatusServer(200);
    try {
      const config = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items' } },
        performance: { retries: 0 },
      });
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useOneTouchCrud('items', { autoFetch: false }));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        const result = await box.current.operations.fetch();
        const pass = Array.isArray(result) && result.length === 1 && result[0].name === 'Ada';
        results.push({
          id: 'blocker2-onetouchcrud-fetch-resolves-on-success-positive-control',
          pass,
          message: pass
            ? `operations.fetch() against a real 200 still resolved the real array (not over-tightened into always throwing)`
            : `expected the real array; got ${JSON.stringify(result)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // BLOCKER 3 — uploadFile() against a hand-built, string-shorthand route
  // config (never expanded by configureMinder()) sends a real POST with a
  // real multipart body, not a bodyless GET.
  // ══════════════════════════════════════════════════════════════════════
  {
    const recorder = await startMethodAwareServer();
    try {
      // Deliberately HAND-BUILT — bypasses configureMinder()'s
      // generateCrudRoutes expansion, so `routes.thing` stays a raw string at
      // runtime exactly as `<MinderDataProvider config={...}>` is documented
      // to accept (see N4 in useMinder.helpers.ts).
      // NOTE: a hand-built `MinderConfig` (bypassing configureMinder()) uses
      // `apiBaseUrl`, NOT `apiUrl` — `apiUrl` is only configureMinder()'s own
      // INPUT shorthand, translated internally to `apiBaseUrl`.
      const config = { apiBaseUrl: recorder.baseUrl, routes: { thing: '/upload-shorthand' } };
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useMediaUpload('thing'));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        const result = await box.current.uploadFile(makeTestFile());
        const rec = recorder.records[recorder.records.length - 1];
        const contentType = rec?.headers?.['content-type'] ?? '';
        const isMultipart = /multipart\/form-data;\s*boundary=/i.test(contentType);
        const bodyLooksReal = !!rec && rec.rawBody.includes('shorthand-upload.txt') && rec.rawBody.includes('blocker3 upload contents');
        const pass = !!rec && rec.method === 'POST' && rec.url === '/upload-shorthand' && isMultipart && bodyLooksReal && result?.receivedMethod === 'POST';
        results.push({
          id: 'blocker3-uploadfile-string-shorthand-route-sends-real-post',
          pass,
          message: pass
            ? `uploadFile() against a hand-built string-shorthand route sent a real POST /upload-shorthand with a real multipart body (content-type=${JSON.stringify(contentType)})`
            : `expected a real multipart POST /upload-shorthand; got rec=${JSON.stringify(rec)} result=${JSON.stringify(result)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  // ── BLOCKER 3 FAILURE PATH — the same string-shorthand config against a
  //    real dead port still fails cleanly (rejects), proving the new
  //    raw-path dispatch doesn't trade "broken success" for "broken crash". ──
  {
    const deadPort = await getDeadPort();
    const config = { apiBaseUrl: `http://127.0.0.1:${deadPort}`, routes: { thing: '/upload-shorthand-dead' } };
    const { box, unmount } = mountProbe(mdpCjs, config, (mdp) => mdp.useMediaUpload('thing'));
    let threw = null;
    try {
      await waitFor(() => box.current !== undefined, { timeout: 3000 });
      await box.current.uploadFile(makeTestFile());
    } catch (err) {
      threw = err?.message ?? String(err);
    } finally {
      unmount();
    }
    const looksLikeGenuineCrash = threw !== null && /cannot read propert|is not a function|is not defined/i.test(threw);
    const pass = threw !== null && !looksLikeGenuineCrash;
    results.push({
      id: 'blocker3-uploadfile-string-shorthand-route-dead-port-clean-failure',
      pass,
      message: pass
        ? `uploadFile() against a hand-built string-shorthand route + a real dead port reported a clean, network-shaped failure ("${threw}") — no crash`
        : `expected a clean network-shaped failure; got threw=${JSON.stringify(threw)}`,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // HIGH 5 — a non-idempotent POST is never silently retried after a network
  // failure (no duplicate write reaches the server); an idempotent GET still
  // retries as before (positive control — the gate is method-specific, not a
  // blanket retry regression).
  // ══════════════════════════════════════════════════════════════════════
  {
    const recorder = await startSocketDropServer();
    try {
      const config = mdpEsm.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items' } },
        performance: { retries: 1, retryDelay: 10 }, // would retry once, fast, if the method-safety gate were absent.
      });
      const { box, unmount } = mountProbe(mdpEsm, config, (mdp) => mdp.useOneTouchCrud('items', { autoFetch: false }));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        let threw = null;
        try {
          await box.current.operations.create({ name: 'Duplicate Me' });
        } catch (err) {
          threw = err?.message ?? String(err);
        }
        // Give a would-be (buggy) retry time to land before counting records.
        await new Promise((r) => setTimeout(r, 400));
        const postRecords = recorder.records.filter((r) => r.method === 'POST');
        const pass = threw !== null && postRecords.length === 1;
        results.push({
          id: 'high5-post-not-retried-after-network-failure',
          pass,
          message: pass
            ? `operations.create() (POST) against a connection that drops mid-flight reached the server EXACTLY ONCE (no silent duplicate write) and the caller's await still rejected ("${threw}")`
            : `expected exactly 1 POST and a rejection; got postRecords.length=${postRecords.length} threw=${JSON.stringify(threw)} records=${JSON.stringify(recorder.records)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  {
    const recorder = await startSocketDropServer();
    try {
      const config = mdpCjs.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { items: { method: 'GET', url: '/items' } },
        performance: { retries: 1, retryDelay: 10, deduplication: false },
      });
      const { box, unmount } = mountProbe(mdpCjs, config, (mdp) => mdp.useOneTouchCrud('items', { autoFetch: false }));
      try {
        await waitFor(() => box.current !== undefined, { timeout: 3000 });
        try {
          await box.current.operations.fetch();
        } catch {
          // Expected — the connection drops every time; only the RETRY COUNT is under test here.
        }
        await waitFor(() => recorder.records.filter((r) => r.method === 'GET').length >= 2, { timeout: 3000 });
        // Settle buffer: TanStack Query's OWN query-level retry (a SEPARATE
        // layer from the axios-interceptor retry, driven by
        // MinderDataProvider's QueryClient default `queries.retry`) can still
        // be in flight after the awaited fetch() call rejects once — give it
        // room to finish before counting.
        await new Promise((r) => setTimeout(r, 300));
        const getRecords = recorder.records.filter((r) => r.method === 'GET');
        // Not asserting an EXACT count: an idempotent GET can be retried by
        // TWO independent layers (ApiClient's axios interceptor AND
        // TanStack Query's own query retry), which compound — the exact
        // total is an implementation detail of two independently-configured
        // knobs, not this fix's contract. The property under test is simply
        // "still retried more than once", proving the HIGH 5 gate is
        // method-specific and did not collapse idempotent retries to a single attempt.
        const pass = getRecords.length > 1;
        results.push({
          id: 'high5-get-still-retried-after-network-failure-positive-control',
          pass,
          message: pass
            ? `operations.fetch() (GET, idempotent) against the same connection-drop server still retried (${getRecords.length} real GET attempts reached the server) — the HIGH 5 fix is method-specific, not a blanket retry regression`
            : `expected more than 1 real GET attempt; got getRecords.length=${getRecords.length} records=${JSON.stringify(recorder.records)}`,
        });
      } finally {
        unmount();
      }
    } finally {
      await recorder.close();
    }
  }

  return results;
}
