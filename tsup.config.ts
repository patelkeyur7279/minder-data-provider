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

    // Feature modules (for tree-shaking)
    'crud/index': 'src/crud/index.ts',
    'auth/index': 'src/auth/index.ts',
    'cache/index': 'src/cache/index.ts',
    'websocket/index': 'src/websocket/index.ts',
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
    // Node.js built-ins that should not be in browser bundles
    'fs',
    'path',
    'fs/promises'
  ],
  
  esbuildOptions(options) {
    // Removed global "use client" banner - should only be in specific files that need it
  },
});