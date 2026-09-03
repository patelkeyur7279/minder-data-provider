/**
 * Cross-entry singleton registry — bundler-independent identity via `globalThis`.
 *
 * WHY THIS EXISTS (Spec 1.3c):
 * Under tsup `splitting: true`, esbuild hoists shared state (the React context,
 * mutable module singletons) into cross-entry chunk files. When the package
 * declares `sideEffects: false`, a consumer bundler may (a) DROP the chunk-init
 * import that runs `createContext()` — the MDPD-17 production crash — or (b)
 * DUPLICATE a chunk across two entries, silently FORKING a singleton (two
 * contexts, two registries, two config bags). Both are identity/laziness bugs.
 *
 * The fix: give every cross-entry singleton ONE identity, keyed off a
 * process-wide `Symbol.for(...)` slot on `globalThis`, created on first ACCESS
 * (never at import). No top-level `createContext`/`new`/factory call remains on
 * an import path, so a tree-shaker's "pure" verdict becomes *correct* — it drops
 * only truly-unused code and retains everything a runtime call reaches. And
 * because the store hangs off `globalThis`, duplicating this module into two
 * chunks still yields a single shared store.
 *
 * EDGE-SAFE (P5): web-standard only — `globalThis`, `Symbol.for`. No `require()`,
 * no Node built-ins, and crucially NO value import of React: `react` appears here
 * only as a TYPE-ONLY import (erased at build), so edge-safe modules like
 * `contracts/registry.ts` can back their state on this store without dragging
 * React (and its `process.env` checks) into an edge/RSC bundle. The React context
 * getter that needs `createContext` lives in `MinderContext.tsx` (a `"use client"`
 * module) — see `getMinderContext()` there; it reads the `context` slot below.
 *
 * Owning modules keep their public accessors (identical signatures); they now
 * read/write their slot on this store instead of a private module-level binding.
 */

import type { Context } from 'react';

import type { MinderContextValue } from './MinderContext.js';
// TWO distinct config shapes, deliberately NOT merged (see globalConfig.ts C1 vs
// minder.ts C3): the routes-aware provider config, and minder()'s URL bag.
import type { MinderConfig as RoutesMinderConfig } from './types.js';
import type { MinderConfig as MinderUrlBagConfig } from './minder/types.js';
import type { Capability, CapabilityProvider } from '../contracts/registry.js';
import type { PluginManager } from '../plugins/PluginSystem.js';
import type { GlobalAuthManager } from '../auth/GlobalAuthManager.js';
import type { CSRFTokenManager, RateLimiter } from '../utils/security.js';
import type { MinderResult } from './minder/types.js';

/**
 * Every cross-entry singleton slot. Each field is optional and created lazily by
 * its owning module's accessor. Concrete types are imported TYPE-ONLY so this
 * module adds no runtime import edges (no dependency cycles, no eager bundle
 * weight from the manager classes).
 */
export interface MinderSingletonStore {
  /** The one React context (A1). */
  context?: Context<MinderContextValue | null>;
  /** Capability-provider registry — one slot per capability (C2). */
  capabilityRegistry?: Map<Capability, CapabilityProvider>;
  /** Registry change subscribers, for `useSyncExternalStore` (C2). */
  capabilitySubscribers?: Set<() => void>;
  /**
   * The routes-aware global MinderConfig set by the provider / `configureMinder`
   * (C1). Distinct from `minderUrlConfig` below — see globalConfig.ts / minder.ts
   * for why the two are not merged.
   */
  globalMinderConfig?: RoutesMinderConfig | null;
  /**
   * minder()'s URL-resolution bag: baseURL/headers/timeout/token used to dispatch
   * a request (C3). A SEPARATE store from `globalMinderConfig` (C1) on purpose —
   * and a genuinely DIFFERENT TYPE (core/minder/types), which is itself evidence
   * the two cannot collapse into one cell.
   */
  minderUrlConfig?: MinderUrlBagConfig;
  /** One-shot guard so the deprecated core `configureMinder` warns once (C3). */
  minderDeprecationWarned?: boolean;
  /** Injectable retry backoff sleep for minder() (C3). */
  minderRetrySleep?: (ms: number) => Promise<void>;
  /** minder()'s opt-in response cache (C3). Value type owned by minder.ts. */
  minderResponseCache?: Map<string, unknown>;
  /**
   * p-c1-csrf-token-header (fix): standalone minder()'s CSRF token manager —
   * mirrors ApiClient's own per-instance `csrfManager` (constructed once,
   * reused for the instance's lifetime) so `security.csrfProtection` on the
   * SAME unified config is honoured by standalone calls too, instead of
   * being a silent no-op. One process-wide instance (like every other
   * lazy singleton on this store), not recreated per call.
   */
  minderCsrfManager?: CSRFTokenManager;
  /**
   * p-rl1-rate-limiting (fix): standalone minder()'s rate limiter — mirrors
   * ApiClient's own per-instance `rateLimiter`. Must persist across calls
   * (its in-memory request-timestamp store IS the rate-limit state), so this
   * is a lazily-created, process-wide singleton like `minderCsrfManager`
   * above — a fresh instance per call would never actually limit anything.
   */
  minderRateLimiter?: RateLimiter;
  /**
   * p-d1-inflight-deduplication (fix): standalone minder()'s in-flight
   * request map — mirrors ApiClient's own dedup gate
   * (`isGet && config.performance?.deduplication`). Keyed by
   * method+resolved-url+params; value is the SHARED promise concurrent
   * identical GETs await instead of each dispatching their own transport
   * call. Entries are removed once their promise settles (see minder.ts).
   */
  minderInFlightDedup?: Map<string, Promise<MinderResult<unknown>>>;
  /** Global plugin manager (A4). */
  pluginManager?: PluginManager;
  /** Global auth manager (A5). */
  globalAuthManager?: GlobalAuthManager;
}

