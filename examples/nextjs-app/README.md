# Next.js (Pages Router) example

Shows `minder-data-provider` consumed as a real npm package (via `npm install ../../minder-data-provider-*.tgz`,
not `src/`) in a Next.js 16 Pages Router app, and is CI-provable end to end.

## What it proves

- **`MinderDataProvider` + `useMinder` (client-side)** &mdash; `pages/_app.tsx` wraps
  the app in `MinderDataProvider`; `pages/index.tsx` calls
  `useMinder('users')`, which fetches the local `pages/api/users.ts` route and
  renders loading/error/list states.
- **`getServerSideProps` + `minder()` (server-side, Pages Router specific)**
  &mdash; `pages/ssr-users.tsx` calls `minder()` (the library's server-callable
  core function, *not* the client hook) directly inside `getServerSideProps`,
  against a local mock upstream HTTP server (`mock-upstream.mjs`, mirroring
  `examples/edge-worker`'s pattern). The fetched name is already present in
  the HTML the server returns &mdash; no client JavaScript has to run for it to
  appear, which is what makes it provable with a plain `curl`.
- **An API route on the `minder-data-provider/server` entry** &mdash;
  `pages/api/webhook-demo.ts` uses `createWebhookHandler` (HMAC-SHA256 via
  WebCrypto) and `toNodeHandler` to adapt the library's web-standard handler
  to a Next.js Pages Router `(req, res)` API route, mirroring
  `examples/edge-worker`'s `/webhook` route ported from workerd to Node.
- **Provider server boundaries with zero keys required** &mdash;
  `pages/api/checkout-demo.ts` (Stripe, `createCheckoutHandler` + `secret()`)
  and `pages/api/firebase-health.ts` (`loadServiceAccount`, masked output
  only) both run in mock mode out of the box.

`MinderDataProvider` uses TanStack Query for caching and MDP's own managers
for auth/UI state &mdash; no Redux/global-store dependency (Redux integration
was removed; see the 3.0 migration guide).

## How to run it

From the repo root, build the library and pack it exactly as a real consumer would install it:

```bash
npm run build
npm pack
```

Then, from this directory:

```bash
npm install
npm install ../../minder-data-provider-*.tgz   # tarball override, matches CI
npm run build
```

Manual check:

```bash
node mock-upstream.mjs &      # mock upstream on :8790
npm start                     # next start -p 3123, in another terminal

curl -s http://localhost:3123/ssr-users | grep Ada        # SSR proof
curl -s http://localhost:3123/api/users | grep Ada        # API route
```

Kill the background processes (`mock-upstream.mjs`, `next start`) when done.

### `npm run ci:smoke`

`scripts/ci-smoke.mjs` is the automated version of the manual check above:
self-contained, starts the mock upstream on `127.0.0.1:8790` and `next start`
on `127.0.0.1:3123`, bounded-polls both until ready (30s timeout per server,
90s hard timeout overall), then verifies:

- the index page's HTML contains the Pages Router app-shell wrapper
  (`id="__next"`),
- `/ssr-users`' HTML contains `"Ada"` &mdash; proof `getServerSideProps` really
  called `minder()` server-side against the mock upstream, since no
  client-side JS ran to produce this response,
- `POST /api/webhook-demo` (the `minder-data-provider/server` entry) accepts a
  validly HMAC-signed request and returns `{"verified":true,...}`, and
  rejects a tampered signature with `401`,
- `GET /api/users` returns JSON containing an `"Ada"` entry.

It always kills the processes it started (success, failure, or interrupt) and
exits non-zero on the first failed assertion:

```bash
npm run build
npm run ci:smoke
```

### `npm test`

Two Jest unit tests (via `next/jest`, no extra transform config needed) that
exercise real code paths without booting a server:

- `tests/api-users.test.ts` &mdash; calls the `pages/api/users.ts` handler
  directly and asserts the response shape.
- `tests/ssr-users.test.ts` &mdash; mocks `minder-data-provider`'s `minder()`
  export and asserts `getServerSideProps` maps both the success and failure
  paths to the expected props.

```bash
npm test
```
