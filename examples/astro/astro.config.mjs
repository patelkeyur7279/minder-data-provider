import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// output: 'server' + the @astrojs/node adapter (standalone mode) is deliberate —
// it proves minder() runs at real REQUEST time under Astro's Node SSR runtime,
// not just once at static-build time. `astro build` emits a standalone server
// entry (dist/server/entry.mjs) that is started directly with `node` for the
// ci:smoke check (see package.json "serve" / "ci:smoke" scripts).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
});
