/**
 * Neutral registry for the "active" OfflineManager instance.
 *
 * This tiny module exists to break what would otherwise be a circular import:
 * `config/index.ts` (which imports half the framework) wires an OfflineManager
 * and needs to publish it, while `core/ApiClient.ts` needs to REUSE that same
 * instance for auto-queueing failed requests. If ApiClient imported config/ (or
 * config imported ApiClient) we'd get a dependency cycle.
 *
 * Instead both sides talk through this leaf module. It imports ONLY the
 * OfflineManager *type* (erased at runtime), so it pulls in no runtime deps and
 * participates in no cycle. `OfflineManager.ts` itself never imports this file.
 *
 * @module platform/offline/registry
 */

import type { OfflineManager } from './OfflineManager.js';

let activeOfflineManager: OfflineManager | null = null;

/**
 * Publish the OfflineManager wired for the current configuration (or `null` to
 * clear it). Called by `configureMinder`'s `wireOfflineManager`.
 */
export function setActiveOfflineManager(manager: OfflineManager | null): void {
  activeOfflineManager = manager;
}

/**
 * The OfflineManager wired by the most recent `configureMinder({ offline })`
 * call, or `null` when none is active. `ApiClient` reads this so it reuses the
 * wired instance (whose sync engine emits onSync / onConnectivityChange) rather
 * than constructing a second, hook-less one.
 */
export function getActiveOfflineManager(): OfflineManager | null {
  return activeOfflineManager;
}
