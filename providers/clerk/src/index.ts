/**
 * @minder/provider-clerk — the Clerk auth adapter. THE DEDICATED-AUTH SHOWCASE:
 * "login working in 5 minutes." One stable hook — `useAuth()` — over Clerk, so an
 * app switches auth providers (Clerk ↔ Supabase ↔ Firebase) by config, not by
 * rewriting integration code.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerClerkProvider(config?)` registers an `AuthContract` (so an
 *     app can call `useAuth()` from `minder-data-provider`). `getSession()` reads
 *     the Clerk session via `@clerk/clerk-js` (lazy peer, or the `createClerkFactory`
 *     DI seam) and returns `{ userId, raw }` or `null`; `signOut()` calls
 *     `clerk.signOut()`. `mock: true` registers the in-memory mock (zero SDK, zero
 *     keys). `getProviderClient()` returns the raw Clerk instance (escape hatch).
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT any Clerk SDK) —
 *     `createClerkSessionHandler(...)` is a web-standard `(Request) => Response`
 *     handler that verifies a Clerk session token server-side: it resolves the
 *     secret key per-request and POSTs to Clerk's session-verify API with
 *     `Authorization: Bearer <secretKey>`, returning `{ userId, valid }`.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handler speaks to Clerk over `fetch`, so this module has NO static
 * SDK dependency and stays importable in web/edge bundles. `@clerk/clerk-js` is an
 * OPTIONAL peer, reached ONLY via a dynamic `import()` (non-literal specifier)
 * inside `registerClerkProvider` — or supplied through the `createClerkFactory` DI
 * seam. It never appears as a static import, so the SDK is never bundled for
 * consumers who don't use it (mock mode, or server-only session verification).
 *
 * NOTE — honest mobile claims: Clerk's React Native SDK differs from web; this
 * adapter is NOT tested against it. The manifest declares `frameworks:
 * ['react','nextjs','vite']` only (NOT react-native), and the catalog reflects that.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `publishableKey` is Clerk's intentionally-public browser key (`pk_...`) —
 * registered client-safe below. `secretKey` (`sk_...`) is a real secret: it is
 * `serverOnly` in the manifest, typed as `CredentialInput` (never a raw string in
 * client config), resolved per-request via `resolveCredential` INSIDE the server
 * handler only, and never echoed by any thrown error, response body, or log. A
 * Clerk upstream error's own message is passed through, but the secret key is
 * NEVER included.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package (wired by D-02) imports these from `minder-data-provider`
 * subpaths instead; the runtime shapes are identical.
 */