/**
 * Process-wide key. `Symbol.for` looks the symbol up in the global registry, so
 * two copies of this module (duplicated into separate chunks by a bundler) still
 * resolve to the SAME symbol and therefore the SAME store object.
 *
 * DELIBERATELY declared (not assigned) at module scope, and assigned lazily
 * INSIDE `minderStore()` below — see the P1 postmortem there for why a plain
 * top-level `const STORE_KEY = Symbol.for(...)` is unsafe under esbuild code
 * splitting.
 */
let storeKey: symbol | undefined;

/**
 * The shared store, created on first access — NEVER at import. This is the whole
 * reason `sideEffects: false` is honest: importing this module runs nothing.
 *
 * P1 POSTMORTEM (fix-2.2.0-blockers): this used to read a MODULE-TOP-LEVEL
 * `const STORE_KEY = Symbol.for(...)`. That is correct per ES module semantics
 * (top-level statements run unconditionally on first evaluation), but tsup's
 * esbuild, building this shared chunk under `splitting:true` + the package's
 * `sideEffects:false`, hoisted that assignment into a deferred "call once"
 * initializer in a SEPARATE exported function — and did NOT insert a call to
 * that initializer here, inside this same source module's own `minderStore()`.
 * The observed dist output was:
 *
 *   function l(){let e=globalThis;return e[o]??(e[o]={})}   // minderStore()
 *   var o,a=b(()=>{o=Symbol.for("minder-data-provider.singletons")});
 *   export{l as a, a as c};                                  // `c` = the deferred init
 *
 * `o` (STORE_KEY) stayed `undefined` — producing the literal
 * `globalThis[undefined] = {}` crash — UNLESS some unrelated consumer chunk
 * happened to import and call `c()` first (e.g. the provider's own module
 * chunk did, as a side effect of evaluating `MinderContext.tsx`). That is
 * exactly "works when a provider happened to run earlier in the module graph,
 * crashes when it didn't" — the Next.js App Router failure mode: any RSC leaf
 * route that reaches `useMinder()`/`useAuthToken()`/`minder()` WITHOUT ever
 * importing `MinderDataProvider` in that request's module graph never
 * triggered the initializer.
 *
 * Fix: compute (and cache) the symbol INSIDE this function instead of as a
 * top-level module statement. `Symbol.for` is idempotent and process-wide by
 * spec — recomputing/caching it here is always correct regardless of import
 * order or how a bundler splits this module, and there is no longer any
 * top-level side-effecting assignment for a bundler to defer.
 */
export function minderStore(): MinderSingletonStore {
  const g = globalThis as unknown as Record<symbol, MinderSingletonStore>;
  storeKey ??= Symbol.for('minder-data-provider.singletons');
  return (g[storeKey] ??= {});
}

/**
 * Wrap a store-backed singleton in a transparent Proxy so an exported `const`
 * binding keeps its object API (`x.method()`, `x.prop`) but does NOT construct
 * the underlying instance at import time — construction is deferred to the FIRST
 * property access (A4/A5, Spec 1.3c). Without this, `export const pluginManager =
 * pluginManagerSingleton()` runs `new PluginManager()` eagerly wherever the
 * binding is retained; the proxy defers that to first use while preserving every
 * existing call site (`pluginManager.register(...)`, `globalAuthManager.getToken()`).
 *
 * - `get` returns the instance's own value/method WITHOUT re-binding it. Methods
 *   are therefore called with `this === proxy`; the `set`/`get` traps forward
 *   every `this.field` read/write back to the real instance, so behaviour is
 *   identical. NOT re-binding is deliberate and load-bearing: a bound copy is a
 *   fresh function that loses method identity, which breaks `jest.spyOn(singleton,
 *   'method')` (the spy would never be recognized) — real tests spy on these. Safe
 *   because neither class uses `#private` fields (which brand-check against the raw
 *   instance and would reject a proxy `this`) and no caller destructures a method
 *   off these singletons (verified: only `x.method()` / `x.prop` access exists).
 * - `set`/`has`/`deleteProperty` forward too, so the wrapper is indistinguishable
 *   from the instance for property access, assignment, and `in`.
 * - `getPrototypeOf` forwards so `Object.getPrototypeOf(proxy)` is the class
 *   prototype — this lets `jest.spyOn`'s prototype-walk resolve/restore the real
 *   method descriptor cleanly.
 * - Key ENUMERATION (`Object.keys`/spread) is deliberately NOT trapped: forwarding
 *   `ownKeys`/`getOwnPropertyDescriptor` against the empty target would violate the
 *   Proxy invariants. No caller enumerates these singletons, so this is safe by
 *   construction, not by luck.
 *
 * Identity/dedup is unchanged: `resolve` reads the globalThis-keyed store slot, so
 * the proxy always forwards to the ONE instance regardless of how a bundler splits
 * chunks. Annotate the call site `/*#__PURE__*\/` so a tree-shaker can drop the
 * whole wrapper for consumers that never reference the binding.
 *
 * EDGE-SAFE (P5): `Proxy`/`Reflect` are web-standard globals — no Node built-ins.
 */
export function lazySingletonProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const instance = resolve();
      return Reflect.get(instance, prop, instance);
    },
    set(_t, prop, value) {
      return Reflect.set(resolve(), prop, value);
    },
    has(_t, prop) {
      return Reflect.has(resolve(), prop);
    },
    deleteProperty(_t, prop) {
      return Reflect.deleteProperty(resolve(), prop);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}
