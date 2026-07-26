# Astro example (SSR + React island)

This example proves `minder-data-provider` runs inside **Astro with React
islands**: a server-rendered `.astro` page that calls `minder()` directly at
request time, plus a hydrated React island that calls `useMinder()` in the
browser.

## Why `output: 'server'` + `@astrojs/node` (not static)

`astro.config.mjs` uses `output: 'server'` with the `@astrojs/node` adapter in
`standalone` mode, rather than Astro's default static output with a
build-time fetch. A static build's data fetch runs once, at `astro build`
time, and produces the same frozen HTML on every request — it wouldn't prove
`minder()` works at real **request time** under Astro's server runtime. The
server-output + Node-adapter combination builds a real request handler
(`dist/server/entry.mjs`) that is started and hit over HTTP in `ci:smoke`, so
a green run is genuine SSR evidence, not a build-time snapshot.

## What it proves

- **`src/pages/index.astro`** — server-side data path. The frontmatter calls
  `minder('/users', ..., { baseURL: UPSTREAM_BASE_URL })` directly against the
  mock upstream (`mock-upstream.mjs`, copied from
  [`../edge-worker/mock-upstream.mjs`](../edge-worker/mock-upstream.mjs)) at
  request time, and renders the result into the HTML.
- **`src/components/UsersIsland.tsx`** (mounted with `client:load`) — client
  data path. `UsersList.tsx` calls `useMinder('users')`, wired through
  `Providers.tsx` (`QueryClientProvider` + `MinderDataProvider`) to this app's
  own `src/pages/api/users.ts` endpoint, which itself relays to the mock
  upstream via `minder()`. Routing the client through a same-origin API
  endpoint (rather than the browser calling `:8788` directly) avoids CORS and
  mirrors the pattern in
  [`../nextjs-app-router/app/providers.tsx`](../nextjs-app-router/app/providers.tsx).

## Dependency pattern

Like the other non-edge examples, this app depends on the library via
`"minder-data-provider": "file:../.."` (see `package.json`), and
`package-lock.json` resolves that entry as a plain filesystem `link` with no
tarball integrity hash. That's what makes CI's tarball override — packing the
repo root (`npm pack`) and running `npm install ../../minder-data-provider-*.tgz`
from this directory — a clean substitution instead of an integrity mismatch.

## Scripts

- `npm run dev` — Astro dev server on port 4321.
- `npm run build` — `astro build` (produces `dist/server/entry.mjs`).
- `npm run serve` — runs the built standalone server directly
  (`node ./dist/server/entry.mjs`).
- `npm test` — Vitest unit tests on the data path (client hook rendering +
  the `/api/users` server relay), with `minder-data-provider` mocked.
- `npm run ci:smoke` — self-contained runtime smoke test (see below).

## `ci:smoke` contract

`scripts/ci-smoke.mjs`:

1. Starts the mock upstream (`node mock-upstream.mjs`) on `127.0.0.1:8788`.
2. Starts the built server (`node ./dist/server/entry.mjs`) on
   `127.0.0.1:4322` (requires `npm run build` first).
3. Polls both with bounded retries (15s timeout, 250ms interval — never hangs).
4. Fetches `http://127.0.0.1:4322/` and asserts the HTML contains the SSR
   marker `"Astro SSR example page rendered."` **and** the server-fetched
   user name `"Ada"` — proof that `minder()` really ran server-side against
   the mock upstream for this request.
5. Always kills both background processes in a `finally` block and exits
   non-zero on any failure.

## How to run it locally

```bash
# From the repo root, build the library and pack the tarball this example
# depends on when reproducing the CI override locally:
npm run build
npm pack

# From this directory:
npm install
# Optional — reproduce CI's tarball override exactly:
npm install ../../minder-data-provider-*.tgz

npm run build
npm test
npm run ci:smoke
```

## Support Matrix

Evidence for the Astro / React-islands row in
[`../../docs/product/SUPPORT_MATRIX.md`](../../docs/product/SUPPORT_MATRIX.md).
