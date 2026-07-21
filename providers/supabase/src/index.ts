/**
 * @minder/provider-supabase — the Supabase capability adapter.
 *
 * Registers three capability providers against the Minder registry:
 *   - auth    → AuthContract    (client.auth.getSession / signOut)
 *   - storage → StorageContract (client.storage.from(bucket).upload / getPublicUrl / remove)
 *   - live    → LiveContract    (client.channel(...).on('broadcast').subscribe / removeChannel)
 *
 * so an app can use `useAuth()` / `useStorage()` / `useLive()` (from
 * `minder-data-provider`) without writing any Supabase glue. `getProviderClient()`
 * returns the raw Supabase client for the escape-hatch case.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * `@supabase/supabase-js` is an OPTIONAL peer dependency and is loaded ONLY via a
 * dynamic `import()` inside `registerSupabaseProvider` (or supplied through the
 * `createClientFactory` DI seam). It never appears as a static import, so this
 * module — and anything that imports it — stays importable in web/edge bundles
 * that never construct a real client (e.g. mock mode), and the SDK is never
 * bundled for consumers who don't use it.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `anonKey` is Supabase's intentionally-public browser key (guarded by row-level
 * security) — registered client-safe below. `serviceRoleKey` is a real secret:
 * it is `serverOnly` in the manifest, typed as `CredentialInput` (never a raw
 * string in client config), and this adapter never reads it — the anon client is
 * all the browser needs. No thrown error here echoes any config value.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package (wired by S-02) imports these from `minder-data-provider`
 * subpaths instead; the runtime shapes are identical.
 */
