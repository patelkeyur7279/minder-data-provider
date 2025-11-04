import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'crud/index': 'src/crud/index.ts',
    'auth/index': 'src/auth/index.ts',
    'cache/index': 'src/cache/index.ts',
    'websocket/index': 'src/websocket/index.ts',
    'upload/index': 'src/upload/index.ts',
    'debug/index': 'src/debug/index.ts',
    'config/index': 'src/config/index.ts',
    'ssr/index': 'src/ssr/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false, // Keep readable for debugging
  
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
    'immer'
  ],
  
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";', // Mark as client component for Next.js
    };
  },
});