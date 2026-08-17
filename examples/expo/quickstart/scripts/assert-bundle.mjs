#!/usr/bin/env node
// Bundle-content assertion for the Expo quickstart.
//
// `expo export` (this example's "build" script) produces one Hermes
// bytecode bundle per platform under dist/_expo/static/js/<platform>/*.hbc.
// Hermes bytecode is a binary format, but its string constant pool still
// stores literal string values as contiguous UTF-8/ASCII bytes, so grepping
// the compiled artifact for strings that only exist in minder-data-provider's
// own source is a legitimate way to prove the library's code -- not a stub,
// not tree-shaken away -- actually made it into what Metro shipped, for both
// platforms.
//
// This does NOT execute the bundle or the app. See README.md ("What This
// Evidence Proves / Does Not Prove") for the full honesty ledger.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const PLATFORMS = ["ios", "android"];

// Distinctive strings that only exist inside minder-data-provider's own
// source -- specific enough that a match is real signal, not coincidence.
const MARKERS = [
  // Runtime error thrown by useMinderContext() when used outside a
  // <MinderDataProvider> -- proves the hook/context module compiled in.
  "useMinderContext must be used within MinderDataProvider",
  // Exported symbol name for the expo-specific storage adapter -- proves
  // the "/expo" platform entry specifically (not just "/core" or
  // "/native") was resolved and bundled.
  "ExpoStorageAdapter",
];

// A real minder-data-provider + expo + react-query bundle is multiple MB;
// anything far smaller means the app shell exported without the library
// actually being included.
const MIN_BUNDLE_BYTES = 100_000;

function findBundle(platform) {
  const dir = path.join(distDir, "_expo", "static", "js", platform);
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const bundle = entries.find(
    (name) => name.endsWith(".hbc") || name.endsWith(".js")
  );
  return bundle ? path.join(dir, bundle) : null;
}

function assertPlatform(platform) {
  const bundlePath = findBundle(platform);
  if (!bundlePath) {
    return {
      platform,
      ok: false,
      reason: `no exported bundle found under dist/_expo/static/js/${platform}/ -- run "npm run build" first`,
    };
  }

  const size = statSync(bundlePath).size;
  if (size < MIN_BUNDLE_BYTES) {
    return {
      platform,
      ok: false,
      reason: `bundle at ${path.relative(rootDir, bundlePath)} is suspiciously small (${size} bytes, expected >= ${MIN_BUNDLE_BYTES})`,
    };
  }

  // Binary-safe (latin1) decode: Hermes bytecode is not valid UTF-8 overall,
  // but a latin1 decode is lossless byte-for-byte, so ASCII marker strings
  // remain intact and findable via plain substring search.
  const contents = readFileSync(bundlePath, "latin1");
  const missing = MARKERS.filter((marker) => !contents.includes(marker));

  if (missing.length > 0) {
    return {
      platform,
      ok: false,
      reason: `bundle at ${path.relative(rootDir, bundlePath)} is missing marker(s): ${missing.join(", ")}`,
    };
  }

  return { platform, ok: true, bundlePath, size };
}

function main() {
  const results = PLATFORMS.map(assertPlatform);
  let allOk = true;

  for (const result of results) {
    if (result.ok) {
      console.log(
        `[assert-bundle] ${result.platform}: OK -- ${path.relative(rootDir, result.bundlePath)} (${result.size} bytes) contains all ${MARKERS.length} minder marker(s)`
      );
    } else {
      allOk = false;
      console.error(`[assert-bundle] ${result.platform}: FAIL -- ${result.reason}`);
    }
  }

  if (!allOk) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "[assert-bundle] minder-data-provider code confirmed present in both exported bundles."
  );
}

main();