import type { AuthContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { CredentialInput } from '../../../src/security/credentials.js';
import { resolveCredential } from '../../../src/security/credentials.js';
import type { MinderHandler } from '../../../src/server/handlers.js';
import { jsonResponse } from '../../../src/server/handlers.js';
import { registerClerkMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Clerk as a certified provider: `publishableKey`
// (public by design) and `mock` are exempt, while any other credential-shaped key
// (e.g. a raw `secretKey`) hard-fails in a browser-like environment. Runs once, at
// import time.
registerClientSafeProviderKeys('clerk', ['publishableKey', 'mock']);

export interface ClerkProviderConfig {
  /** The publishable key (`pk_...`) — clientSafe, intentionally PUBLIC. */
  publishableKey?: string;
  /** Secret key (`sk_...`) — serverOnly; used only by the server session handler. */
  secretKey?: CredentialInput;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
  /**
   * DI seam for tests / custom SDK wiring. Returns a Clerk-instance-shaped object
   * (a loaded `Clerk` from `@clerk/clerk-js`). Defaults to lazily importing
   * `@clerk/clerk-js`, constructing `new Clerk(publishableKey)`, and `load()`-ing it.
   */
  createClerkFactory?: () => unknown;
}

/** The subset of the `@clerk/clerk-js` Clerk instance surface this adapter uses. */
interface ClerkLikeInstance {
  /** The active session, if any. `null`/`undefined` when signed out. */
  session?: ClerkSession | null;
  /** The active user, if any (fallback source for the user id). */
  user?: { id?: string } | null;
  /** Called once after construction to hydrate the instance (web SDK). */
  load?: () => Promise<void>;
  /** Sign the current user out. */
  signOut(): Promise<void>;
}

interface ClerkSession {
  id?: string;
  user?: { id?: string } | null;
  [key: string]: unknown;
}

const PROVIDER_NAME = '@minder/provider-clerk';

/** Clerk's Backend API endpoint for verifying a session token. */
const CLERK_SESSION_VERIFY_URL = 'https://api.clerk.com/v1/sessions/verify';

/** The optional-peer SDK specifier, kept in a variable so it is resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const CLERK_SDK = '@clerk/clerk-js';

const SDK_MISSING_MESSAGE = 'Install @clerk/clerk-js (optional peer): npm i @clerk/clerk-js';

// The most-recently-created real Clerk instance, returned by `getProviderClient()`.
// Null in mock mode (there is no raw SDK client to hand back).
let activeClient: ClerkLikeInstance | null = null;

/** Return the raw underlying Clerk instance (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

/** Default factory: lazily import the SDK, construct a Clerk instance from the
 *  publishable key, and load it. Throws the helpful install message if the peer
 *  is absent. */
async function defaultCreateClerk(publishableKey: string): Promise<ClerkLikeInstance> {
  let mod: { Clerk?: unknown; default?: unknown } | undefined;
  try {
    mod = (await import(CLERK_SDK)) as { Clerk?: unknown; default?: unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const Ctor = mod?.Clerk ?? mod?.default ?? mod;
  if (typeof Ctor !== 'function') {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const clerk = new (Ctor as new (key: string) => unknown)(publishableKey) as ClerkLikeInstance;
  if (typeof clerk.load === 'function') {
    await clerk.load();
  }
  return clerk;
}

function buildAuthContract(client: ClerkLikeInstance): AuthContract {
  return {
    async getSession() {
      const session = client.session ?? null;
      const userId = session?.user?.id ?? client.user?.id;
      if (!session || !userId) return null;
      return { userId, raw: session };
    },
    async signOut() {
      await client.signOut();
    },
  };
}

// ── SERVER: session-verify handler (edge-safe, zero-dep) ─────────────────────

/**
 * Create an edge-safe Clerk session-verify handler. On POST it reads
 * `{ sessionToken }` (malformed → 400), resolves `secretKey` server-side, and
 * POSTs to Clerk's session-verify API with `Authorization: Bearer <key>`. Returns
 * `{ userId, valid }` from Clerk's response. Any upstream failure is mapped to a
 * MASKED 502: Clerk's own message is passed through, but the secret key NEVER
 * appears in any response body or log. A non-POST request → 405.
 */
export function createClerkSessionHandler(opts: {
  secretKey: CredentialInput;
  serverConfig?: Record<string, unknown>;
}): MinderHandler {
  return async function clerkSessionHandler(req: Request): Promise<Response> {
    // 0) Only POST is allowed.
    if (req.method !== 'POST') {
      return jsonResponse(
        { error: { code: 'CLERK_METHOD_NOT_ALLOWED', message: 'Method not allowed; use POST.' } },
        { status: 405, headers: { allow: 'POST' } }
      );
    }

    // 1) Read + validate the body FIRST — malformed requests never touch the secret.
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return jsonResponse(
        { error: { code: 'CLERK_BAD_REQUEST', message: 'Could not read request body.' } },
        { status: 400 }
      );
    }

    let json: unknown;
    try {
      json = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      return jsonResponse(
        { error: { code: 'CLERK_BAD_REQUEST', message: 'Request body is not valid JSON.' } },
        { status: 400 }
      );
    }

    const sessionToken =
      json != null && typeof json === 'object' && !Array.isArray(json)
        ? (json as Record<string, unknown>).sessionToken
        : undefined;
    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      return jsonResponse(
        {
          error: {
            code: 'CLERK_BAD_REQUEST',
            message: 'Request body must include a non-empty "sessionToken" string.',
          },
        },
        { status: 400 }
      );
    }

    // 2) Resolve the secret key per-request, server-side only.
    let key: string;
    try {
      const resolved = await resolveCredential(opts.secretKey, opts.serverConfig);
      if (typeof resolved !== 'string') {
        throw new Error('Clerk secret key resolved to a non-string value.');
      }
      key = resolved;
    } catch (err) {
      // Log-side only: never the key value.
      console.error(
        '[minder:clerk] session secret could not be resolved.',
        err instanceof Error ? err.message : String(err)
      );
      return jsonResponse(
        { error: { code: 'CLERK_SECRET_UNRESOLVED', message: 'Clerk secret could not be resolved.' } },
        { status: 500 }
      );
    }

    // 3) Call Clerk's session-verify API over fetch (no SDK).
    let clerkRes: Response;
    try {
      clerkRes = await fetch(CLERK_SESSION_VERIFY_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ token: sessionToken }),
      });
    } catch {
      // Network / transport failure — masked 502, no key ever included.
      return jsonResponse(
        { error: { code: 'CLERK_UPSTREAM_ERROR', message: 'Failed to reach Clerk.' } },
        { status: 502 }
      );
    }

    const data = (await clerkRes.json().catch(() => ({}))) as {
      userId?: unknown;
      user_id?: unknown;
      valid?: unknown;
      error?: { message?: string };
      errors?: Array<{ message?: string }>;
    };

    if (!clerkRes.ok) {
      // Pass Clerk's own message through (it never contains our key). The secret
      // key NEVER appears in the response body — sentinel-tested.
      const message =
        (Array.isArray(data?.errors) &&
          typeof data.errors[0]?.message === 'string' &&
          data.errors[0].message.length > 0 &&
          data.errors[0].message) ||
        (typeof data?.error?.message === 'string' && data.error.message.length > 0
          ? data.error.message
          : 'Clerk session verification failed.');
      return jsonResponse({ error: { code: 'CLERK_UPSTREAM_ERROR', message } }, { status: 502 });
    }

    const userId =
      typeof data.userId === 'string'
        ? data.userId
        : typeof data.user_id === 'string'
          ? data.user_id
          : null;
    return jsonResponse({ userId, valid: data.valid === true }, { status: 200 });
  };
}

