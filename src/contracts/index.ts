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

// Typed custom-provider factory (Task 4.0) — optional ergonomic sugar over the primitives
// above. See ./defineProvider.ts and docs/providers/CUSTOM.md.
export { defineProvider } from './defineProvider.js';
export type { DefineProviderOptions, CustomProvider } from './defineProvider.js';
