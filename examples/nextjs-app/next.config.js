const path = require("path");

// `build`/`dev` run with `--webpack` (see package.json): Turbopack (Next 16's
// default bundler) fails to build this example for two separate reasons,
// confirmed with both a `file:../..` symlinked install AND a real packed-
// tarball install (neither is symlink-specific):
//   1. With the symlinked install, Turbopack can't resolve the bare
//      `minder-data-provider` root import (`import { HttpMethod } from
//      "minder-data-provider"` in pages/_app.tsx) — subpath imports like
//      `minder-data-provider/nextjs` resolve fine. Node's own
//      `require.resolve` and webpack both resolve the root import correctly.
//   2. With the tarball install, Turbopack hard-fails build on the library's
//      dynamic `import('@tanstack/react-query-devtools')` (an optional
//      peerDependency this example doesn't install, referenced from a
//      dev-only, runtime-guarded branch) — webpack only warns.
// Neither looks like a library defect; both look like Turbopack build-time
// resolution gaps. Revisit dropping `--webpack` once those are fixed
// upstream.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This example lives nested inside the library's own repo (which has its
  // own package-lock.json), so Next.js can't correctly infer the workspace
  // root on its own. Pinning it here silences that warning; a real standalone
  // consumer project would not need this.
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
