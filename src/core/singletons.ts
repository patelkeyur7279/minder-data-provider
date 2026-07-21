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
  /** Global plugin manager (A4). */
  pluginManager?: PluginManager;
  /** Global auth manager (A5). */
  globalAuthManager?: GlobalAuthManager;
}

/**
 * Process-wide key. `Symbol.for` looks the symbol up in the global registry, so
 * two copies of this module (duplicated into separate chunks by a bundler) still
 * resolve to the SAME symbol and therefore the SAME store object.
 */
const STORE_KEY = Symbol.for('minder-data-provider.singletons');

/**
 * The shared store, created on first access — NEVER at import. This is the whole
 * reason `sideEffects: false` is honest: importing this module runs nothing.
 */
export function minderStore(): MinderSingletonStore {
  const g = globalThis as unknown as Record<symbol, MinderSingletonStore>;
  return (g[STORE_KEY] ??= {});
}
