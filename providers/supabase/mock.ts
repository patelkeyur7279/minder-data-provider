/**
 * In-memory mocks for the Supabase provider — zero SDK, zero credentials.
 *
 * These are behaviorally-parity implementations of the three capability
 * contracts the real adapter registers (auth / storage / live). They let an app
 * develop its entire UI against `useAuth()` / `useStorage()` / `useLive()` with
 * no Supabase project, no keys, and no network — flip `providers.supabase.mock`
 * to `false` at integration time and the same hooks light up against the real
 * adapter (see ./src/index.ts).
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { AuthContract, StorageContract, LiveContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

// ── Live emitter (module-level so `emitMockLiveEvent` can reach subscribers) ──
//
// Realtime is inherently a broadcast bus; modeling the mock's subscriber table
// at module scope (rather than per-instance) lets tests and demos push an event
// through the public `emitMockLiveEvent(channel, event)` helper without holding a
// reference to the live-mock instance the adapter registered internally.
const liveListeners = new Map<string, Set<(event: unknown) => void>>();

/**
 * Emit a fake Realtime event to every mock `useLive()` subscriber on `channel`.
 * Exported for tests and demos driving the mock provider.
 */
export function emitMockLiveEvent(channel: string, event: unknown): void {
  liveListeners.get(channel)?.forEach((cb) => cb(event));
}

/** Fresh in-memory AuthContract mock. Session starts signed-in as `mock-user-1`. */
export function createMockAuth(): AuthContract {
  let session: { userId: string; raw: unknown } | null = {
    userId: 'mock-user-1',
    raw: { user: { id: 'mock-user-1', email: 'mock-user-1@example.test' }, access_token: 'mock-access-token' },
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
 * deterministic `mock://<bucket>/<path>` URL so tests can assert on it.
 */
export function createMockStorage(): StorageContract {
  const objects = new Map<string, Blob | { uri: string }>();

  const splitPath = (path: string): { bucket: string; objectPath: string } => {
    const normalized = path.replace(/^\/+/, '');
    const slash = normalized.indexOf('/');
    if (slash === -1) {
      // No bucket segment — treat the whole thing as a key in a default bucket.
      return { bucket: 'public', objectPath: normalized };
    }
    return { bucket: normalized.slice(0, slash), objectPath: normalized.slice(slash + 1) };
  };

  return {
    async upload(file, path) {
      const { bucket, objectPath } = splitPath(path);
      objects.set(`${bucket}/${objectPath}`, file);
      return { url: `mock://${bucket}/${objectPath}` };
    },
    async remove(path) {
      const { bucket, objectPath } = splitPath(path);
      objects.delete(`${bucket}/${objectPath}`);
    },
  };
}

/** Fresh in-memory LiveContract mock wired to the module-level emitter. */
export function createMockLive(): LiveContract {
  return {
    subscribe(channel, cb) {
      let set = liveListeners.get(channel);
      if (!set) {
        set = new Set();
        liveListeners.set(channel, set);
      }
      set.add(cb);
      return () => {
        const current = liveListeners.get(channel);
        current?.delete(cb);
        if (current && current.size === 0) liveListeners.delete(channel);
      };
    },
  };
}

/**
 * Register all three Supabase mocks (auth + storage + live) as `isMock: true`
 * capability providers under the `@minder/provider-supabase` name and return a
 * single unregister that tears down all of them.
 */
export function registerSupabaseMocks(): () => void {
  const name = '@minder/provider-supabase';
  const unregisters = [
    registerMockProvider<AuthContract>('auth', createMockAuth(), name),
    registerMockProvider<StorageContract>('storage', createMockStorage(), name),
    registerMockProvider<LiveContract>('live', createMockLive(), name),
  ];
  return () => {
    for (const u of unregisters) u();
  };
}
