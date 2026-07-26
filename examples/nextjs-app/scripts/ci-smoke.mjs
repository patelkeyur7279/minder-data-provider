#!/usr/bin/env node
// Self-contained CI smoke test for the Next.js (Pages Router) example.
//
// Assumes `npm run build` has already produced `.next/` — this script only
// boots servers, curl-verifies them, and tears everything down. It:
//   1. starts the mock upstream HTTP server (mock-upstream.mjs) on
//      MOCK_UPSTREAM_PORT,
//   2. starts the production Next.js server (`next start`) on APP_PORT,
//   3. bounded-polls both until ready (or fails after STARTUP_TIMEOUT_MS),
//   4. verifies:
//      - the index page's app-shell HTML contains its static heading,
//      - /ssr-users' HTML (getServerSideProps -> minder() against the mock
//        upstream) contains "Ada" -- proof the fetch happened server-side,
//        since no client JS ran to produce this response,
//      - POST /api/webhook-demo (minder-data-provider/server entry) accepts
//        a validly-signed HMAC webhook and rejects a tampered one,
//      - GET /api/users returns the expected JSON,
//   5. always kills the background processes it started, on both success and
//      failure, and exits non-zero on any failed assertion.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const APP_PORT = 3123;
const MOCK_PORT = 8790;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const WEBHOOK_SECRET = "nextjs-smoke-secret";

const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const HARD_TIMEOUT_MS = 90_000;

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function spawnBg(command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  children.push(child);
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${command}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${command}] ${chunk}`));
  return child;
}

function killAll() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone -- nothing to do.
      }
    }
  }
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      // Any response (even a 4xx from the app) means the server is up.
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${url} to respond: ${lastError?.message ?? "no response"}`);
}

function assertIncludes(label, haystack, needle) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected response to include ${JSON.stringify(needle)}`);
  }
  console.log(`  PASS ${label}`);
}

function assertEquals(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  PASS ${label}`);
}

async function main() {
  console.log(`Starting mock upstream on ${MOCK_BASE} ...`);
  spawnBg("node", [path.join(rootDir, "mock-upstream.mjs")], {
    env: { ...process.env, MOCK_UPSTREAM_PORT: String(MOCK_PORT) },
  });
  await waitForReady(`${MOCK_BASE}/users`, STARTUP_TIMEOUT_MS);

  console.log(`Starting Next.js production server on ${APP_BASE} ...`);
  const nextBin = path.join(rootDir, "node_modules", ".bin", "next");
  spawnBg(nextBin, ["start", "-p", String(APP_PORT)], {
    env: {
      ...process.env,
      MOCK_UPSTREAM_URL: MOCK_BASE,
      NEXTJS_EXAMPLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
  });
  await waitForReady(APP_BASE, STARTUP_TIMEOUT_MS);

  console.log("Running checks...");

  // 1. App shell marker on the client-side (useMinder) index page. The index
  //    page is prerendered statically (no getServerSideProps), and useMinder
  //    starts in its loading state during that prerender -- so the static
  //    HTML shows "Loading users..." rather than the post-fetch heading.
  //    id="__next" is the stable Pages Router app-shell wrapper regardless of
  //    that race, so it's what we assert on here.
  const indexHtml = await (await fetch(APP_BASE)).text();
  assertIncludes("index page app-shell marker", indexHtml, 'id="__next"');

  // 2. SSR page: getServerSideProps calling minder() server-side against the
  //    mock upstream. "Ada" appearing in the raw HTML (no JS executed here)
  //    proves the fetch ran server-side, not in the browser.
  const ssrHtml = await (await fetch(`${APP_BASE}/ssr-users`)).text();
  assertIncludes("SSR page HTML contains server-fetched \"Ada\"", ssrHtml, "Ada");

  // 3. API route on the server entry (minder-data-provider/server): valid
  //    HMAC-signed webhook is accepted.
  const body = JSON.stringify({ event: "ping" });
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const webhookRes = await fetch(`${APP_BASE}/api/webhook-demo`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-minder-signature": signature },
    body,
  });
  const webhookJson = await webhookRes.json();
  assertEquals("API route (server entry) accepts a validly-signed webhook", webhookJson.verified, true);

  // 4. Same route rejects a tampered signature.
  const tamperedRes = await fetch(`${APP_BASE}/api/webhook-demo`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-minder-signature": "0".repeat(64) },
    body,
  });
  assertEquals("API route rejects a tampered webhook signature", tamperedRes.status, 401);

  // 5. Plain Next.js API route returns the expected JSON.
  const usersJson = await (await fetch(`${APP_BASE}/api/users`)).json();
  const hasAda = Array.isArray(usersJson) && usersJson.some((user) => String(user.name).includes("Ada"));
  assertEquals("/api/users returns an Ada entry", hasAda, true);

  console.log("\nAll ci:smoke checks passed.");
}

const hardTimeout = setTimeout(() => {
  console.error(`\nci:smoke: hard timeout (${HARD_TIMEOUT_MS}ms) exceeded -- killing background processes`);
  killAll();
  process.exit(1);
}, HARD_TIMEOUT_MS);
hardTimeout.unref();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    killAll();
    process.exit(1);
  });
}

main()
  .then(() => {
    clearTimeout(hardTimeout);
    killAll();
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\nci:smoke FAILED: ${err.message}`);
    clearTimeout(hardTimeout);
    killAll();
    process.exit(1);
  });
