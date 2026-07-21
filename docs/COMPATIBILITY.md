# Compatibility

What `minder-data-provider` supports, and how to know if your project meets the requirements.

> **Quickest check:** run `npx minder doctor` in your project. It reports whether your installed
> `react`, `react-dom`, and `@tanstack/react-query` meet the minimums below, with an exact
> `npm install …` fix for anything too old.

## Requirements (current: `minder-data-provider@2.2.0-beta.0`)

| Dependency | Supported range | Notes |
|---|---|---|
| **Node.js** | **≥ 20.0.0** | `engines.node`. Node 18 is EOL and lacks global WebCrypto (webhook verification needs it). |
| **npm** | ≥ 9.0.0 | Or a compatible pnpm/yarn (yarn/pnpm/bun are not yet CI-tested — see SUPPORT_MATRIX.md). |
| **React** | **18 or 19** (`^18 \|\| ^19`) | Required peer. React 19 is what CI runs. |
| **React DOM** | **18 or 19** | Required peer, must match your React major. |
| **@tanstack/react-query** | **≥ 5.90.6** (`^5`) | Required peer — minder's cache layer is built on it. |
| **@tanstack/query-core** | ≥ 5.90.6 | Pulled in with react-query. |
| **TypeScript** | 5.x | Optional; `.d.ts`/`.d.mts` shipped for `moduleResolution: bundler`/`node16`. |

### Frameworks (see [SUPPORT_MATRIX.md](./product/SUPPORT_MATRIX.md) for evidence levels)

| Framework | Status |
|---|---|
| React 19 (web) | Confirmed |
| Next.js Pages Router | Experimental (`./nextjs` entry, CI example) |
| Next.js App Router / RSC | Partial — works via the `"use client"` wrapper pattern ([NEXTJS_APP_ROUTER.md](./NEXTJS_APP_ROUTER.md)) |
| Vite + React | Inferred-works (pure ESM) |
| React Native / Expo, Electron, Node | Experimental (entries built + unit-tested; no on-device CI yet) |
| Edge (Workers/Vercel Edge/Deno/Bun) | Inferred-works for the `transport: 'fetch'` core path ([EDGE.md](./EDGE.md)) |

### Optional provider SDKs (only needed if you use that provider)

Each is an **optional** peer dependency, loaded on demand — installing minder pulls in none of them:
`@supabase/supabase-js ^2` · `stripe ^14` · `@clerk/clerk-js ^5` · `firebase ^10` · `razorpay ^2.9` ·
`@sentry/browser ^8`. `doctor` only version-checks these if you have them installed.

## How versioning works

- **Minimums are enforced at install.** The ranges above live in `peerDependencies`; npm/pnpm/yarn
  warn or error if your installed versions are below them.
- **Latest within a major is always fine.** `^5.90.6` accepts any `5.x` at or above `5.90.6`;
  `^18 || ^19` accepts the latest 18.x or 19.x.
- **A future *major* (React 20, react-query 6, …) is not auto-supported.** A caret range stops at the
  next major on purpose, because a major can introduce breaking changes. When those land we validate
  and publish a minder release that widens the range. Track it via the repo's releases/CHANGELOG.
- **Detecting your versions:** `minder doctor` reads your `node_modules` and compares against these
  minimums; in development the library also warns at runtime if it detects multiple/duplicate React
  copies (a common "hooks broke" cause).

If `doctor` says everything is satisfied and something still breaks, please open an issue with its
output — the error message is meant to be the documentation.

## Staying up to date (automated)

- **This repo** keeps its own dependencies current via Dependabot (`.github/dependabot.yml`).
- **Your app** can get grouped, compatible bumps by extending the shared Renovate preset:

  ```json
  // renovate.json in your project
  {
    "extends": ["github>patelkeyur7279/minder-data-provider//.github/renovate-preset"]
  }
  ```

  It groups the React and TanStack Query families (so `react`/`react-dom` never split, and Query
  packages move together) and labels `minder-data-provider` bumps — which is where a new,
  wider peer range arrives when a future React/react-query major is validated.

## Lean imports (avoid bundling React on the data/server/edge path)

If you only need the data functions (not the React hooks) — a Node service, a Server Component,
a Route Handler, an edge function — **import from `/core` or `/node`, not the package root.** The
root entry re-exports the hooks, so it pulls React into your bundle even if you only use `minder()`.

Measured (esbuild, minified + tree-shaken, `import { minder }` only, 2026-07-19):

| import | our-code | pulls React? |
|---|---|---|
| `from 'minder-data-provider'` (root) | ~170 kB | **yes** |
| `from 'minder-data-provider/core'` | ~117 kB | no |
| `from 'minder-data-provider/node'` | ~141 kB (React-free) | no |

```ts
// Server / edge / data-only — no React in the bundle:
import { minder } from 'minder-data-provider/node';          // pure Node data fn
import { configureMinder } from 'minder-data-provider/config'; // unified config (apiUrl), React-free
// or 'minder-data-provider/core' for the lean isomorphic core.

// React app (hooks) — the root entry is correct:
import { useMinder } from 'minder-data-provider';
```

> **Note (server config):** the current unified `configureMinder({ apiUrl, routes, … })` is
> available React-free from **`minder-data-provider/config`** (measured: pulls no React, no
> deprecation warning). `/node` also exports a `configureMinder`, but that is the older
> `{ baseURL }` configurator — for a pure-Node/server app, prefer `/config`.

(Re-run the numbers any time with `node benchmarks/overhead.mjs`-style bundling; the guidance is
"data/server/edge → a subpath entry; React UI → root".)

