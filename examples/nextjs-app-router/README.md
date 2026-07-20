# Next.js (App Router) example

Proves `minder-data-provider` works under the Next.js 15 **App Router**, consumed as a real npm package (via the packed tarball, not `src/`):

- `app/layout.tsx` — Server Component root layout mounting the client `Providers` component.
- `app/providers.tsx` — `"use client"`: TanStack `QueryClientProvider` + `MinderDataProvider`.
- `app/page.tsx` — Server Component page rendering the client component (proves the RSC boundary works).
- `app/users-client.tsx` — `"use client"`: `useMinder('users')` from `minder-data-provider`.
- `app/api/users/route.ts` — local route handler returning fixed JSON.

## Proof commands

From this directory:

```sh
npm install
npm run build
```

`next build` must succeed, including static prerender of the `/` page. (If the tarball is missing, run `npm run build && npm pack` at the repo root first. TypeScript and `@types/*` resolve from the repo root's `node_modules`, so run `npm install` at the repo root too.)

Optionally `npm start` boots the app on port 3124; `/` renders the user list fetched through `useMinder` from `/api/users`.
