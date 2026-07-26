// Uses Next.js's built-in `next/jest` transform (SWC) so no separate
// ts-jest/babel config is needed — the example stays self-contained with a
// minimal devDependency footprint.
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  // Tests here exercise server-only code (API route handlers,
  // getServerSideProps) — no DOM is needed, so plain "node" avoids pulling in
  // jsdom as an extra dependency.
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};

module.exports = createJestConfig(customJestConfig);
