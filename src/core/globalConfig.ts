/**
 * Global MinderConfig Getter
 * 
 * Provides access to the global MinderConfig without requiring MinderDataProvider context.
 * This allows standalone usage of hooks like useMinder() without a provider.
 */

import type { MinderConfig } from './types';
import { minderStore } from './singletons.js';

/**
 * Global MinderConfig instance (C1). Held on the process-wide singleton store
 * (see ./singletons.ts) rather than a module-level `let`, so it stays ONE
 * instance no matter how a consumer's bundler splits/duplicates chunks — the
 * provider that writes it and the standalone hook that reads it can never end up
 * on opposite sides of a forked copy. `null` when unset (no provider, no manual
 * setup), exactly as before.
 */

/**
 * Set the global MinderConfig
 * This is automatically called by MinderDataProvider when it mounts
 * Can also be called manually for standalone usage
 *
 * @param config - The MinderConfig to set globally
 */
export function setGlobalMinderConfig(config: MinderConfig): void {
  minderStore().globalMinderConfig = config;
}

/**
 * Get the global MinderConfig
 * Returns null if no config has been set (no provider and no manual setup)
 *
 * @returns The global MinderConfig or null
 */
export function getGlobalMinderConfig(): MinderConfig | null {
  return minderStore().globalMinderConfig ?? null;
}

/**
 * Clear the global MinderConfig
 * Useful for testing or unmounting scenarios
 */
export function clearGlobalMinderConfig(): void {
  minderStore().globalMinderConfig = null;
}

/**
 * Check if global MinderConfig is available
 *
 * @returns True if global config is set, false otherwise
 */
export function hasGlobalMinderConfig(): boolean {
  return (minderStore().globalMinderConfig ?? null) !== null;
}
