# Next.js (Pages Router) example

Shows `minder-data-provider` consumed as a real npm package (via the packed tarball, not `src/`) in a Next.js 15 Pages Router app: `MinderDataProvider` in `pages/_app.tsx`, `useMinder('users')` fetching from a local `pages/api/users.ts` mock endpoint, with loading/error/list states in `pages/index.tsx`.

From the repo root: `npm run build && npm pack`, then in this directory: `npm install && npm run build` (and optionally `npm start` to boot on port 3123).

Note: `MinderDataProvider` uses TanStack Query for caching and MDP's own managers for auth/UI state — no Redux/global-store dependency. (Redux integration was removed; see the 3.0 migration guide.)
