"use strict";

// Data-layer piece of the electron platform-adapter smoke proof. Kept as a
// plain CJS module (no Electron APIs) so it can be:
//   1. required directly by smoke/preload.js (real Electron renderer/preload
//      context), and
//   2. unit-tested with plain `node --test`, with zero Electron process
//      involved (see electron-smoke-client.test.js in this directory).
//
// Importing `minder-data-provider/electron` here is deliberate: it is the
// same platform entry point production Electron apps are meant to use in
// their renderer/preload code, and its module graph re-exports the React
// hook surface (from ../web.js) alongside the plain `minder`/`configureMinder`
// functions used below. That's why `react`, `react-dom`, and
// `@tanstack/react-query` are devDependencies of this example even though
// this file never touches React directly — the electron entry's ESM/CJS
// output resolves those imports eagerly as part of building its export
// namespace, so they must be present in node_modules or `require(...)` throws.
const { configureMinder, minder } = require("minder-data-provider/electron");

/**
 * Formats the CI-verifiable success marker line printed to stdout by the
 * smoke main process. Kept separate from the network call so it has its own
 * fast, dependency-free unit test.
 */
function formatMarker(users) {
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error(
      "formatMarker: expected a non-empty array of user objects"
    );
  }
  const first = users[0];
  if (!first || typeof first.name !== "string") {
    throw new Error('formatMarker: first user is missing a "name" field');
  }
  return `MINDER_ELECTRON_SMOKE_OK users=${users.length} ${first.name}`;
}

/**
 * Configures the electron-entry minder client against `baseURL` and fetches
 * GET /users, returning the formatted marker string on success. Throws on
 * any failure (network error, non-2xx, empty payload) — callers are
 * responsible for turning that into a nonzero exit + stderr message.
 */
async function fetchUsersMarker(baseURL) {
  configureMinder({ baseURL });
  // minder()'s signature is (route, data, options) — GET has no body, so
  // `data` is explicitly `undefined` and `method` goes in the options
  // (3rd) argument. Passing `{ method: "GET" }` as the 2nd (data) argument
  // is a real, easy-to-hit bug: minder()'s auto method-detection treats any
  // truthy `data` as "there is a body" and falls back to POST. See the fix
  // for the same mistake in ../../src/main.js's IPC handlers.
  const response = await minder("/users", undefined, { method: "GET" });
  if (!response.success) {
    throw new Error(
      `minder('/users') failed: ${response.error?.message || "unknown error"} (status ${response.status})`
    );
  }
  return formatMarker(response.data);
}

module.exports = { formatMarker, fetchUsersMarker };
