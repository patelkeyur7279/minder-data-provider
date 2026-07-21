# Local-first data (Wave I)

`useMinder` can persist a query's last-known-good result to on-device storage and
serve it back when the network isn't available. This is opt-in, per-hook-call, and
adds zero behavior when you don't use it.

## The `source` option

`useMinder(route, options)` accepts a `source` option with three values
(`src/hooks/useMinder.ts`, `UseMinderOptions.source`):

```typescript
source?: 'network' | 'local' | 'local-first';
```

- **`'network'` (default)** — fetch from the API, as always. Nothing below applies;
  the query function runs the exact same network path it always has.
- **`'local'`** — read only from local persistent storage (offline data store); never
  touches the network. Returns `null` data if nothing is stored.
- **`'local-first'`** — fetch from the network; on success persist the result to local
  storage; on network failure fall back to the last persisted value. Your UI keeps
  working offline with no extra code.

That's the JSDoc on the option, verbatim. Two behaviors worth calling out explicitly
because they're easy to assume wrong:

- `'local'` reads are read-only and synchronous with your component's mount — they
  **never** issue a network request, even once. If nothing has been persisted yet,
  `data` is `null` (not an error, not a loading state that never resolves).
- `'local-first'` only overrides the result on network *failure*. On a successful
  network response, `data` is the fresh network value (which is also persisted for
  next time) — it does not read stale local data back on a successful fetch. If the
  network fails **and** nothing was ever persisted, the hook surfaces the network
  error as normal (`data: null`, `error` set) — there's no silent empty-state
  fallback.

## How it works

Internally, `useMinder`'s query function (`createQueryFn` in `useMinder.ts`) branches
on `source` before/after the normal request:

1. `source === 'local'` short-circuits before any network code runs and returns
   `getDefaultLocalStore().get(localKey)` as the result data.
2. `source === 'local-first'` runs the normal network request first. If it succeeds,
   the result is written with `getDefaultLocalStore().set(localKey, result.data)`
   (best-effort — a storage write failure doesn't fail the read). If it fails, the
   hook reads `getDefaultLocalStore().get(localKey)`; if a value is found, that
   becomes the (now-successful) result instead of the network error.

`localKey` is the hook's query key (see [Query keys](#query-keys-and-pre-seeding)
below), with the pagination page param appended for infinite queries so paginated
local reads don't collide.

## Storage backend per platform

Local persistence goes through the same `StorageAdapter` abstraction used elsewhere
in the package, auto-selected by `StorageAdapterFactory.create()`
(`src/platform/adapters/storage/StorageAdapterFactory.ts`) based on detected
platform:

| Platform | Adapter | Backing storage |
| --- | --- | --- |
| Web | `WebStorageAdapter` | `localStorage` (falls back to `sessionStorage`, then in-memory, if unavailable) |
| React Native | `NativeStorageAdapter` | `AsyncStorage` |
| Expo | `ExpoStorageAdapter` | `SecureStore` |
| Electron | `ElectronStorageAdapter` | `electron-store` |

If a platform has no persistent storage capability, the factory falls back to an
in-memory adapter (data does not survive a reload).

The Native, Expo, and Electron adapters were hardened in Wave H — unit test coverage
went from roughly 4-6% to roughly 60%, covering CRUD, TTL, namespacing, batch
operations, and graceful degradation when the underlying storage peer (e.g.
`@react-native-async-storage/async-storage`, `expo-secure-store`, `electron-store`)
isn't installed (`tests/platform-storage-adapters.test.ts`). The web (`localStorage`)
and in-memory adapters were already covered separately
(`tests/storage-adapters.test.ts`).

## The `LocalStore` class

`LocalStore` (`src/core/LocalStore.ts`) is the thin persistence layer behind
`source: 'local' | 'local-first'`. It's exported from the package root:

```typescript
import { LocalStore, getDefaultLocalStore, localKeyOf } from 'minder-data-provider';
```

- **`getDefaultLocalStore(): LocalStore`** — the process-wide default instance
  `useMinder` itself reads/writes. Lazily constructed with the platform-appropriate
  adapter, namespaced `minder-local`.
- **`class LocalStore`** — `get<T>(queryKey): Promise<T | null>`,
  `set<T>(queryKey, data): Promise<void>`, `remove(queryKey): Promise<void>`. You can
  also `new LocalStore(adapter)` with an explicit `StorageAdapter` (this is how the
  test suite gets a deterministic in-memory store).
- **`localKeyOf(queryKey): string`** — turns a query key (string, or an
  array/object like TanStack Query keys) into the stable string actually used as the
  storage key: strings pass through as-is, everything else is `JSON.stringify`-ed.

## Query keys and pre-seeding

By default `useMinder`'s query key is `[route, options.params]`. The local store,
however, is keyed by whatever query key the hook resolves to — and if you pre-seed
data from outside the hook (e.g. at app startup, before any component using
`source: 'local'` has mounted), you need the seeded key to match exactly what the
hook will look up.

The reliable way to do that is to pass an explicit `queryKey` to `useMinder` and use
that same array when seeding — this is exactly what the test suite does
(`tests/use-minder-local-first.test.tsx`):

```typescript
import { getDefaultLocalStore } from 'minder-data-provider';

// Pre-seed before the component mounts (e.g. app bootstrap, a service worker,
// or a previous session's data).
await getDefaultLocalStore().set(['users'], [{ id: 9, name: 'Local Ada' }]);
```

```tsx
// The queryKey here MUST match the key used to seed above.
const { data } = useMinder('users', { source: 'local', queryKey: ['users'] });
```

If you omit `queryKey`, the effective key is `[route, options.params]` — still usable
for pre-seeding, but you must reproduce that exact shape (`['users', undefined]` if
no `params` are passed) when calling `getDefaultLocalStore().set(...)` directly.
Passing an explicit `queryKey` on the `useMinder` call avoids that footgun and keeps
the key visible at the call site.

## Limitations

Local-first, as shipped, persists **query results** — it is not a sync engine:

- There is no conflict resolution. `local-first` always trusts the network's most
  recent successful response over whatever was previously persisted; it never merges,
  diffs, or reconciles the two.
- There is no write-side offline queue here. Mutations (`operations.create/update/
  delete`, `mutate(...)`) are unaffected by `source` — they still go straight to the
  network and are not queued or replayed when offline. (A separate, older
  `OfflineManager`/offline-queue subsystem exists in the codebase for that purpose;
  it is independent of `LocalStore` and not covered by this guide.)
- There is no TTL or expiry on persisted local-first data — a value written by
  `set()` stays until the network succeeds again (refreshing it) or you call
  `remove()` yourself.
- Storage writes are best-effort: if the underlying adapter throws (e.g. quota
  exceeded), the read that triggered the write still succeeds; the failure is
  swallowed silently rather than surfaced.

Treat this as "keep the last good read available offline," not "an offline-capable
app framework." Full sync/merge semantics are potential future work, not something
this feature does today.
