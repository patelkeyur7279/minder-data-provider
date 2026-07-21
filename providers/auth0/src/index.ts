/**
 * @minder/provider-auth0 — the Auth0 adapter. One stable hook — `useAuth()` — over
 * Auth0's own SPA client, so an app switches auth providers (Auth0 ↔ Clerk ↔
 * Supabase ↔ Firebase) by config, not by rewriting integration code. Design
 * deliberately borrows from TWO different existing providers (see
 * `.claude/notes/research.md`, "Auth0 (@auth0/auth0-spa-js) — vetted 2026-07-21"):
 *
 *   - the CLIENT lazy-SDK-import pattern from `providers/clerk` (`@clerk/clerk-js`
 *     reached only via a non-literal dynamic `import()`, with a DI factory seam
 *     for tests/custom wiring) — NOT authjs's zero-SDK REST pattern, because Auth0
 *     does have a real SPA client SDK worth wrapping.
 *   - the SERVER fetch-to-upstream-verify pattern from `providers/clerk` (call the
 *     provider's own verify endpoint over `fetch`, map its response, mask network
 *     failures) — NOT authjs's caller-supplied DI seam, because Auth0 exposes a
 *     public OIDC `GET https://{domain}/userinfo` endpoint that is directly
 *     callable by this library; no app-specific bridging is required the way
 *     Auth.js's own session (living inside the app's cookie/config) needs one.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerAuth0Provider(config?)` registers an `AuthContract` so an
 *     app can call `useAuth()` from `minder-data-provider`. `getSession()` calls
 *     `client.isAuthenticated()`; if not authenticated, returns `null`. Otherwise
 *     it calls `client.getIdTokenClaims()` and applies the SAME fail-closed
 *     presence+expiry validation as every other certified auth provider before
 *     trusting it. `signOut()` calls `client.logout(...)`, letting Auth0's SDK
 *     perform its own default redirect UX — this adapter never fights it.
 *     `mock: true` registers the in-memory mock (zero SDK, zero keys, zero
 *     network). `getProviderClient()` returns the raw `Auth0Client` instance (or
 *     `null` in mock mode) — same escape-hatch shape as clerk/authjs.
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT any Auth0 SDK) —
 *     `createAuth0SessionHandler({ domain })` is a web-standard
 *     `(Request) => Response` handler that verifies an Auth0 access token
 *     server-side by calling Auth0's own public `GET {domain}/userinfo` endpoint
 *     with the incoming `Authorization: Bearer <token>` header forwarded as-is,
 *     returning `{ userId, valid }`.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handler speaks to Auth0 over `fetch`, so this module has NO static
 * SDK dependency and stays importable in web/edge bundles. `@auth0/auth0-spa-js`
 * is an OPTIONAL peer, reached ONLY via a dynamic `import()` (non-literal
 * specifier) inside `registerAuth0Provider` — or supplied through the
 * `createAuth0Factory` DI seam. It never appears as a static import, so the SDK
 * is never bundled for consumers who don't use it (mock mode, or server-only
 * session verification).
 *
 * NOTE — honest framework claim: `frameworks: ['react','nextjs','vite']` only,
 * mirroring Clerk — the SPA client is usable from any of those, but React Native
 * is NOT claimed (untested here, P7).
 *
 * ── SECURITY (P2) ─────────────────────────────────────────────────────────────
 * `domain` is a public Auth0 tenant identifier — like Clerk's `publishableKey` —
 * registered client-safe below. There is NO secret value anywhere in this
 * provider's config surface at all: Auth0 SPA/PKCE clients have no client secret,
 * and server-side verification calls Auth0's own public `/userinfo` endpoint with
 * the caller-supplied bearer token, never a Minder-held credential.
 *
 * Fail-closed validation (client): a raw `getIdTokenClaims()` result is trusted
 * ONLY if `claims.sub` is a non-empty string AND `claims.exp` (numeric, seconds)
 * is strictly in the future — anything else fails closed to `null`.
 *
 * Known trade-off (P7-honest, documented in README): calling `/userinfo` on every
 * server-side verify is Auth0's own recommended pattern for low/medium traffic; a
 * high-traffic resource server should prefer local JWKS verification — out of
 * scope for v1, no code changes implied here.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative paths so
 * the adapter and its tests run against source without a build step. The published
 * package imports these from `minder-data-provider` subpaths instead; the runtime
 * shapes are identical.
 */
