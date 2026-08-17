"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const { formatMarker, fetchUsersMarker } = require("./electron-smoke-client.js");

test("formatMarker builds the exact CI-verifiable marker string", () => {
  const marker = formatMarker([{ id: 1, name: "Ada" }]);
  assert.equal(marker, "MINDER_ELECTRON_SMOKE_OK users=1 Ada");
});

test("formatMarker counts multiple users but names only the first", () => {
  const marker = formatMarker([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ]);
  assert.equal(marker, "MINDER_ELECTRON_SMOKE_OK users=2 Ada");
});

test("formatMarker rejects an empty or malformed payload", () => {
  assert.throws(() => formatMarker([]), /non-empty array/);
  assert.throws(() => formatMarker(undefined), /non-empty array/);
  assert.throws(() => formatMarker([{ id: 1 }]), /missing a "name" field/);
});

test(
  "fetchUsersMarker fetches from a real mock upstream through minder-data-provider/electron",
  async () => {
    const port = 4311; // distinct from smoke/run-ci-smoke.mjs's default (4310) and edge-worker's 8788
    const baseURL = `http://127.0.0.1:${port}`;

    const upstream = spawn(
      process.execPath,
      [path.join(__dirname, "..", "mock-upstream.mjs")],
      { env: { ...process.env, MOCK_UPSTREAM_PORT: String(port) } }
    );

    try {
      await waitForReady(baseURL, 10_000);
      const marker = await fetchUsersMarker(baseURL);
      assert.equal(marker, "MINDER_ELECTRON_SMOKE_OK users=1 Ada");
    } finally {
      upstream.kill("SIGTERM");
    }
  }
);

/** Bounded poll for the mock upstream's readiness — never hangs the test suite. */
function waitForReady(baseURL, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${baseURL}/users`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("mock upstream did not become ready in time"));
        } else {
          setTimeout(attempt, 100);
        }
      });
    };
    attempt();
  });
}
