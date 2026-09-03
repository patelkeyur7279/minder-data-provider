# Next.js App Router (RSC) usage

> **Status (R-03 audit, 2026-07-19; directive fix 2026-08-26).** Works today with the standard "use client" provider
> pattern below. The hooks and provider are correctly marked `"use client"` in source, and the
> library's build now **reliably** preserves those directives into the published bundle via a
> post-build step (`scripts/fix-use-client-directive.mjs`) and a regression guard
> (`tests/packaging/use-client-directive-position.test.ts`). Always reach the client parts through **your
> own** `"use client"` boundary — this is the idiomatic App Router pattern and required by Next.js
> (rendering `<MinderDataProvider>` directly in a Server Component fails via ordinary App Router rules,
> not a library defect).
>
> **Fixed 2026-08-26 (tracked as P1):** prior to this date, calling `minder()`, `useAuthToken()`,
> or the zero-config `useMinder(url)` from a fresh App Router module graph — i.e. before anything
> else in that route had triggered `configureMinder`/a provider mount — threw
> `TypeError: Cannot assign to read only property 'undefined' of object '#<Object>'` from a
> cross-entry singleton store computing `globalThis[undefined]`. This affected the Server Component
> example in [§1](#1-fetch-data-in-a-server-component-with-minder) and any standalone use of
> `useAuthToken()`, not just the provider pattern below. It's fixed at the root cause
> (`src/core/singletons.ts`) and reproduced/re-verified in a genuinely fresh child `node` process
> (empty module graph) on both a success path and a dead-port failure path.

The App Router renders Server Components by default. Anything using React state, effects, or
context (all of Minder's hooks and `<MinderDataProvider>`) must live behind a `"use client"`
boundary. The pure `minder()` function has no hooks and is server-safe.

## 1. Fetch data in a Server Component with `minder()`

```tsx
// app/users/page.tsx  — a Server Component (no "use client")
import { minder } from 'minder-data-provider';

export default async function UsersPage() {
  const { data } = await minder('users');           // runs on the server, no hooks
  return <ul>{data?.map((u: any) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

`minder()` uses no React APIs, so it is safe in Server Components, Route Handlers, and Server
Actions. On edge runtimes add `{ transport: 'fetch' }` (see [EDGE.md](./EDGE.md)).

## 2. Use hooks in a Client Component

Any component calling `useMinder` is a Client Component — put `"use client"` at the top of
**your** file (this is required for *any* React hook, not specific to Minder):

```tsx
// app/users/UserList.tsx
'use client';
import { useMinder } from 'minder-data-provider';

export function UserList() {
  const { data, loading } = useMinder('users');
  if (loading) return <p>Loading…</p>;
  return <ul>{data?.map((u: any) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

## 3. Mount the provider through a `"use client"` wrapper

Do **not** import `<MinderDataProvider>` directly into `app/layout.tsx` (a Server Component).
Wrap it in your own client file — the standard App Router providers pattern:

```tsx
// app/providers.tsx
'use client';
import { MinderDataProvider } from 'minder-data-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <MinderDataProvider>{children}</MinderDataProvider>;
}
```

```tsx
// app/layout.tsx  — stays a Server Component
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
```

## The `"use client"` wrapper pattern (why it's required)

`<MinderDataProvider>` is a React Context provider, which requires a client boundary. Next.js
enforces this rule in App Router: you cannot render a context provider directly in a Server Component.
This is not specific to Minder — **every** React hook, state, or context consumer must live behind
`"use client"`. The wrapper pattern in step 3 above is the standard approach for all React providers
in App Router, not a Minder-specific workaround.

The `"use client"` directives in `src/hooks/*` and `src/core/MinderDataProvider.tsx` are
now reliably preserved through the tsup build via a post-build step (`scripts/fix-use-client-directive.mjs`)
that re-hoists directives to their true module-first position after code-splitting. A regression
guard (`tests/packaging/use-client-directive-position.test.ts`) ensures the directive never appears
anywhere but a module's first statement. This was fixed on 2026-08-26 and verified end-to-end
against a real Next.js 15 App Router app installed from `npm pack`.

## Rollup- and Vite-based RSC frameworks: keep the package external

**Limitation, and it cannot be fixed in this package.** Rollup deletes every module-level
directive other than `"use strict"` from any module it bundles, and warns:

```
(!) node_modules/minder-data-provider/dist/chunk-XXXXXXXX.mjs (1:0):
    Module level directives cause errors when bundled, "use client" in "..." was ignored.
```

This is unconditional Rollup behaviour, not something this package's build causes or can work
around. Verified against rollup 4.62.2:

- it happens with a **single** module and nothing to merge with;
- it happens with `output.preserveModules: true` (one output file per input module);
- it happens identically to **your own** `"use client"` source files, not only to files in
  `node_modules` — the rule is applied when Rollup parses a module, before chunking.

Nothing an npm package can publish survives it: anything that *would* survive is, by definition,
no longer a directive prologue, so no RSC compiler would recognise it either.

**This does not affect Next.js.** Next.js (Turbopack and webpack) reads the directive from module
source and is verified end-to-end against this package. It also should not affect the RSC plugins
used by Vite-based frameworks (Waku, `@vitejs/plugin-rsc`), which detect `"use client"` in a
`transform` hook while reading module source — the four client chunks this package ships each
carry the directive as their literal first byte, which such a detector reads correctly. We have
no runnable Waku / Vite-RSC example, so that last point is reasoned, not measured.

It **does** matter if you re-bundle this package with plain Rollup — a library build, or a Vite
`build.rollupOptions` that inlines dependencies — and then hand the result to an RSC framework.
The client boundary is gone from the bundle you produced.

**Fix: do not inline this package.** Mark it external so Rollup never parses it:

```js
// rollup.config.mjs, or vite.config.js -> build.rollupOptions
export default {
  external: (id) => id === 'minder-data-provider' || id.startsWith('minder-data-provider/'),
};
```

Verified: zero `MODULE_LEVEL_DIRECTIVE` warnings, and `import ... from 'minder-data-provider'`
survives verbatim in the output, so the framework resolves the client chunks itself and reads
their directives intact.

If you must inline it, add `rollup-plugin-preserve-directives` (or an equivalent
`transform` + `renderChunk` plugin) to re-emit the directive on each output chunk. Note the
trade-off Rollup's own warning refers to: such a plugin marks the **whole** output chunk
`"use client"`, so any of your server-only modules that Rollup happened to place in the same
chunk become client modules too. Keeping the package external avoids that entirely.
