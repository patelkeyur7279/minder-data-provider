/**
 * LocalStore — typed persistence for local-first data (Wave I / I-01).
 *
 * A thin layer over a platform `StorageAdapter` (web → localStorage,
 * native → AsyncStorage, expo → SecureStore, electron → electron-store, all
 * auto-selected by `StorageAdapterFactory` and unit-tested in Wave H). It
 * stores query results keyed by a stable string derived from the TanStack
 * Query key, JSON-serialised. Used by `useMinder(route, { source: 'local' |
 * 'local-first' })` to read/persist data without (or before) the network.
 */
import type { StorageAdapter } from '../platform/adapters/storage/StorageAdapter.js';
import { StorageAdapterFactory } from '../platform/adapters/storage/StorageAdapterFactory.js';

/** Stable string for a TanStack-style query key (string or array/object). */
export function localKeyOf(queryKey: unknown): string {
  if (typeof queryKey === 'string') return queryKey;
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey);
  }
}

export class LocalStore {
  private adapter: StorageAdapter;

  /**
   * @param adapter Optional explicit adapter (used by tests / advanced setups).
   *   Defaults to the platform-appropriate persistent adapter, namespaced
   *   `minder-local`.
   */
  constructor(adapter?: StorageAdapter) {
    this.adapter =
      adapter ?? StorageAdapterFactory.create(undefined, { namespace: 'minder-local' });
  }

  async get<T = unknown>(queryKey: unknown): Promise<T | null> {
    const raw = await this.adapter.getItem(localKeyOf(queryKey));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(queryKey: unknown, data: T): Promise<void> {
    await this.adapter.setItem(localKeyOf(queryKey), JSON.stringify(data));
  }

  async remove(queryKey: unknown): Promise<void> {
    await this.adapter.removeItem(localKeyOf(queryKey));
  }
}

let defaultStore: LocalStore | null = null;

/** Process-wide default LocalStore (lazy; one persistent adapter per app). */
export function getDefaultLocalStore(): LocalStore {
  if (!defaultStore) defaultStore = new LocalStore();
  return defaultStore;
}

/** Test seam: override/reset the default store. */
export function __setDefaultLocalStore(store: LocalStore | null): void {
  defaultStore = store;
}
