# React Router (Remix) example

This example proves `minder-data-provider` works in **React Router v7,
framework mode** — the actively-maintained, current continuation of Remix
(Remix was folded into React Router as of v7; see
[`.claude/notes/research-remix.md`](../../.claude/notes/research-remix.md)
for the currency check and the reasoning for pinning to the `7.x` line
instead of the newly-released `8.x`).

## What it proves

- **SSR loader → `minder()`** — [`app/routes/home.tsx`](app/routes/home.tsx)'s
  `loader` calls `minder()` (root `minder-data-provider` export) server-side
  against a local mock upstream (`mock-upstream.mjs`, same pattern as
  [`../edge-worker/mock-upstream.mjs`](../edge-worker/mock-upstream.mjs)),
  forced onto the native-fetch transport. The result renders straight into
  the initial server-rendered HTML — visible via `curl`, no client JS
  required.
- **Client `useMinder()`** — [`app/users-client.tsx`](app/users-client.tsx),
  wrapped by [`app/providers.tsx`](app/providers.tsx) (`QueryClientProvider` +
  `MinderDataProvider`), fetches the same data client-side via the
  `useMinder("users")` hook against a same-origin resource route
  ([`app/routes/api.users.tsx`](app/routes/api.users.tsx)) — no CORS
  configuration needed.
- Both paths go through `minder()` against the same mock upstream, so this
  is one proof point covering the server (loader) and client (hook) halves
  of the library's data-fetching surface under React Router's SSR framework.

## How to run it locally

From the repo root, build the library and pack the tarball this example can
be pointed at (or use the `file:../..` link that's already in
`package.json` for local dev):

```bash
npm run build
npm pack
```

From this directory:

```bash
npm install
# To install from the tarball instead of the file: link, as CI does:
#   npm install ../../minder-data-provider-*.tgz

npm run build          # react-router build → build/server, build/client
node mock-upstream.mjs &                 # mock upstream on :8788
PORT=3131 npx react-router-serve ./build/server/index.js &   # app on :3131
```

Then:

```bash
curl -s http://127.0.0.1:3131/ | grep -o 'Ada'          # SSR loader data
curl -s http://127.0.0.1:3131/api/users                  # client-side resource route
```

Kill the background processes (`mock-upstream.mjs`, `react-router-serve`)
when done.

## CI-style smoke test

```bash
npm run build
npm run ci:smoke
```

`ci:smoke` ([`ci-smoke.sh`](ci-smoke.sh)) starts the mock upstream and the
already-built app on fixed ports (`8788` / `3131`), waits for both with
bounded timeouts, curl-verifies the served HTML contains the
`data-testid="app-root"` marker and the loader-fetched `"Ada"` data, and
always kills its background processes on exit — success or failure.

## Unit tests

```bash
npm test
```

[`test/data-path.test.ts`](test/data-path.test.ts) exercises the `minder()`
call the loader and resource route both make, against a throwaway mock
`http` server — independent of the framework/build, so it stays fast.

## Dependency pattern

`package.json` depends on `minder-data-provider` via `file:../..` (a
directory link, for local development against the in-repo source) with a
commit-able `package-lock.json` that carries **no tarball integrity hash**
for that entry — so the same lockfile resolves correctly whether `npm
install` sees the `file:` link (local/dev) or a `npm pack` tarball installed
over it (`npm install ../../minder-data-provider-*.tgz`, the CI pattern used
by [`../edge-worker`](../edge-worker)).
