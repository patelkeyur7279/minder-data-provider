# Wave I — Local-First Data

> Six-stage protocol. Owner-approved direction 2026-07-19 ("do as your role").

## Recon-driven decomposition (evidence over the old audit)

The master-protocol framing was "consolidate offline×2/websocket×3 + add `source:'local'`". Reachability
recon changed the risk picture:

- **Both OfflineManagers are LIVE** (`core/OfflineManager` → ApiClient; `platform/offline/OfflineManager`
  → native entry + M0-08/M1-03 event API). Merging them is a genuine refactor of ApiClient's request
  path and the native surface — high regression risk, zero new user value. → deferred to a separate,
  heavily-reviewed increment; NOT rushed alongside a feature.
- **`core/WebSocketManager.ts` (234 lines) has no importers** — likely dead. → I-02 verifies + deletes
  (safe win) rather than "merges 3".
- **`source:'local'` is net-new and additive.** It's the actual "local db" user value and the reason
  this wave exists. It builds on the storage adapters just hardened in Wave H (~60% coverage). → LEAD
  with this (I-01), low risk.

## I-01 — `source` option on useMinder (THIS increment)

**Design (additive; default path byte-identical → fully backward compatible):**

New `src/core/LocalStore.ts` — a thin typed persistence layer over a platform `StorageAdapter`
(via `StorageAdapterFactory.create()`, auto-platform: web→localStorage, native→AsyncStorage,
expo→SecureStore, electron→electron-store — all Wave-H-tested), namespaced `minder-local`:
```ts
class LocalStore {
  constructor(adapter?: StorageAdapter);        // default: factory auto-detect
  get<T>(queryKey: unknown): Promise<T | null>; // JSON round-trip, keyed by a stable hash of queryKey
  set<T>(queryKey: unknown, data: T): Promise<void>;
  remove(queryKey: unknown): Promise<void>;
}
```

`useMinder` gains `source?: 'network' | 'local' | 'local-first'` (default `'network'`):
- `'network'` — existing behavior, code path UNCHANGED (branch only entered when source is local*).
- `'local'` — read from LocalStore only, never the network (offline data store). Returns the stored
  value or `null`.
- `'local-first'` — try network; on success persist to LocalStore and return; on network failure
  fall back to the last persisted value (offline resilience). "Your app keeps working offline with
  no extra code" — the headline.

`createQueryFn` (useMinder.ts:741) branches on `options.source`; the default (`undefined`/`'network'`)
takes the exact existing path. Recorded assumption (charter: proceed + record on additive API):
`'local'` = local-only, `'local-first'` = network-with-fallback+write-through — the conservative
primitives a later background-sync layer extends.

**Acceptance:** LocalStore unit-tested (get/set/remove round-trip, missing→null, key stability,
platform-adapter delegation, graceful degrade); `source:'local'` reads persisted data with no network
(mock transport asserts zero calls); `source:'local-first'` persists on network success and falls back
to local on network failure; `source` omitted → identical to today (regression); render/hook-order
stable (rules-of-hooks); full gate + mutation-verified non-vacuity.

## I-02 — duplication cleanup (SEPARATE, later, heavy review)

Verify `core/WebSocketManager` truly unreachable (incl. `platform/index` re-export) → delete if dead.
Assess whether the two OfflineManagers can converge without regressing ApiClient/native — or document
why they legitimately differ and leave them. Evidence-gated; no forced merge.
