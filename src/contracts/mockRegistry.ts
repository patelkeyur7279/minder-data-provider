/**
 * Mock-Mode Plumbing (task F-04)
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs (`Buffer`, `fs`, `path`). This module is
 * imported from the browser/edge as well as Node, so it may only use web-standard JS.
 *
 * Two pieces:
 *  - `registerMockProvider`: a thin wrapper around `registerCapabilityProvider` (./registry.ts)
 *    that flags the registration `isMock: true` and defaults `providerName` to
 *    `mock-${capability}`. This is what lets `useAuth`/`useCheckout`/`useStorage`/`useLive`
 *    (../hooks/contracts.ts) be exercised end-to-end with zero credentials — register a mock,
 *    the hooks light up exactly as they would for a real provider, and
 *    `getCapabilityProvider(capability)?.isMock` tells callers (doctor, catalog, dev banners)
 *    that the active provider is a test double rather than a real one.
 *  - `getProviderConfig`: reads the `providers.<name>` config recognized by
 *    `../config/validateConfig.ts` (`providers: { <name>: { mock: true } }`), so tooling can
 *    tell whether a given provider name was configured for mock mode. Reads from the `config`
 *    argument when given; otherwise falls back to the global config set by `configureMinder` /
 *    `setGlobalMinderConfig` (../core/globalConfig.ts).
 */
import { registerCapabilityProvider } from './registry.js';
import type { Capability } from './registry.js';
import { getGlobalMinderConfig } from '../core/globalConfig.js';

/**
 * Register `mockImpl` as a capability provider flagged `isMock: true`. Same
 * replace/warn/unregister semantics as `registerCapabilityProvider` — see ./registry.ts.
 *
 * `providerName` defaults to `mock-${capability}` (e.g. "mock-auth") when omitted.
 * `getProviderClient()` returns `mockImpl` itself, matching the convention that a provider's
 * "raw client" is whatever object callers can reach for provider-specific escape hatches.
 */
export function registerMockProvider<T>(capability: Capability, mockImpl: T, providerName?: string): () => void {
  return registerCapabilityProvider({
    providerName: providerName ?? `mock-${capability}`,
    capability,
    implementation: mockImpl,
    isMock: true,
    getProviderClient: () => mockImpl,
  });
}

/**
 * Read the `providers.<name>` config entry recognized by
 * `../config/validateConfig.ts` — `{ mock: boolean; raw: <the whole providers.<name> object> }`,
 * or `null` when there is no config source, or no entry for `name`.
 *
 * Reads `config.providers?.[name]` when `config` is given; otherwise falls back to the global
 * config (`getGlobalMinderConfig()`). `mock` is `true` iff the entry's `mock` field is
 * literally `true` (any other value, including a validation-error-worthy non-boolean, is
 * treated as not-mock here — `validateMinderConfig` is what surfaces the bad value as an
 * actionable error).
 */
export function getProviderConfig(
  name: string,
  config?: { providers?: Record<string, unknown> }
): { mock: boolean; raw: Record<string, unknown> } | null {
  const globalConfig = getGlobalMinderConfig() as { providers?: Record<string, unknown> } | null;
  const effective = config ?? globalConfig;
  const raw = effective?.providers?.[name];

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const rawRecord = raw as Record<string, unknown>;
  return { mock: rawRecord.mock === true, raw: rawRecord };
}
