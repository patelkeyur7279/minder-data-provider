/**
 * Global MinderConfig Getter
 * 
 * Provides access to the global MinderConfig without requiring MinderDataProvider context.
 * This allows standalone usage of hooks like useMinder() without a provider.
 */

import type { MinderConfig } from './types';

/**
 * Global MinderConfig instance
 * Set by MinderDataProvider or manually via setGlobalMinderConfig
 */
let globalMinderConfig: MinderConfig | null = null;

/**
 * Set the global MinderConfig
 * This is automatically called by MinderDataProvider when it mounts
 * Can also be called manually for standalone usage
 * 
 * @param config - The MinderConfig to set globally
 */
export function setGlobalMinderConfig(config: MinderConfig): void {
  globalMinderConfig = config;
}

/**
 * Get the global MinderConfig
 * Returns null if no config has been set (no provider and no manual setup)
 * 
 * @returns The global MinderConfig or null
 */
export function getGlobalMinderConfig(): MinderConfig | null {
  return globalMinderConfig;
}

/**
 * Clear the global MinderConfig
 * Useful for testing or unmounting scenarios
 */
export function clearGlobalMinderConfig(): void {
  globalMinderConfig = null;
}

/**
 * Check if global MinderConfig is available
 * 
 * @returns True if global config is set, false otherwise
 */
export function hasGlobalMinderConfig(): boolean {
  return globalMinderConfig !== null;
}
