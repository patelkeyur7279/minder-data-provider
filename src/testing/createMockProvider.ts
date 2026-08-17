/**
 * `createMockProvider` — the fixture factory provider authors write tests
 * against. Validates a candidate `ProviderManifest` (throwing a descriptive
 * error on failure, same contract as certification) and wires up a
 * `MinderPlugin` whose lifecycle/capability hooks pass straight through to
 * caller-supplied callbacks so tests can assert on `onRequest`/`onResponse`/
 * `provideToken`/etc. being invoked.
 */
import type { MinderPlugin, PluginManifest } from '../plugins/PluginSystem.js';
import type { ProviderManifest } from '../plugins/manifest.js';
import { validateProviderManifest } from '../plugins/manifest.js';
import { MinderConfigError } from '../errors/MinderError.js';

/**
 * Caller-supplied lifecycle/capability hook implementations. Same shape as
 * `MinderPlugin`'s hooks (everything but `name`/`version`/`manifest`, which
 * are derived from the `ProviderManifest`).
 */
export type MockProviderImpl = Partial<
  Pick<
    MinderPlugin,
    | 'onInit'
    | 'onRequest'
    | 'onResponse'
    | 'onError'
    | 'onCacheHit'
    | 'onCacheMiss'
    | 'onDestroy'
    | 'provideToken'
    | 'onAuthRefresh'
    | 'onUpload'
    | 'onSync'
    | 'onConnectivityChange'
  >
>;

export interface MockProvider {
  /** The validated manifest, returned as-is for convenience. */
  manifest: ProviderManifest;
  /** A `MinderPlugin` wired from `impl`, ready to register with a `PluginManager`. */
  plugin: MinderPlugin;
}

/**
 * Validate `manifest` (via `validateProviderManifest`) and build a
 * `{ manifest, plugin }` fixture from it. Throws a `MinderConfigError`
 * listing every validation error when the manifest is invalid.
 */
export function createMockProvider(manifest: ProviderManifest, impl: MockProviderImpl = {}): MockProvider {
  const result = validateProviderManifest(manifest);
  if (!result.valid) {
    const name = (manifest as { name?: unknown } | null | undefined)?.name;
    throw new MinderConfigError(
      `Invalid provider manifest${typeof name === 'string' ? ` for "${name}"` : ''}:\n` +
        result.errors.map((e) => `  • ${e}`).join('\n'),
      'manifest',
      'INVALID_PROVIDER_MANIFEST',
      { errors: result.errors }
    );
  }

  const pluginManifest: PluginManifest = {
    name: manifest.name,
    version: manifest.version,
    capabilities: manifest.capabilities as PluginManifest['capabilities'],
    peerDependencies: Object.keys(manifest.peerDependencies),
  };

  const plugin: MinderPlugin = {
    name: manifest.name,
    version: manifest.version,
    manifest: pluginManifest,
    onInit: impl.onInit,
    onRequest: impl.onRequest,
    onResponse: impl.onResponse,
    onError: impl.onError,
    onCacheHit: impl.onCacheHit,
    onCacheMiss: impl.onCacheMiss,
    onDestroy: impl.onDestroy,
    provideToken: impl.provideToken,
    onAuthRefresh: impl.onAuthRefresh,
    onUpload: impl.onUpload,
    onSync: impl.onSync,
    onConnectivityChange: impl.onConnectivityChange,
  };

  return { manifest, plugin };
}