// ── CLIENT: AuthContract registration ────────────────────────────────────────

/**
 * Register the Clerk provider (client side). Returns an unregister function that
 * tears down the auth capability it registered.
 *
 * - `config` omitted → read `getProviderConfig('clerk')` (global Minder config).
 * - `mock: true` (explicit or from config) → register the in-memory AuthContract
 *   mock with zero SDK and zero credentials.
 * - otherwise → create ONE Clerk instance (via `createClerkFactory` or a lazy
 *   `@clerk/clerk-js` import from the publishable key) and register the real
 *   AuthContract.
 */
export async function registerClerkProvider(
  config?: ClerkProviderConfig
): Promise<() => void> {
  let effective: ClerkProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('clerk');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<ClerkProviderConfig>;
      effective = {
        publishableKey: typeof raw.publishableKey === 'string' ? raw.publishableKey : '',
        secretKey: raw.secretKey,
        mock: fromGlobal.mock,
        createClerkFactory: raw.createClerkFactory,
      };
    }
  }

  effective = effective ?? { publishableKey: '' };

  // ── Mock mode: zero SDK, zero keys ──────────────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerClerkMocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  const factory = effective.createClerkFactory;
  let client: ClerkLikeInstance;
  if (factory) {
    client = (await factory()) as ClerkLikeInstance;
  } else {
    if (!effective.publishableKey) {
      throw new Error(
        'registerClerkProvider: "publishableKey" is required for the real Clerk provider. ' +
          'For credential-free UI development, set providers.clerk.mock = true.'
      );
    }
    client = await defaultCreateClerk(effective.publishableKey);
  }
  activeClient = client;

  const unregister = registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'auth',
    implementation: buildAuthContract(client),
    getProviderClient: () => client,
  });

  return () => {
    unregister();
    if (activeClient === client) activeClient = null;
  };
}
