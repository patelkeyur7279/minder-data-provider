"use strict";

// Headless smoke-test entry point for CI (and local proof). Separate from
// src/main.js (the real app) on purpose — this process only exists to prove
// the electron platform adapter end-to-end:
//
//   main process (this file)
//     -> creates a hidden BrowserWindow
//     -> renderer/preload (smoke/preload.js) initializes minder via the
//        `minder-data-provider/electron` entry and fetches GET /users from
//        a local mock upstream (smoke/mock-upstream.mjs)
//     -> reports success/failure back to this process over IPC
//     -> this process prints a single verifiable marker line to stdout and
//        exits 0, or prints an error to stderr and exits 1
//
// Invoked via `npm run ci:smoke` (see smoke/run-ci-smoke.mjs), which starts
// the mock upstream, launches this file under Electron (optionally under
// xvfb-run on headless Linux), and greps stdout for the marker.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const TIMEOUT_MS = 30_000;
let settled = false;

function succeed(marker) {
  if (settled) return;
  settled = true;
  // eslint-disable-next-line no-console
  console.log(marker);
  app.exit(0);
}

function fail(reason) {
  if (settled) return;
  settled = true;
  console.error(`MINDER_ELECTRON_SMOKE_FAIL ${reason}`);
  app.exit(1);
}

const watchdog = setTimeout(() => {
  fail("timeout after 30s waiting for smoke:result");
}, TIMEOUT_MS);
watchdog.unref?.();

ipcMain.once("smoke:result", (_event, payload) => {
  clearTimeout(watchdog);
  if (payload && payload.ok) {
    succeed(payload.marker);
  } else {
    fail((payload && payload.error) || "unknown renderer failure");
  }
});

function createSmokeWindow() {
  const win = new BrowserWindow({
    width: 200,
    height: 200,
    show: false, // headless: never shown, works with or without a real display
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Deliberately not sandboxed for this window only: the smoke preload
      // needs a plain `require()` of the npm package under test. The real
      // app's window (src/main.js) keeps `sandbox: true`. See
      // smoke/preload.js for the full rationale.
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.webContents.on("did-fail-load", (_event, code, description) => {
    fail(`window failed to load: ${code} ${description}`);
  });

  win.loadFile(path.join(__dirname, "index.html")).catch((error) => {
    fail(`loadFile threw: ${error.message}`);
  });
}

app.whenReady().then(createSmokeWindow).catch((error) => {
  fail(`app.whenReady threw: ${error.message}`);
});

app.on("window-all-closed", () => {
  // In the smoke run this only fires after we've already called app.exit()
  // above, but guard anyway so a stray close doesn't hang the process.
  if (!settled) {
    fail("window closed before a result was reported");
  }
});
