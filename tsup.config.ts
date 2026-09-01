import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Main entry (universal)
    index: 'src/index.ts',

    // Minimal core entry (smallest bundle — minder + useMinder + provider)
    core: 'src/core.ts',

    // Server-only entry (secret resolution — never import in the browser)
    server: 'src/server.ts',

    // Hook-only entry (smaller bundle)
    hook: 'src/hook/index.ts',

    // Testing harness entry (mock ApiClient, provider fixtures, contract
    // replay, secret-leak assertion — for provider/adapter authors' tests)
    testing: 'src/testing/index.ts',

    // OPT-IN devtools entry (B5, fix-2.2.0-blockers): re-exports
    // `@tanstack/react-query-devtools` (an OPTIONAL peer). Deliberately NOT
    // imported by any other entry above — importing this one is the
    // consumer's explicit opt-in. See src/devtools-rq.ts header for the
    // full B5 backstory.
    'devtools-rq': 'src/devtools-rq.ts',

    // Platform-specific entry points
    'platforms/web': 'src/platforms/web.ts',
    'platforms/nextjs': 'src/platforms/nextjs.ts',
    'platforms/native': 'src/platforms/native.ts',
    'platforms/expo': 'src/platforms/expo.ts',
    'platforms/electron': 'src/platforms/electron.ts',
    'platforms/node': 'src/platforms/node.ts',

    // Provider packages (self-contained, certifiable dirs under providers/**)
    // Same single-file mapping as the 'platforms/*' entries above: the entry
    // key IS the dist-relative output path, so this lands at
    // dist/providers/supabase.{js,mjs,d.ts}.
    'providers/supabase': 'providers/supabase/src/index.ts',
    'providers/stripe': 'providers/stripe/src/index.ts',
    'providers/clerk': 'providers/clerk/src/index.ts',
    'providers/firebase': 'providers/firebase/src/index.ts',
    'providers/razorpay': 'providers/razorpay/src/index.ts',
    'providers/sentry': 'providers/sentry/src/index.ts',
    'providers/authjs': 'providers/authjs/src/index.ts',
    'providers/auth0': 'providers/auth0/src/index.ts',
    'providers/cognito': 'providers/cognito/src/index.ts',

    // Feature modules (for tree-shaking)
    'crud/index': 'src/crud/index.ts',
    'auth/index': 'src/auth/index.ts',
    'cache/index': 'src/cache/index.ts',
    'websocket/index': 'src/websocket/index.ts',
    'realtime/index': 'src/core/realtime/index.ts',
    'upload/index': 'src/upload/index.ts',
    'debug/index': 'src/debug/index.ts',
    'config/index': 'src/config/index.ts',
    'ssr/index': 'src/ssr/index.ts',
    'logger/index': 'src/logger/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: process.env.NODE_ENV !== 'production', // Only in development
  clean: true,
  // INVARIANT: splitting:true + "sideEffects": true. Splitting moves shared
  // state (React context creation, class/enum definitions) into cross-entry
  // chunks initialized by lazy __esm thunks; a consumer bundler that believes
  // the package is side-effect-free drops the imports that run those thunks and
  // every useMinder() call throws in PRODUCTION builds only ("reading
  // '_currentValue'" / "HttpMethod is undefined"). Verified across bundlers
  // (MDPD-17; dabd92d).
  //
  // Spec 1.3c (2026-07-21) made the CONTEXT side effect safe under
  // "sideEffects": false — createContext is now behind a lazy getter with
  // globalThis identity (src/core/singletons.ts + MinderContext.tsx), proven
  // across all export entries × {Rollup, Rspack} by verify:treeshake. The flip
  // to false is STILL BLOCKED, however, by the non-const TypeScript `enum`s
  // (src/constants/enums.ts): under false, HttpMethod's runtime init is dropped
  // for the /crud entry (useMinder.ts uses HttpMethod.GET/.POST as values) — the
  // dabd92d class. The complete fix is the enum -> `as const` reshape, which is
  // v3.0-gated (Spec 1.3c §3/Phase C). Until then "sideEffects": true stays.
  // Guarded by scripts/verify-consumer-treeshake.mjs (differential, dual-engine,
  // fail-on-broken) — run `npm run verify:treeshake` after any packaging change.
  splitting: true,
  treeshake: true,
  minify: true, // Enable minification to reduce bundle size
  
  // Target modern environments for better tree-shaking  
  target: 'es2020',
  
  // Remove unused code
  shims: false,
  
  // ✅ All dependencies are external (peer dependencies)
  // Users install these themselves - reduces bundle size by 96%!
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@tanstack/query-core',
    '@tanstack/react-query',
    '@tanstack/react-query-devtools',
    'axios',
    'immer',
    'dompurify',
    // Optional provider peer deps — lazy-loaded by their adapters, never bundled.
    '@supabase/supabase-js',
    'stripe',
    '@clerk/clerk-js',
    'firebase',
    'razorpay',
    '@sentry/browser',
    'next-auth',
    '@auth0/auth0-spa-js',
    'aws-amplify',
    'aws-amplify/auth',
    // Node.js built-ins that should not be in browser bundles
    'fs',
    'path',
    'fs/promises'
  ],
  
  esbuildOptions(options) {
    // Removed global "use client" banner - should only be in specific files that need it
  },

  // MEDIUM (transport-and-packaging fix): tsup's own minification pass
  // strips the `/* webpackIgnore: true */` magic comment
  // src/security/credentials.ts:214 puts on its dynamic `node:fs` import
  // (esbuild's `legalComments` option only controls where comments it
  // already classifies as "legal" land — an ordinary comment like this one
  // is removed by minification regardless of that setting; verified
  // empirically). scripts/preserve-webpack-ignore.mjs re-inserts it into the
  // built ESM chunk post-build — wired here via tsup's own `onSuccess` hook
  // (rather than package.json's `build` script, which is STRONG/out of this
  // change's scope) so it runs as an inseparable part of `tsup`'s own build
  // step, not a step a future edit to the npm script chain could drop.
  //
  // BLOCKER 1 (fix-nextjs-appouter-build-and-redirect-header-leak):
  // `splitting:true` (required, see above) merges every source module that
  // starts with a real `"use client";` directive into a SHARED chunk whose
  // top-level code esbuild wraps in a deferred lazy initializer — which
  // demotes that directive from a module-level directive into an inert
  // string expression buried inside a function body, so Next.js's build
  // never recognizes the chunk as client-marked and any App Router import of
  // `minder`/`configureMinder` fails `next build`/`next dev` outright.
  // scripts/fix-use-client-directive.mjs re-hoists it to the file's true
  // first statement post-build — see its own header comment for the full
  // mechanism and why it is chained here (same "inseparable part of tsup's
  // own build step" rationale as preserve-webpack-ignore.mjs above).
  onSuccess: 'node scripts/preserve-webpack-ignore.mjs && node scripts/fix-use-client-directive.mjs',
});