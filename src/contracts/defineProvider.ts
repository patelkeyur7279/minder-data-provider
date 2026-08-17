/**
 * defineProvider — typed factory for custom capability providers (Task 4.0).
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs (`Buffer`, `fs`, `path`). Imports only the
 * two registry primitives from this same edge-safe `contracts` module, so adding this helper
 * pulls NO new transitive dependency into any bundle that already ships `contracts`.
 *
 * WHAT IT IS: optional ergonomic sugar over the exact same public functions certified
 * providers call by hand (`registerCapabilityProvider` + `registerMockProvider` from
 * ./registry.ts / ./mockRegistry.ts). It formalizes the shape every provider re-implements —
 * mock-vs-real branch, the raw-client escape hatch, and the cleanup that must clear the active
 * client ONLY if it is still the current one — into one generically-typed call. It adds no new
 * capability: anything you can build with it you can still build from the primitives directly
 * (see docs/providers/CUSTOM.md §3), and this is deliberately NOT how the six certified
 * providers are wired. It exists so a third-party author gets the correct lifecycle (including
 * the cleanup footgun handled once, correctly) for free.
 *
 * NOT to be confused with `defineProviderManifest` (src/plugins/manifest.ts), which builds the
 * static `manifest.json` metadata for community CERTIFICATION — a different, publish-time
 * concern. This factory is the RUNTIME registration shape.
 *
 * Client-config safety (`registerClientSafeProviderKeys`) is intentionally left to the caller:
 * it is a separate, config-time concern, it is one line at module top, and keeping it out of
 * this factory avoids importing `src/config/validateConfig` into the edge-safe contracts bundle.
 */
import { registerCapabilityProvider } from './registry.js';
import type { Capability } from './registry.js';
import { registerMockProvider } from './mockRegistry.js';

/**
 * Options for {@link defineProvider}.
 *
 * @typeParam TContract - the capability contract the hooks consume (e.g. `LiveContract`).
 * @typeParam TConfig   - your provider's config object (defaults to `{ mock?: boolean }`).
 * @typeParam TClient   - the raw underlying SDK client type surfaced via `getClient()`.
 */
export interface DefineProviderOptions<TContract, TConfig = { mock?: boolean }, TClient = unknown> {
  /** Provider identity, e.g. `'acme-analytics'`. Used as `CapabilityProvider.providerName`. */
  providerName: string;
  /** Which capability contract this provider satisfies. */
  capability: Capability;
  /**
   * Build the real underlying SDK client from resolved config. Called ONLY on the real
   * (non-mock) path, before the contract is registered. Throw here for missing required config
   * (e.g. an API key) — the throw propagates out of `register()`.
   */
  createClient(config: TConfig): TClient;
  /** Adapt the raw client into the capability contract the matching `useX()` hook consumes. */
  toContract(client: TClient, config: TConfig): TContract;
  /**
   * Decide whether a given config selects mock mode. Defaults to `config.mock === true`.
   * Override when your mock trigger is named differently or computed.
   */
  isMock?(config: TConfig): boolean;
  /**
   * Build the deterministic mock contract (zero SDK, zero keys, zero network). Required to
   * support mock mode — `register()` throws if mock mode is selected and this is absent.
   */
  createMock?(config: TConfig): TContract;
}

/**
 * A registered-at-runtime custom provider, returned by {@link defineProvider}. Holds the
 * provider identity plus the lifecycle: `register(config)` (real or mock, per the options) and
 * `getClient()` (the raw SDK escape hatch for the currently-active instance).
 */
export interface CustomProvider<TConfig, TClient> {
  /** The `providerName` passed to `defineProvider`. */
  readonly providerName: string;
  /** The `capability` passed to `defineProvider`. */
  readonly capability: Capability;
  /**
   * Register this provider with `config`. In mock mode registers the `createMock()` contract
   * flagged `isMock: true`; otherwise builds the real client and registers `toContract()`.
   * Returns an `unregister()` that removes the registration (with the same
   * still-current-only semantics as `registerCapabilityProvider`) AND clears `getClient()`.
   */
  register(config: TConfig): () => void;
  /**
   * The raw underlying SDK client for the currently-registered real instance, or `null` in
   * mock mode / when nothing is registered. The provider-specific escape hatch for SDK calls a
   * capability contract does not cover.
   */
  getClient(): TClient | null;
}

/**
 * Build a {@link CustomProvider} from the same public registry primitives every certified
 * provider uses. See the module header for what this does and does not add.
 *
 * @example
 * const acme = defineProvider<LiveContract, { projectId?: string; mock?: boolean }, AcmeClient>({
 *   providerName: 'acme-analytics',
 *   capability: 'live',
 *   createClient: (c) => {
 *     if (!c.projectId) throw new Error('projectId is required');
 *     return makeAcmeClient(c.projectId);
 *   },
 *   toContract: (client) => ({ subscribe: (ch, cb) => (client.on(ch, cb), () => client.off(ch, cb)) }),
 *   createMock: () => ({ subscribe: (ch, cb) => (cb({ channel: ch, mock: true }), () => {}) }),
 * });
 * const unregister = acme.register({ projectId: 'proj_1' }); // or ({ mock: true })
 * acme.getClient();  // raw SDK client, or null in mock mode
 * unregister();      // tears down + clears getClient()
 */
export function defineProvider<TContract, TConfig = { mock?: boolean }, TClient = unknown>(
  options: DefineProviderOptions<TContract, TConfig, TClient>
): CustomProvider<TConfig, TClient> {
  const { providerName, capability, createClient, toContract, isMock, createMock } = options;

  // Module-scoped-per-provider mutable: the currently-active real client (null in mock mode).
  let activeClient: TClient | null = null;

  const mockSelected = (config: TConfig): boolean =>
    isMock ? isMock(config) : (config as { mock?: boolean }).mock === true;

  return {
    providerName,
    capability,
    getClient: () => activeClient,
    register(config: TConfig): () => void {
      if (mockSelected(config)) {
        if (!createMock) {
          throw new Error(
            `defineProvider("${providerName}"): mock mode selected but no createMock() was provided.`
          );
        }
        activeClient = null;
        // registerMockProvider flags isMock:true and uses providerName as the mock's name.
        return registerMockProvider<TContract>(capability, createMock(config), providerName);
      }

      const client = createClient(config);
      activeClient = client;

      const unregister = registerCapabilityProvider({
        providerName,
        capability,
        implementation: toContract(client, config),
        getProviderClient: () => client,
      });

      return () => {
        unregister();
        // Clear the escape hatch ONLY if we are still the active client — a newer register()
        // may have replaced us, and a stale cleanup must not null out a newer client.
        if (activeClient === client) activeClient = null;
      };
    },
  };
}
