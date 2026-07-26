/**
 * Standalone Jest config for this example.
 *
 * Uses tsconfig.json's "module"/"moduleResolution": "node16" as-is — needed
 * so TypeScript resolves the library's subpath exports (e.g.
 * "minder-data-provider/node", "/config", "/server") via its package.json
 * "exports" map, which only "node16"/"nodenext"/"bundler" resolution
 * understands. This package.json has no "type" field, so node16 still
 * compiles every .ts file to CommonJS output (the default for an untyped
 * package) — which is what Jest's runtime needs.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
