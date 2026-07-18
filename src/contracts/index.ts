/**
 * Capability Contracts — barrel
 *
 * EDGE-SAFE: re-exports only. See ./registry.ts (provider registration) and ./types.ts
 * (contract shapes: AuthContract, PaymentsContract, StorageContract, LiveContract).
 */

export type { Capability, CapabilityProvider } from './registry.js';
export {
  registerCapabilityProvider,
  getCapabilityProvider,
  subscribeCapabilityRegistry,
} from './registry.js';

export type { AuthContract, PaymentsContract, StorageContract, LiveContract } from './types.js';

// Mock-mode plumbing (task F-04) — see ./mockRegistry.ts.
export { registerMockProvider, getProviderConfig } from './mockRegistry.js';
