/**
 * fix-b-transport-storage-websocket (BLOCKER 4, DATA-LOSS): `ExpoStorageAdapter`
 * (src/platform/adapters/storage/ExpoStorageAdapter.ts) is exported directly
 * from the `minder-data-provider/expo` subpath and is what `GlobalAuthManager`
 * falls back to on Expo/React Native when no functional browser `Storage`
 * exists (`StorageAdapterFactory.createWithFallback()`).
 *
 * ROOT CAUSE (verified against the REAL published `expo-secure-store`
 * package's own source, `expo-secure-store/build/SecureStore.js`): every
 * SecureStore key is validated synchronously against `/^[\w.-]+$/` — letters,
 * digits, `_`, `.`, `-` ONLY — BEFORE the call ever reaches the native
 * module, throwing `Invalid key provided to SecureStore...` otherwise.
 * `BaseStorageAdapter.getPrefixedKey()` (the shared default every OTHER
 * adapter in this package uses unmodified) joins `namespace` and `key` with
 * a COLON — `${namespace}:${key}` — a character that regex rejects outright.
 * `ExpoStorageAdapter`'s default `namespace` is `'minder'`, so the DEFAULT
 * key `GlobalAuthManager` writes a token under (`minder:minder_auth_token`)
 * was REJECTED by the real API on every write, out of the box, for every
 * Expo consumer. Every `setItemAsync`/`getItemAsync` call in this class
 * already catches and logs (never rethrows), so `setToken()` "resolved
 * successfully" while nothing was ever actually persisted to the durable
 * keychain — only a same-instance in-memory field made it LOOK like it
 * worked. A second instance with the same key (i.e. the next app launch)
 * reads back `null`.
 *
 * WHY THIS DRIVER MOCKS ONLY THE NATIVE-MODULE BOUNDARY: `expo-secure-store`'s
 * actual native binding (`requireNativeModule('ExpoSecureStore')` via
 * `expo-modules-core`) can only run inside a real Expo/React Native runtime
 * (device or simulator) — it is categorically unavailable in plain Node, so
 * it cannot be part of a `node:http`-style wire case. What CAN run for real
 * in Node, and is the actual subject of this defect, is the KEY-VALIDATION
 * CONTRACT — so this driver installs a small test double directly into the
 * scratch consumer's own `node_modules/expo-secure-store` (found by Node's
 * REAL module resolution — `ExpoStorageAdapter`'s own `require('expo-secure-
 * store')` call, unmodified) that reimplements ONLY that contract, copied
 * verbatim from the real package's source (regex and error message both
 * cited above), backed by a plain in-memory `Map`. Because Node caches that
 * module, the SAME backing `Map` is shared by every `ExpoStorageAdapter`
 * instance in this process, which is exactly the property under test: a
 * real OS keychain persists independently of any particular JS object,
 * while an `ExpoStorageAdapter`'s own in-memory state does not — a fresh
 * `new ExpoStorageAdapter()` below stands in for "the next app launch".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MOCK_SECURE_STORE_SOURCE = `'use strict';
// Test double for the native-binding boundary ONLY — see
// tests/wire/expo-storage-persistence.mjs's header comment for why this
// exists and what it does NOT fake (the key-validation contract below is
// copied verbatim from the real, published expo-secure-store package).
const store = new Map();
function isValidKey(key) {
  return typeof key === 'string' && /^[\\w.-]+$/.test(key);
}
function ensureValidKey(key) {
  if (!isValidKey(key)) {
    throw new Error(
      'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".'
    );
  }
}
async function setItemAsync(key, value) {
  ensureValidKey(key);
  store.set(key, value);
}
async function getItemAsync(key) {
  ensureValidKey(key);
  return store.has(key) ? store.get(key) : null;
}
async function deleteItemAsync(key) {
  ensureValidKey(key);
  store.delete(key);
}
module.exports = { setItemAsync, getItemAsync, deleteItemAsync, isValidKey, ensureValidKey, __store: store };
`;

function installMockExpoSecureStore(scratchDir) {
  const pkgDir = join(scratchDir, 'node_modules', 'expo-secure-store');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'expo-secure-store', version: '0.0.0-wire-test-double', main: 'index.js' }, null, 2),
  );
  writeFileSync(join(pkgDir, 'index.js'), MOCK_SECURE_STORE_SOURCE);
}

export async function run(ctx) {
  const { scratchDir } = ctx;
  const { resolveEntry, requireAbs } = ctx.load;
  const results = [];

  installMockExpoSecureStore(scratchDir);

  const entry = resolveEntry(scratchDir, './expo');
  const { ExpoStorageAdapter } = requireAbs(entry.cjs);
  const mockSecureStore = requireAbs(join(scratchDir, 'node_modules', 'expo-secure-store', 'index.js'));

  // --- Case 1 (root-cause proof): the OLD `${namespace}:${key}` shape is
  // genuinely rejected by the real validation contract, independent of this
  // package's own code — establishes WHY the defect existed at all. ---
  {
    const oldShapeKey = 'minder:minder_auth_token';
    let threw = false;
    let message = '';
    try {
      await mockSecureStore.setItemAsync(oldShapeKey, 'jwt-doesnt-matter');
    } catch (e) {
      threw = true;
      message = e?.message ?? String(e);
    }
    const pass = threw && /alphanumeric/i.test(message) && !mockSecureStore.isValidKey(oldShapeKey);
    results.push({
      id: 'blocker4-expo-securestore-real-constraint-rejects-colon-key',
      pass,
      message: pass
        ? `confirmed against the real expo-secure-store key-validation contract: the OLD default-namespace key shape "${oldShapeKey}" is REJECTED ("${message}") — this is the actual root cause, not a hypothetical`
        : `expected the real SecureStore key-validation contract to reject "${oldShapeKey}"; threw=${threw} message=${JSON.stringify(message)}`,
    });
  }

  // --- Case 2 (the fix, DEFAULT options — no caller opt-in required):
  // a token set via ONE ExpoStorageAdapter instance, using this package's
  // DEFAULT namespace, is readable from a SEPARATE instance that shares only
  // the durable backing store — proving cross-instance ("app restart")
  // persistence, not just same-instance in-memory state. ---
  {
    mockSecureStore.__store.clear();
    const instance1 = new ExpoStorageAdapter(); // default options — no namespace override
    const setResult = await instance1.setItem('minder_auth_token', 'jwt-abc-123').then(
      () => ({ threw: false }),
      (e) => ({ threw: true, message: e?.message ?? String(e) }),
    );

    // The write must have landed in the REAL (mocked-native-boundary) durable
    // store, not just be assumed successful — inspect the actual backing Map.
    const rawKeys = [...mockSecureStore.__store.keys()];
    const noColonKeys = rawKeys.every((k) => !k.includes(':'));

    const instance2 = new ExpoStorageAdapter(); // a SEPARATE instance — simulates the next app launch
    const readBack = await instance2.getItem('minder_auth_token');

    const pass = setResult.threw === false && noColonKeys && rawKeys.length > 0 && readBack === 'jwt-abc-123';
    results.push({
      id: 'blocker4-expo-storage-default-namespace-cross-instance-persistence',
      pass,
      message: pass
        ? `setItem() via instance #1 (default options, DEFAULT namespace) persisted for real (backing keys: ${JSON.stringify(rawKeys)}, none contain ':'); a SEPARATE instance #2 (simulating an app restart) read back the SAME token "jwt-abc-123" — cross-instance persistence proven`
        : `PERSISTENCE FAILURE: setItem threw=${setResult.threw} (${setResult.message ?? ''}), backing store keys=${JSON.stringify(rawKeys)}, readBack from a SEPARATE instance=${JSON.stringify(readBack)}`,
    });
  }

  // --- Case 3 (positive control / regression guard): a caller-supplied
  // namespace/key containing OTHER SecureStore-unsafe characters (space, @,
  // /) is also sanitized, not just the default ':' separator. ---
  {
    mockSecureStore.__store.clear();
    const instanceA = new ExpoStorageAdapter({ namespace: 'my app/v1' });
    await instanceA.setItem('user@example.com token', 'jwt-xyz-789');
    const rawKeys = [...mockSecureStore.__store.keys()];
    const allValid = rawKeys.length > 0 && rawKeys.every((k) => mockSecureStore.isValidKey(k));

    const instanceB = new ExpoStorageAdapter({ namespace: 'my app/v1' });
    const readBack = await instanceB.getItem('user@example.com token');

    const pass = allValid && readBack === 'jwt-xyz-789';
    results.push({
      id: 'blocker4-expo-storage-hostile-namespace-and-key-sanitized',
      pass,
      message: pass
        ? `a namespace/key containing spaces, '@', and '/' produced ONLY valid SecureStore keys (${JSON.stringify(rawKeys)}) and still round-tripped correctly across a separate instance`
        : `sanitization/round-trip failure: backing keys=${JSON.stringify(rawKeys)} allValid=${allValid} readBack=${JSON.stringify(readBack)}`,
    });
  }

  return results;
}
