# __APP_NAME__

A [minder-data-provider](https://github.com/patelkeyur7279/minder-data-provider) starter
(Vite + React + TanStack Query).

## Getting started

```bash
npm install
npm run dev
```

`src/App.tsx` shows the core idea: `useMinder(url)` fetches, caches, and tracks loading/error.
For your own API, call `configureMinder({ apiUrl: '...' })` once and use named routes.

## What's where

- `src/main.tsx` — wraps the app in `QueryClientProvider` (minder's cache layer is TanStack Query).
- `src/App.tsx` — a `useMinder` demo against a public API.
- `.env.example` — copy to `.env`. Public vars use the `VITE_` prefix; keep provider **secrets**
  server-side (never expose them to the browser).

Run `npx minder doctor` any time to check your setup and dependency versions.
