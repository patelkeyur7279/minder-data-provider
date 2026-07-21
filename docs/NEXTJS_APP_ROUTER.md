# Next.js App Router (RSC) usage

> **Status (R-03 audit, 2026-07-19).** Works today with the standard "use client" provider
> pattern below. The hooks and provider are correctly marked `"use client"` in source, but the
> library's build does not yet *reliably* preserve those directives into the published bundle
> (see [Known limitation](#known-limitation)) — so always reach the client parts through **your
> own** `"use client"` boundary, which is the idiomatic App Router pattern anyway.

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

## Known limitation

`src/hooks/*` and `src/core/MinderDataProvider.tsx` begin with `"use client"` in source, but the
tsup build (`splitting: true`) currently relocates the directive during code-splitting — in some
published chunks (e.g. the one exporting `MinderDataProvider`) it is not a valid top-of-module
prologue. Consequence: importing a Minder **client** export *directly* into a Server Component can
raise the React error *"you're importing a component that needs useState… only works in a Client
Component."* The `"use client"` wrapper in step 3 avoids this entirely, so App Router apps work
today.

The fix — preserving directives through the build (e.g. `esbuild-plugin-preserve-directives`),
verified by a runnable App Router example in CI — is tracked as a follow-up in
`docs/product/BACKLOG.yaml` (R-03-BUILD). Until then, the wrapper pattern above is the supported
approach.
