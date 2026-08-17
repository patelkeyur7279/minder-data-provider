import { defineConfig } from "vite";

// Deliberately separate from vite.config.ts: the reactRouter() plugin there
// expects a full framework build context (routes.ts, virtual server-build
// module, etc.) that a plain unit test of the data path doesn't need and
// shouldn't have to satisfy. Keeping this config plugin-free means
// `vitest run` only ever exercises the minder() call against the mock
// upstream — nothing route- or SSR-related.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
