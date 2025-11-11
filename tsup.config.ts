import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Main entry (universal)
    index: 'src/index.ts',
    
    // Hook-only entry (smaller bundle)
    hook: 'src/hook/index.ts',
    
    // Platform-specific entry points
    'platforms/web': 'src/platforms/web.ts',
    'platforms/nextjs': 'src/platforms/nextjs.ts',
    'platforms/native': 'src/platforms/native.ts',
    'platforms/expo': 'src/platforms/expo.ts',
    'platforms/electron': 'src/platforms/electron.ts',
    'platforms/node': 'src/platforms/node.ts',
    
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
  splitting: false,
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
    '@tanstack/react-query',
    '@tanstack/react-query-devtools',
    '@reduxjs/toolkit',
    'react-redux',
    'axios',
    'immer',
    'dompurify',
    // Node.js built-ins that should not be in browser bundles
    'fs',
    'path',
    'fs/promises'
  ],
  
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";', // Mark as client component for Next.js
    };
  },
});