import type { AuthContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { MinderHandler } from '../../../src/server/handlers.js';
import { jsonResponse } from '../../../src/server/handlers.js';
import { registerAuth0Mocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. Auth0
// SPA/PKCE clients have no secret at all, so every config value this provider
// reads is client-safe. Runs once, at import time.
registerClientSafeProviderKeys('auth0', ['domain', 'clientId', 'audience', 'redirectUri', 'mock']);

export interface Auth0ProviderConfig {
  /** Your Auth0 tenant domain (e.g. `your-tenant.us.auth0.com`) — clientSafe, public. */
  domain?: string;
  /** Your Auth0 application's client id — clientSafe, public. */
  clientId?: string;
  /** Optional API audience (identifies the API this app requests access to). */
  audience?: string;
  /** Optional redirect URI for the Auth0 login/logout flow. */
  redirectUri?: string;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
  /**
   * Optional params forwarded to `client.logout({ logoutParams })`. Omit to let
   * the SDK use its own defaults (its own post-logout redirect UX).
   */
  logoutParams?: Record<string, unknown>;
  /**
   * DI seam for tests / custom SDK wiring. Returns an `Auth0Client`-shaped
   * object (from `@auth0/auth0-spa-js`'s `createAuth0Client`). Defaults to
   * lazily importing `@auth0/auth0-spa-js` and calling `createAuth0Client`.
   */
  createAuth0Factory?: () => unknown;
}

/** The shape `getIdTokenClaims()` resolves to (OIDC ID token claims). */
export interface Auth0IdTokenClaims {
  /** The Auth0 user id — the only claim this adapter relies on for identity. */
  sub?: string;
  /** Expiry, numeric UNIX seconds. */
  exp?: number;
  [key: string]: unknown;
}

/** The subset of `@auth0/auth0-spa-js`'s `Auth0Client` surface this adapter uses. */
interface Auth0LikeClient {
  isAuthenticated(): Promise<boolean>;
  getIdTokenClaims(): Promise<Auth0IdTokenClaims | undefined>;
  logout(options?: { logoutParams?: Record<string, unknown> }): Promise<void>;
}

const PROVIDER_NAME = '@minder/provider-auth0';

/** The optional-peer SDK specifier, kept in a variable so it is resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const AUTH0_SDK = '@auth0/auth0-spa-js';

const SDK_MISSING_MESSAGE = 'Install @auth0/auth0-spa-js (optional peer): npm i @auth0/auth0-spa-js';

// The most-recently-created real Auth0Client instance, returned by
// `getProviderClient()`. Null in mock mode (there is no raw SDK client to hand back).
let activeClient: Auth0LikeClient | null = null;

/** Return the raw underlying Auth0Client instance (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Default factory: lazily import the SDK and call `createAuth0Client`. Throws
 *  the helpful install message if the peer is absent. */
async function defaultCreateAuth0(config: {
  domain: string;
  clientId: string;
  audience?: string;
  redirectUri?: string;
}): Promise<Auth0LikeClient> {
  let mod: { createAuth0Client?: unknown } | undefined;
  try {
    mod = (await import(AUTH0_SDK)) as { createAuth0Client?: unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const createAuth0Client = mod?.createAuth0Client;
  if (typeof createAuth0Client !== 'function') {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const client = (await (createAuth0Client as (opts: unknown) => Promise<unknown>)({
    domain: config.domain,
    clientId: config.clientId,
    authorizationParams: {
      redirect_uri: config.redirectUri,
      audience: config.audience,
    },
  })) as Auth0LikeClient;
  return client;
}

/**
 * Fail-closed validation (P2): a raw ID-token-claims payload is trusted ONLY if
 * it carries a non-empty `sub` and a numeric `exp` (UNIX seconds) strictly in
 * the future. Anything else — not an object, missing/empty `sub`,
 * missing/non-numeric/already-past `exp` — returns `null`.
 */
function toSession(claims: unknown): { userId: string; raw: unknown } | null {
  if (!isPlainObject(claims)) return null;
  const c = claims as Auth0IdTokenClaims;

  if (typeof c.sub !== 'string' || c.sub.length === 0) return null;
  if (typeof c.exp !== 'number' || !Number.isFinite(c.exp)) return null;
  if (c.exp * 1000 <= Date.now()) return null;

  return { userId: c.sub, raw: c };
}

function buildAuthContract(client: Auth0LikeClient, logoutParams?: Record<string, unknown>): AuthContract {
  return {
    async getSession() {
      const authenticated = await client.isAuthenticated();
      if (!authenticated) return null;

      const claims = await client.getIdTokenClaims();
      return toSession(claims ?? null);
    },
    async signOut() {
      // Don't fight the SDK's own default redirect behavior — that's the real-app
      // UX. Mock mode / DI-factory tests must never trigger a real navigation
      // (a fake client's `logout()` just resolves).
      await client.logout(logoutParams ? { logoutParams } : undefined);
    },
  };
}

// ── SERVER: session-verify handler (edge-safe, zero-dep) ─────────────────────

export interface CreateAuth0SessionHandlerOptions {
  /** Your Auth0 tenant domain (e.g. `your-tenant.us.auth0.com`) — public, not a secret. */
  domain: string;
}

/**
 * Create an edge-safe Auth0 session-verify handler. On GET it reads
 * `Authorization: Bearer <token>` from the incoming request (400 if
 * missing/malformed), then calls Auth0's own public
 * `GET https://{domain}/userinfo` endpoint with that same header forwarded.
 * A 200 upstream response means the token is valid: its `sub` claim maps to
 * `{ userId: sub, valid: true }`. A non-200 upstream response (401/403/etc.,
 * or a malformed/incomplete body) maps to `{ userId: null, valid: false }` —
 * the upstream body is never thrown through raw. A network failure maps to a
 * masked 502 (`AUTH0_UPSTREAM_ERROR`), the same pattern as Clerk's
 * `CLERK_UPSTREAM_ERROR`. A non-GET request → 405.
 */
export function createAuth0SessionHandler(opts: CreateAuth0SessionHandlerOptions): MinderHandler {
  return async function auth0SessionHandler(req: Request): Promise<Response> {
    // 0) Only GET is allowed.
    if (req.method !== 'GET') {
      return jsonResponse(
        { error: { code: 'AUTH0_METHOD_NOT_ALLOWED', message: 'Method not allowed; use GET.' } },
        { status: 405, headers: { allow: 'GET' } }
      );
    }

    // 1) Read + validate the Authorization header FIRST — malformed requests
    // never reach Auth0.
    const authHeader = req.headers.get('authorization');
    if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) {
      return jsonResponse(
        {
          error: {
            code: 'AUTH0_BAD_REQUEST',
            message: 'Request must include a valid "Authorization: Bearer <token>" header.',
          },
        },
        { status: 400 }
      );
    }

    // 2) Call Auth0's own public /userinfo endpoint over fetch (no SDK),
    // forwarding the SAME Authorization header the caller sent.
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`https://${opts.domain}/userinfo`, {
        headers: { authorization: authHeader },
      });
    } catch {
      // Network / transport failure — masked 502, never the upstream body.
      return jsonResponse(
        { error: { code: 'AUTH0_UPSTREAM_ERROR', message: 'Failed to reach Auth0.' } },
        { status: 502 }
      );
    }

    // Non-200 (401/403/etc.) means the token is invalid — never throw the
    // upstream body through raw; just report signed-out.
    if (!upstreamRes.ok) {
      return jsonResponse({ userId: null, valid: false }, { status: 200 });
    }

    let data: unknown;
    try {
      data = await upstreamRes.json();
    } catch {
      return jsonResponse({ userId: null, valid: false }, { status: 200 });
    }

    const sub = isPlainObject(data) ? data.sub : undefined;
    if (typeof sub !== 'string' || sub.length === 0) {
      return jsonResponse({ userId: null, valid: false }, { status: 200 });
    }

    return jsonResponse({ userId: sub, valid: true }, { status: 200 });
  };
}

// ── CLIENT: AuthContract registration ────────────────────────────────────────

/**
 * Register the Auth0 provider (client side). Returns an unregister function that
 * tears down the auth capability it registered.
 *
 * - `config` omitted → read `getProviderConfig('auth0')` (global Minder config).
 * - `mock: true` (explicit or from config) → register the in-memory AuthContract
 *   mock with zero SDK and zero keys.
 * - otherwise → create ONE Auth0Client instance (via `createAuth0Factory` or a
 *   lazy `@auth0/auth0-spa-js` import from `domain`/`clientId`) and register the
 *   real AuthContract.
 */
export async function registerAuth0Provider(config?: Auth0ProviderConfig): Promise<() => void> {
  let effective: Auth0ProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('auth0');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<Auth0ProviderConfig>;
      effective = {
        domain: typeof raw.domain === 'string' ? raw.domain : undefined,
        clientId: typeof raw.clientId === 'string' ? raw.clientId : undefined,
        audience: typeof raw.audience === 'string' ? raw.audience : undefined,
        redirectUri: typeof raw.redirectUri === 'string' ? raw.redirectUri : undefined,
        mock: fromGlobal.mock,
        logoutParams: isPlainObject(raw.logoutParams) ? raw.logoutParams : undefined,
        createAuth0Factory: raw.createAuth0Factory,
      };
    }
  }

  effective = effective ?? { domain: '', clientId: '' };

  // ── Mock mode: zero SDK, zero keys ──────────────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerAuth0Mocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  const factory = effective.createAuth0Factory;
  let client: Auth0LikeClient;
  if (factory) {
    client = (await factory()) as Auth0LikeClient;
  } else {
    if (!effective.domain || !effective.clientId) {
      throw new Error(
        'registerAuth0Provider: "domain" and "clientId" are required for the real Auth0 provider. ' +
          'For credential-free UI development, set providers.auth0.mock = true.'
      );
    }
    client = await defaultCreateAuth0({
      domain: effective.domain,
      clientId: effective.clientId,
      audience: effective.audience,
      redirectUri: effective.redirectUri,
    });
  }
  activeClient = client;

  const unregister = registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'auth',
    implementation: buildAuthContract(client, effective.logoutParams),
    getProviderClient: () => client,
  });

  return () => {
    unregister();
    if (activeClient === client) activeClient = null;
  };
}
