"use strict";

// Preload script for the headless smoke-test BrowserWindow only (never used
// by the real app in src/main.js). Runs in the renderer process, which is
// exactly where `minder-data-provider/electron` is meant to be initialized
// and called from in a real Electron app.
//
// webPreferences for the smoke window intentionally set `sandbox: false`
// (see smoke/main.js) so this preload script can `require()` the npm
// package directly, the same way any Electron preload script requires a
// project dependency. `contextIsolation` stays `true` and `nodeIntegration`
// stays `false` — the renderer's own JS context (the loaded HTML page) still
// has zero Node/require access; only this preload script does. That matches
// how the production app (src/main.js's webPreferences) is configured.
const { ipcRenderer } = require("electron");
const { fetchUsersMarker } = require("./lib/electron-smoke-client.js");

const baseURL = process.env.MOCK_UPSTREAM_URL;

async function run() {
  if (!baseURL) {
    ipcRenderer.send("smoke:result", {
      ok: false,
      error: "MOCK_UPSTREAM_URL was not set by the main process",
    });
    return;
  }

  try {
    const marker = await fetchUsersMarker(baseURL);
    ipcRenderer.send("smoke:result", { ok: true, marker });
  } catch (error) {
    ipcRenderer.send("smoke:result", {
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

window.addEventListener("DOMContentLoaded", run);
