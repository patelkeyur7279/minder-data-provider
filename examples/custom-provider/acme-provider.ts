/**
 * Reference custom provider: "Acme Analytics" (fictional SDK, no real vendor).
 * docs/providers/CUSTOM.md's walkthrough, made runnable + tested. Mirrors
 * providers/clerk but stays IN-APP — same public machinery, no manifest.json,
 * no publishing.
 *
 * Built on the typed `defineProvider` factory (Task 4.0) — optional ergonomic
 * sugar that formalizes the mock-vs-real branch, the raw-client escape hatch,
 * and the "clear the active client only if it is still current" cleanup, so an
 * author gets the correct lifecycle for free. The from-scratch equivalent (the
 * exact same `registerCapabilityProvider` / `registerMockProvider` calls
 * `defineProvider` makes internally) is in docs/providers/CUSTOM.md §3 — this
 * factory adds no capability, only removes boilerplate.
 *
 * Import-path note (G-06): this file lives inside the minder-data-provider
 * repo itself, so it uses relative imports rather than the published package
 * name. Unlike providers/* (which reach into src/ via deep relative paths
 * that only work inside this monorepo), this file's relative paths are
 * scoped to exactly the two PUBLIC entry points an external app would use —
 * proving the published surface is sufficient to build an equivalent custom
 * provider outside this monorepo:
 *
 *   relative import used here      published package specifier
 *   ──────────────────────────     ─────────────────────────────────
 *   '../../src/index.js'       ->  'minder-data-provider'
 *   '../../src/server.js'      ->  'minder-data-provider/server'
 */
import {
  defineProvider,
  getProviderConfig,
  registerClientSafeProviderKeys,
} from '../../src/index.js';
import type { LiveContract, SecretRef } from '../../src/index.js';
import { resolveSecret, jsonResponse } from '../../src/server.js';
import type { MinderHandler } from '../../src/server.js';

// Same call every certified provider makes (see providers/*/src/index.ts):
// exempts these public keys from the raw-secret-shaped-key check below. This is
// a config-time concern kept separate from `defineProvider` (runtime registration).
registerClientSafeProviderKeys('acme', ['projectId', 'mock']);

export interface AcmeProviderConfig {
  projectId?: string; // public — safe inline
  apiSecret?: SecretRef; // secret('ACME_API_SECRET') — server only, NEVER a raw string
  mock?: boolean;
  createAcmeClient?: (projectId: string) => AcmeLikeClient; // test DI seam (default: see below)
}

/** Subset of the (fictional) @acme/analytics-sdk client this adapter uses. */
export interface AcmeLikeClient {
  on(channel: string, cb: (event: unknown) => void): void;
  off(channel: string, cb: (event: unknown) => void): void;
}

const toLiveContract = (client: AcmeLikeClient): LiveContract => ({
  subscribe(channel, cb) {
    client.on(channel, cb);
    return () => client.off(channel, cb);
  },
});

/** Deterministic, synchronous mock — zero SDK, zero keys, zero network. */
function createMockLive(): LiveContract {
  return {
    subscribe(channel, cb) {
      cb({ channel, mock: true });
      return () => {};
    },
  };
}

/** Real adapters lazily `import('@acme/analytics-sdk')` here, the same way
 *  providers/clerk imports @clerk/clerk-js — omitted so this stays an in-memory,
 *  dependency-free stub focused on the Minder-side wiring. */
function defaultAcmeClient(): AcmeLikeClient {
  const listeners = new Map<string, (e: unknown) => void>();
  return { on: (ch, cb) => void listeners.set(ch, cb), off: (ch) => void listeners.delete(ch) };
}

/**
 * The provider, defined once. `defineProvider` owns the lifecycle: it calls `createClient`
 * only on the real path (so `createMock` runs with zero SDK/keys), wires the `getProviderClient`
 * escape hatch, and returns an `unregister()` that clears `getClient()` correctly.
 */
const acmeProvider = defineProvider<LiveContract, AcmeProviderConfig, AcmeLikeClient>({
  providerName: 'acme-analytics',
  capability: 'live',
  createClient(config) {
    if (!config.projectId) {
      throw new Error('registerAcmeProvider: "projectId" is required (or set providers.acme.mock = true).');
    }
    return config.createAcmeClient?.(config.projectId) ?? defaultAcmeClient();
  },
  toContract: (client) => toLiveContract(client),
  createMock: () => createMockLive(),
});

/** Raw SDK escape hatch — null in mock mode. Delegates to the factory's tracked client. */
export function getProviderClient(): unknown {
  return acmeProvider.getClient();
}

/**
 * Register the provider. `config` omitted -> reads providers.acme via getProviderConfig().
 * Thin wrapper over `acmeProvider.register` that adds Acme's config-source fallback.
 */
export function registerAcmeProvider(config?: AcmeProviderConfig): () => void {
  const fromGlobal = !config ? getProviderConfig('acme') : null;
  const effective: AcmeProviderConfig =
    config ?? (fromGlobal ? { ...(fromGlobal.raw as AcmeProviderConfig), mock: fromGlobal.mock } : {});

  return acmeProvider.register(effective);
}

/** SERVER: secret-requiring ingest call. Resolves apiSecret per-request; never logs it. */
export function createAcmeIngestHandler(opts: { apiSecret: SecretRef }): MinderHandler {
  return async function acmeIngestHandler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return jsonResponse({ error: { code: 'ACME_METHOD_NOT_ALLOWED' } }, { status: 405 });
    }
    let key: string;
    try {
      key = resolveSecret(opts.apiSecret);
    } catch (err) {
      console.error('[acme] ingest secret unresolved:', err instanceof Error ? err.message : String(err));
      return jsonResponse({ error: { code: 'ACME_SECRET_UNRESOLVED' } }, { status: 500 });
    }
    await fetch('https://ingest.acme.example/v1/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: await req.text(),
    }).catch(() => undefined); // best-effort forward; failure never surfaces `key`
    return jsonResponse({ ok: true }, { status: 202 });
  };
}
