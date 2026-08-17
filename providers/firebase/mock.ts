/**
 * In-memory mocks for the Firebase provider — zero SDK, zero credentials.
 *
 * Behaviorally-parity implementations of the two capability contracts the real
 * adapter registers (auth + storage). They let an app develop its entire UI
 * against `useAuth()` / `useStorage()` with no Firebase project, no keys, and no
 * network — flip `providers.firebase.mock` to `false` at integration time and the
 * same hooks light up against the real adapter (see ./src/index.ts).
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { AuthContract, StorageContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** Fresh in-memory AuthContract mock. Session starts signed-in as `mock-user-1`. */
export function createMockAuth(): AuthContract {
  let session: { userId: string; raw: unknown } | null = {
    userId: 'mock-user-1',
    raw: { uid: 'mock-user-1', email: 'mock-user-1@example.test', displayName: 'Mock User' },
  };

  return {
    async getSession() {
      return session;
    },
    async signOut() {
      session = null;
    },
  };
}

/**
 * Fresh in-memory StorageContract mock. Backed by a `Map`; `upload` returns a
 * deterministic `firebase-mock://<bucket>/<path>` URL so tests can assert on it.
 */
export function createMockStorage(): StorageContract {
  const objects = new Map<string, Blob | { uri: string }>();
  const normalize = (path: string): string => path.replace(/^\/+/, '');

  return {
    async upload(file, path) {
      const objectPath = normalize(path);
      objects.set(objectPath, file);
      return { url: `firebase-mock://storage/${objectPath}` };
    },
    async remove(path) {
      objects.delete(normalize(path));
    },
  };
}

/**
 * Register both Firebase mocks (auth + storage) as `isMock: true` capability
 * providers under the `@minder/provider-firebase` name and return a single
 * unregister that tears down all of them.
 */
export function registerFirebaseMocks(): () => void {
  const name = '@minder/provider-firebase';
  const unregisters = [
    registerMockProvider<AuthContract>('auth', createMockAuth(), name),
    registerMockProvider<StorageContract>('storage', createMockStorage(), name),
  ];
  return () => {
    for (const u of unregisters) u();
  };
}
