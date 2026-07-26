#!/usr/bin/env node
// Self-contained CI smoke test for the Expo quickstart.
//
// Assumes `npm run build` has already produced dist/ (the exported Metro/
// Hermes bundles for ios + android) -- this script does not build. It:
//   1. runs the jest-expo test suite (renders a component that uses
//      useMinder() from "minder-data-provider/expo" against a mocked
//      fetch, in-process -- no simulator/device involved), and
//   2. asserts minder-data-provider's code is actually present in both
//      exported bundles (scripts/assert-bundle.mjs), not just that jest
//      passed in isolation.
// Exits non-zero if either step fails. Bounded: no network calls, no
// long-running servers, nothing left running afterward.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function run(label, command, args) {
  console.log(`\n[ci-smoke] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (result.error) {
    console.error(`[ci-smoke] ${label} FAILED to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[ci-smoke] ${label} FAILED (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`[ci-smoke] ${label} passed.`);
}

run("jest-expo test suite", process.execPath, [
  path.join(rootDir, "node_modules", ".bin", "jest"),
  "--ci",
  "--watchAll=false",
  "--forceExit",
]);

run("bundle-content assertion", process.execPath, [
  path.join(__dirname, "assert-bundle.mjs"),
]);

console.log("\n[ci-smoke] all checks passed.");
