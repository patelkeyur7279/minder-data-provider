/**
 * Capability Provider Registry
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs (`Buffer`, `fs`, `path`). This module is
 * imported from the browser/edge as well as Node, so it may only use web-standard JS.
 *
 * A "capability provider" is a concrete implementation of one of the capability contracts
 * (auth/payments/storage/live — see ./types.ts) registered at runtime by app setup code, e.g.
 *
 *   registerCapabilityProvider({
 *     providerName: '@minder/provider-supabase',
 *     capability: 'auth',
 *     implementation: supabaseAuthAdapter,
 *     getProviderClient: () => supabaseClient,
 *   });
 *
 * There is at most one provider registered per capability at a time. Registering a second
 * provider for an already-occupied capability REPLACES the existing one (with a single
 * `console.warn`) rather than throwing — this keeps hot-reload/dev ergonomics simple.
 */

export type Capability = 'auth' | 'payments' | 'storage' | 'live';

export interface CapabilityProvider<T = unknown> {
  /** Identifies the provider package/adapter, e.g. "@minder/provider-supabase". */
  providerName: string;
  /** Which capability this provider implements. */
  capability: Capability;
  /** The contract implementation (shape depends on `capability` — see ./types.ts). */
  implementation: T;
  /** True when this is a mock/test double rather than a real provider (see F-04). */
  isMock?: boolean;
  /** Returns the raw underlying client object (e.g. the Supabase client instance). */
  getProviderClient(): unknown;
}

// Module-level registry state. One slot per capability.
const registry = new Map<Capability, CapabilityProvider>();

// Subscribers notified on every register/unregister so hooks (useSyncExternalStore) can
// re-render when the registry changes for a capability they care about.
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    cb();
  }
}

/**
 * Register a capability provider. If a provider is already registered for the same
 * capability, it is replaced and exactly ONE `console.warn` is emitted describing the
 * replacement (old provider name -> new provider name).
 *
 * Returns an `unregister` function. Calling it removes the provider ONLY if it is still the
 * currently-registered provider for that capability (i.e. it is a no-op if something else has
 * since replaced it) — this avoids a stale unregister callback tearing down a newer provider.
 */
export function registerCapabilityProvider(provider: CapabilityProvider): () => void {
  const existing = registry.get(provider.capability);
  if (existing) {
    console.warn(
      `[minder-data-provider] Replacing capability provider for "${provider.capability}": ` +
        `"${existing.providerName}" -> "${provider.providerName}".`
    );
  }

  registry.set(provider.capability, provider);
  notify();

  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    if (registry.get(provider.capability) === provider) {
      registry.delete(provider.capability);
      notify();
    }
  };
}

/**
 * Get the currently-registered provider for a capability, or `null` if none is registered.
 */
export function getCapabilityProvider<T = unknown>(capability: Capability): CapabilityProvider<T> | null {
  return (registry.get(capability) as CapabilityProvider<T> | undefined) ?? null;
}

/**
 * Subscribe to registry changes (any capability). Intended for `useSyncExternalStore`.
 * Returns an unsubscribe function.
 */
export function subscribeCapabilityRegistry(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
