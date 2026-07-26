#!/usr/bin/env node
// Orchestrates the full headless electron-platform-adapter proof:
//   1. start the mock upstream (mock-upstream.mjs)
//   2. wait (bounded) for it to accept connections
//   3. launch smoke/main.js under Electron — via xvfb-run when no display is
//      available on Linux, plain otherwise, so this same script works on a
//      macOS dev machine (no X11 concept, Electron just runs) and headless
//      Linux CI (needs a virtual framebuffer for Chromium/Electron to boot)
//   4. check the child's exit code AND stdout for the verifiable marker
//   5. always stop the mock upstream, even on failure/timeout
//
// Exit code mirrors the smoke result: 0 only if Electron exited 0 AND the
// marker was seen; 1 otherwise (diagnostics printed to stderr).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOCK_UPSTREAM_PORT = Number(process.env.MOCK_UPSTREAM_PORT || 4310);
const MOCK_UPSTREAM_URL = `http://127.0.0.1:${MOCK_UPSTREAM_PORT}`;
const UPSTREAM_READY_TIMEOUT_MS = 10_000;
// Hard ceiling above smoke/main.js's own 30s internal watchdog — a safety
// net in case Electron itself wedges before the watchdog can even run.
const ELECTRON_HARD_TIMEOUT_MS = 45_000;
const MARKER_RE = /MINDER_ELECTRON_SMOKE_OK users=\d+ \S+/;

const EXPECTED_MARKER = "MINDER_ELECTRON_SMOKE_OK users=1 Ada";

async function main() {
  const upstream = spawn(process.execPath, [path.join(__dirname, "mock-upstream.mjs")], {
    env: { ...process.env, MOCK_UPSTREAM_PORT: String(MOCK_UPSTREAM_PORT) },
    stdio: "inherit",
  });

  try {
    await waitForUpstream(MOCK_UPSTREAM_URL, UPSTREAM_READY_TIMEOUT_MS);
    await runElectronSmoke();
  } finally {
    upstream.kill("SIGTERM");
  }
}

function waitForUpstream(baseURL, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${baseURL}/users`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`mock upstream at ${baseURL} did not become ready in time`));
        } else {
          setTimeout(attempt, 150);
        }
      });
    };
    attempt();
  });
}

function runElectronSmoke() {
  return new Promise((resolve, reject) => {
    const electronPath = require("electron");
    const mainPath = path.join(__dirname, "main.js");
    const flags = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"];

    const useXvfb = process.platform === "linux" && !process.env.DISPLAY;
    const command = useXvfb ? "xvfb-run" : electronPath;
    const args = useXvfb ? ["-a", electronPath, mainPath, ...flags] : [mainPath, ...flags];

    console.log(
      `[ci:smoke] launching: ${command} ${args.join(" ")}${
        useXvfb ? " (Linux, no DISPLAY -> wrapped with xvfb-run; requires the `xvfb` package on the runner)" : ""
      }`
    );

    const child = spawn(command, args, {
      env: { ...process.env, MOCK_UPSTREAM_URL },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    const hardTimeout = setTimeout(() => {
      console.error(`[ci:smoke] hard timeout (${ELECTRON_HARD_TIMEOUT_MS}ms) exceeded — killing electron`);
      child.kill("SIGKILL");
    }, ELECTRON_HARD_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(hardTimeout);
      reject(new Error(`failed to launch electron: ${error.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(hardTimeout);
      const sawMarker = MARKER_RE.test(stdout);

      if (code === 0 && sawMarker) {
        console.log(`[ci:smoke] PASS — exit 0, marker seen: "${stdout.match(MARKER_RE)[0]}"`);
        resolve();
        return;
      }

      console.error(
        `[ci:smoke] FAIL — exit code ${code}, marker seen: ${sawMarker}\n` +
          `expected marker matching: ${EXPECTED_MARKER}\n` +
          `--- stdout tail ---\n${stdout.slice(-2000)}\n` +
          `--- stderr tail ---\n${stderr.slice(-2000)}`
      );
      reject(new Error(`electron smoke failed (exit ${code}, marker ${sawMarker})`));
    });
  });
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`[ci:smoke] ${error.message}`);
    process.exit(1);
  }
);
