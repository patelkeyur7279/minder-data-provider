# 🚀 Minder Examples - Complete Guide

> **Example status** (all refreshed to the current API / current deps, 2026-07):
> - ✅ **Verified here:** [`nextjs-app/`](./nextjs-app) (React 19 / Next 16, CI-tested, all certified-provider pages + local-first) · [`web/e-commerce`](./web/e-commerce) (Vite + React 19 — install + type-check + build + vitest verified) · [`nodejs/api`](./nodejs/api) (React-free `/node` entry — type-check + build + live `minder()` smoke-run verified).
> - ⚠️ **Refreshed but Experimental** (React 18.3 / RN 0.76 / current APIs, but **not** device/GUI-run here — per charter RK-5 they stay Experimental until on-device CI): [`electron/`](./electron) · [`expo/`](./expo) · [`react-native/`](./react-native).

**Examples** demonstrating features of Minder Data Provider across multiple platforms with **centralized configuration** and **Docker support**.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Examples Overview](#-examples-overview)
- [Centralized Configuration](#-centralized-configuration)
- [Docker Setup](#-docker-setup)
- [Manual Setup](#-manual-setup)
- [Available APIs](#-available-apis)
- [Troubleshooting](#-troubleshooting)

Every path below exists in this directory — confirmed with `ls` before writing this file down, not carried over from an older draft.

```
examples/
├── astro/                 # Astro + React islands (SSR) — CI-tested
├── custom-provider/       # defineProvider() reference implementation
├── edge-worker/           # Cloudflare Workers (workerd runtime) — CI-tested
├── electron/
│   └── desktop-app/       # Electron desktop app — CI headless smoke (xvfb)
├── expo/
│   └── quickstart/        # Expo SDK 52 / RN 0.76 — CI bundle + jest-expo evidence
├── mock-api/               # Shared mock API server used by several examples below
├── nextjs-app/             # Next.js Pages Router — CI-tested
├── nextjs-app-router/       # Next.js App Router / RSC — CI-tested
├── nodejs/
│   └── api/                 # Express API — Node-server evidence — CI-tested
├── react-native/
│   └── offline-todo/         # Offline-first RN todo app — not yet wired into CI
├── remix/                    # React Router v7, framework mode — CI-tested
├── shared/                    # Shared config/types reused across examples
└── web/
    └── e-commerce/             # Vite + React 19 e-commerce app — CI-tested
```

---

## 🎯 How to Use

### 1. Choose Your Platform

Navigate to your platform folder:

```bash
cd examples/web/e-commerce
# or
cd examples/nextjs-app
# or
cd examples/react-native/offline-todo
```

### 2. Install Dependencies

Each example has its own `package.json`:

```bash
npm install
```

### 3. Run the Example

```bash
npm start
# or
npm run dev
```

### 4. Run Tests

Every example includes tests:

```bash
npm test
```

---

## 🏆 Featured Examples

Descriptions below state what each example demonstrates and whether it runs in CI —
not test-pass counts, which this file doesn't run and won't guess at. See the status
banner at the top for the evidence behind "CI-tested."

### Web

#### 🛒 Vite + React 19 E-commerce

**Path**: `web/e-commerce/`

Product listing, shopping cart with optimistic updates, checkout flow. Install,
type-check, build, and the vitest suite all run in CI.

```bash
cd examples/web/e-commerce
npm install && npm run dev
```

---

### Next.js

#### Pages Router

**Path**: `nextjs-app/`

`MinderDataProvider` + `useMinder` client-side, `getServerSideProps` + `minder()`
server-side, a webhook API route (`createWebhookHandler` + `toNodeHandler`), and a
zero-key mock-mode Stripe checkout route. Consumed as a real npm package (packed
tarball, not `src/`). CI-tested.

```bash
cd examples/nextjs-app
npm install && npm run dev
```

#### App Router / RSC

**Path**: `nextjs-app-router/`

Server Component root layout mounting a client `Providers` component
(`QueryClientProvider` + `MinderDataProvider`), a Server Component page rendering a
client component that calls `useMinder`, and a local route handler. Proves the RSC
boundary works. CI-tested (`next build`, including static prerender).

```bash
cd examples/nextjs-app-router
npm install && npm run dev
```

---

### React Router (Remix)

**Path**: `remix/`

Proves the library on React Router v7 framework mode — the current continuation of
Remix. An SSR loader calling `minder()` server-side, plus a client `useMinder()` call
against a same-origin resource route (no CORS config needed). CI-tested.

```bash
cd examples/remix
npm install && npm run dev
```

---

### Astro

**Path**: `astro/`

Server-rendered `.astro` page calling `minder()` directly at request time
(`output: 'server'` + `@astrojs/node`, not a static build-time fetch), plus a
hydrated React island calling `useMinder()` in the browser. CI-tested.

```bash
cd examples/astro
npm install && npm run dev
```

---

### Cloudflare Workers (edge)

**Path**: `edge-worker/`

Runs on real workerd (no `nodejs_compat` flag) — the evidence behind the Support
Matrix's `Edge runtimes: Confirmed` row. A `minder()` JSON data path over native
fetch, plus HMAC-SHA256 webhook verification via `minder-data-provider/server`'s
`createWebhookHandler` (WebCrypto only). CI-tested.

```bash
cd examples/edge-worker
npm install && npm run dev
```

---

### Node.js

#### Express API

**Path**: `nodejs/api/`

The Node-server evidence: `minder()` over `minder-data-provider/node`, plus the same
HMAC webhook verification as the edge-worker example, mounted onto Express via
`toNodeHandler`. CI-tested.

```bash
cd examples/nodejs/api
npm install && npm run dev
```

---

### Electron

**Path**: `electron/desktop-app/`

Desktop app: REST data via `useMinder()`, native file dialogs, Electron-native local
storage, IPC via context bridge, multi-view UI (Dashboard, Users, Products, Files,
Settings). CI runs a headless smoke test under `xvfb` (hidden window, IPC data
proof) — not a full on-device GUI run; see the status banner above.

```bash
cd examples/electron/desktop-app
npm install && npm start
```

---

### Expo

**Path**: `expo/quickstart/`

Expo SDK 52 / React Native 0.76 / React 18.3.1: `useMinder()` for data fetching,
plus SecureStore, FileSystem, and ImagePicker integration. CI runs the jest-expo
suite and a bundle-content assertion — not an on-device run; see the status banner
above.

```bash
cd examples/expo/quickstart
npm install && npm start
```

---

### React Native

#### Offline Todo App

**Path**: `react-native/offline-todo/`

Offline-first architecture, optimistic UI updates, background sync, conflict
resolution, AsyncStorage, network detection, retry logic. Not currently wired into
CI (no `ci:smoke` job) — treat as Experimental until it is.

```bash
cd examples/react-native/offline-todo
npm install && npm run ios
# or
npm run android
```

---

### Supporting code (not standalone apps)

- **`custom-provider/`** — reference implementation for `defineProvider()`, linked
  from the main [README](../README.md) and
  [`docs/providers/CUSTOM.md`](../docs/providers/CUSTOM.md).
- **`mock-api/`** — local mock API server used by several examples above.
- **`shared/`** — config/types reused across examples.

---

## 🧪 Testing

There's no single root-level `test:examples` (or per-platform `test:web` /
`test:nextjs` / `test:native`) script — each example is its own package with its
own scripts. Most have a `test` script, and the CI-tested ones (see the status
banner at the top) also have a `ci:smoke` script that's the actual evidence:

```bash
cd examples/<example-path>
npm install
npm test        # where present
npm run ci:smoke  # where present — same check CI runs
```

---

## 🎓 Learning Path

### Beginner

1. Start with [`web/e-commerce/`](./web/e-commerce) — a plain Vite + React app,
   simplest place to see `useMinder()` in a real UI.
2. Try [`nextjs-app/`](./nextjs-app) — Pages Router, learn SSR via
   `getServerSideProps` + `minder()`.
3. Explore [`nodejs/api/`](./nodejs/api) — backend integration, no React at all.

### Intermediate

1. [`nextjs-app-router/`](./nextjs-app-router) — Server Components, the RSC
   boundary, and `useMinder()` inside a client component.
2. [`remix/`](./remix) — React Router v7 framework mode, loader-based SSR.
3. [`react-native/offline-todo/`](./react-native/offline-todo) — offline-first
   patterns, background sync, conflict resolution.

### Advanced

1. [`edge-worker/`](./edge-worker) — running on bare workerd, plus HMAC webhook
   verification over WebCrypto.
2. [`astro/`](./astro) — request-time SSR data fetching alongside a hydrated
   React island.
3. [`electron/desktop-app/`](./electron/desktop-app) — desktop app with native
   file/storage integration.

---

## 🔧 Requirements

The library itself requires **Node ≥ 20** and **npm ≥ 9** (see the main
[README](../README.md#install)) — every example inherits that floor. Per-example
framework versions (verified against each example's own `package.json`):

| Example                | Framework version pinned    |
| ----------------------- | --------------------------- |
| `nextjs-app/`            | Next.js ^16                 |
| `nextjs-app-router/`      | Next.js ^15                 |
| `remix/`                  | React Router ^7             |
| `astro/`                   | Astro (server output, `@astrojs/node`) |
| `web/e-commerce/`           | Vite + React 19              |
| `electron/desktop-app/`      | Electron ^43                 |
| `expo/quickstart/`            | Expo ~52 / React Native 0.76.5 |
| `react-native/offline-todo/`   | React Native 0.76.5          |

iOS builds (Electron packaging aside) additionally need Xcode; Android builds need
Android Studio / the Android SDK. See each example's own README for specifics.

---

## 🐛 Troubleshooting

### Issue: `Cannot find module 'minder-data-provider'`

**Solution**: Link the package locally

```bash
# In project root
npm link

# In example directory
npm link minder-data-provider
```

### Issue: Tests failing

**Solution**: Ensure all dependencies installed

```bash
npm install
npm test -- --clearCache
npm test
```

### Issue: React Native build errors

**Solution**: Clean and rebuild

```bash
cd ios && pod install && cd ..
npm run ios
```

---

## 📚 Documentation

Each example includes its own `README.md` with overview, setup, and (for the
CI-tested examples) exactly what it proves and how. There's no separate
`ARCHITECTURE.md` or `TESTING.md` per example — that detail lives in the README
itself.

---

## 🤝 Contributing

Want to add an example?

1. Create a new directory in the appropriate platform folder
2. Include `package.json`, `README.md`, and tests
3. Ensure all tests pass
4. Submit a PR

---

## 📝 License

All examples are MIT licensed, same as the main package.
