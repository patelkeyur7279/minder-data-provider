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
  // INVARIANT (revised — the enum/"non-const-enum" framing below was WRONG
  // and is what let this ship broken; see the tree-shake defect fix,
  // A9/A10): splitting:true + "sideEffects": false is safe ONLY while no
  // module reachable from a build entry contains a BUNDLE-INTERNAL
  // `require('../something')` call. Such a `require()` forces esbuild to
  // wrap the required module — and, transitively, everything it statically
  // depends on — in a deferred `__esm(() => {...})` lazy-init thunk, because
  // `require()` must return a fully-initialized module synchronously. Inside
  // that thunk, only function DECLARATIONS stay hoisted; every `const`/
  // `class`/object value (enums, singletons, whole classes) becomes a bare
  // `var X;` whose initializer runs only when the thunk is invoked. tsup
  // entries then become pure re-export forwarders around the shared chunk
  // that owns the thunk; a bundler resolves the re-export straight to the
  // defining chunk and, believing the package side-effect-free, drops the
  // forwarder module (and the init call it carried) — leaving the `var`
  // permanently `undefined` for any consumer bundling a single named import.
  // This is NOT specific to `enum` vs `as const`, NOT specific to classes vs
  // objects, and NOT specific to one export group — it is the SAME mechanism
  // for every non-function-declaration value inside the wrapper.
  //
  // The fix (A9/A10, 2026-09): remove every bundle-internal `require()` —
  // src/core/FeatureLoader.ts's lazy-loading `require()` fallback and
  // src/platforms/node.ts's dynamic-import/require fallback for
  // RouteProcessor — so esbuild never has a reason to emit `__esm` wrapping
  // in the first place. Do NOT "fix" a future recurrence with a local
  // concrete-value binding (e.g. `export const X = _X` re-export) at the
  // consumer-facing entry: that pattern (see the pre-fix HttpMethod
  // re-export this file used to point to) masks the automated guard by
  // anchoring ONE export while leaving every OTHER named import broken, and
  // it defeats tree-shaking for whoever imports the anchored export
  // (measured: 98KB instead of 128B for a single-export import). The
  // guard-worthy invariant is "zero `require('../...')` in src/**", not
  // "every export has a binding" — see
  // tests/packaging/no-esm-lazy-wrapper.test.ts and the differential,
  // per-export-named-import signal in scripts/verify-consumer-treeshake.mjs
  // (`npm run verify:treeshake`), which must be re-run after any packaging
  // change.
  splitting: true,
  treeshake: true,
  metafile: true, // required by scripts/fix-use-client-directive.mjs, which
  // reads dist/metafile-{esm,cjs}.json to know which built output each
  // "use client" source module ended up in; deleted after use (see that
  // script) so it never ships in the published tarball.
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
  // starts with a real `"use client";` directive into a SHARED chunk. esbuild
  // treats a directive that isn't literally a module's first statement as
  // invalid and DROPS it outright (with a "Module level directives ... was
  // ignored" warning) — there is nothing left in the emitted output for a
  // post-build script to find and hoist. scripts/fix-use-client-directive.mjs
  // instead INJECTS the directive, driven by this config's `metafile: true`
  // output: it reads dist/metafile-{esm,cjs}.json to find which built output
  // each "use client"-declaring source file ended up in, and prepends exactly
  // one directive to each such output — see its own header comment for the
  // full mechanism and why it is chained here (same "inseparable part of
  // tsup's own build step" rationale as preserve-webpack-ignore.mjs above).
  onSuccess: 'node scripts/preserve-webpack-ignore.mjs && node scripts/fix-use-client-directive.mjs',
});