import type { AuthContract, StorageContract, LiveContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { CredentialInput } from '../../../src/security/credentials.js';
import { registerSupabaseMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Supabase as a certified provider: `url`/`anonKey`
// are exempt, while any other credential-shaped key (e.g. a raw `serviceRoleKey`)
// hard-fails in a browser-like environment. Runs once, at import time.
registerClientSafeProviderKeys('supabase', ['url', 'anonKey']);

export interface SupabaseProviderConfig {
  /** Project URL, e.g. https://<ref>.supabase.co — public. */
  url: string;
  /** The public anon key — intentionally PUBLIC (Supabase design; RLS-gated). */
  anonKey: string;
  /** Service-role secret — serverOnly; never a raw string in client config. */
  serviceRoleKey?: CredentialInput;
  /** When true, register the in-memory mocks instead of a real client. */
  mock?: boolean;
  /**
   * DI seam for tests / custom SDK wiring. Given `(url, anonKey)`, returns a
   * Supabase-client-shaped object. Defaults to lazily importing
   * `@supabase/supabase-js` and calling its `createClient`.
   */
  createClientFactory?: (url: string, key: string) => unknown;
}

/** The subset of the Supabase client surface this adapter uses. */
interface SupabaseLikeClient {
  auth: {
    getSession(): Promise<{ data: { session: SupabaseSession | null } }>;
    signOut(): Promise<unknown>;
  };
  storage: {
    from(bucket: string): {
      upload(path: string, file: unknown): Promise<{ error: unknown }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
  channel(name: string): SupabaseChannel;
  removeChannel(channel: unknown): unknown;
}

interface SupabaseSession {
  user?: { id: string } | null;
  [key: string]: unknown;
}

interface SupabaseChannel {
  on(type: string, filter: { event: string }, cb: (payload: unknown) => void): SupabaseChannel;
  subscribe(): SupabaseChannel;
}

const SDK_MISSING_MESSAGE =
  'Install @supabase/supabase-js (optional peer): npm i @supabase/supabase-js';

const PROVIDER_NAME = '@minder/provider-supabase';

// The most-recently-created real client, returned by `getProviderClient()`. Null
// in mock mode (there is no raw SDK client to hand back).
let activeClient: SupabaseLikeClient | null = null;

/** Return the raw underlying Supabase client (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

/** The optional-peer SDK specifier, kept in a variable so it is resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const SUPABASE_SDK = '@supabase/supabase-js';

/** Default factory: lazily import the SDK and construct a client. */
async function defaultCreateClient(url: string, key: string): Promise<SupabaseLikeClient> {
  let mod: { createClient?: (url: string, key: string) => unknown };
  try {
    mod = (await import(SUPABASE_SDK)) as { createClient?: (url: string, key: string) => unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  if (typeof mod.createClient !== 'function') {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  return mod.createClient(url, key) as SupabaseLikeClient;
}

/** Split `'bucket/rest/of/path'` into its bucket and in-bucket object path. */
function splitBucketPath(path: string): { bucket: string; objectPath: string } {
  const normalized = path.replace(/^\/+/, '');
  const slash = normalized.indexOf('/');
  if (slash === -1) {
    return { bucket: normalized, objectPath: '' };
  }
  return { bucket: normalized.slice(0, slash), objectPath: normalized.slice(slash + 1) };
}

function buildAuthContract(client: SupabaseLikeClient): AuthContract {
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      const session = data?.session ?? null;
      const userId = session?.user?.id;
      if (!session || !userId) return null;
      return { userId, raw: session };
    },
    async signOut() {
      await client.auth.signOut();
    },
  };
}

function buildStorageContract(client: SupabaseLikeClient): StorageContract {
  return {
    async upload(file, path) {
      const { bucket, objectPath } = splitBucketPath(path);
      const bucketApi = client.storage.from(bucket);
      const { error } = await bucketApi.upload(objectPath, file);
      if (error) throw error;
      const { data } = bucketApi.getPublicUrl(objectPath);
      return { url: data.publicUrl };
    },
    async remove(path) {
      const { bucket, objectPath } = splitBucketPath(path);
      const { error } = await client.storage.from(bucket).remove([objectPath]);
      if (error) throw error;
    },
  };
}

function buildLiveContract(client: SupabaseLikeClient): LiveContract {
  return {
    subscribe(channel, cb) {
      const ch = client
        .channel(channel)
        .on('broadcast', { event: '*' }, (payload: unknown) => cb(payload))
        .subscribe();
      return () => {
        client.removeChannel(ch);
      };
    },
  };
}

/**
 * Register the Supabase provider. Returns an unregister function that tears down
 * every capability it registered.
 *
 * - `config` omitted → read `getProviderConfig('supabase')` (global Minder config).
 * - `mock: true` (explicit or from config) → register the in-memory mocks
 *   (auth + storage + live) with zero SDK and zero credentials.
 * - otherwise → create ONE Supabase client (via `createClientFactory` or a lazy
 *   `@supabase/supabase-js` import) and register the three real contracts.
 */
export async function registerSupabaseProvider(
  config?: SupabaseProviderConfig
): Promise<() => void> {
  let effective: SupabaseProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('supabase');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<SupabaseProviderConfig>;
      effective = {
        url: typeof raw.url === 'string' ? raw.url : '',
        anonKey: typeof raw.anonKey === 'string' ? raw.anonKey : '',
        mock: fromGlobal.mock,
        serviceRoleKey: raw.serviceRoleKey,
        createClientFactory: raw.createClientFactory,
      };
    }
  }

  if (!effective) {
    throw new Error(
      'registerSupabaseProvider: no config passed and no providers.supabase config found. ' +
        'Pass a config or configure Minder with providers.supabase.'
    );
  }

  // ── Mock mode: zero SDK, zero keys ──────────────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerSupabaseMocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  if (!effective.url || !effective.anonKey) {
    throw new Error(
      'registerSupabaseProvider: both "url" and "anonKey" are required for the real Supabase provider. ' +
        'For credential-free UI development, set providers.supabase.mock = true.'
    );
  }

  const factory = effective.createClientFactory ?? defaultCreateClient;
  const client = (await factory(effective.url, effective.anonKey)) as SupabaseLikeClient;
  activeClient = client;

  const getClient = (): unknown => client;
  const unregisters = [
    registerCapabilityProvider({
      providerName: PROVIDER_NAME,
      capability: 'auth',
      implementation: buildAuthContract(client),
      getProviderClient: getClient,
    }),
    registerCapabilityProvider({
      providerName: PROVIDER_NAME,
      capability: 'storage',
      implementation: buildStorageContract(client),
      getProviderClient: getClient,
    }),
    registerCapabilityProvider({
      providerName: PROVIDER_NAME,
      capability: 'live',
      implementation: buildLiveContract(client),
      getProviderClient: getClient,
    }),
  ];

  return () => {
    for (const u of unregisters) u();
    if (activeClient === client) activeClient = null;
  };
}
