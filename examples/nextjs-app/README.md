# Next.js (Pages Router) example

Shows `minder-data-provider` consumed as a real npm package (via the packed tarball, not `src/`) in a Next.js 15 Pages Router app: `MinderDataProvider` in `pages/_app.tsx`, `useMinder('users')` fetching from a local `pages/api/users.ts` mock endpoint, with loading/error/list states in `pages/index.tsx`.

From the repo root: `npm run build && npm pack`, then in this directory: `npm install && npm run build` (and optionally `npm start` to boot on port 3123).

Note: `MinderDataProvider` unconditionally imports `react-redux` and `@reduxjs/toolkit`, so both are listed here as real dependencies even though the library marks them `optional` peer dependencies.
