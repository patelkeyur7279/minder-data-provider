/**
 * @minder/provider-cognito — the Amazon Cognito adapter. One stable hook —
 * `useAuth()` — over AWS Amplify's Cognito auth module, so an app switches auth
 * providers (Cognito <-> Auth0 <-> Clerk <-> Supabase <-> Firebase) by config,
 * not by rewriting integration code. Design deliberately mirrors
 * `providers/auth0` (see `.claude/notes/research.md`, "Cognito (aws-amplify) —
 * vetted 2026-07-21"):
 *
 *   - the CLIENT lazy-SDK-import pattern from `providers/auth0` /
 *     `providers/clerk` (`aws-amplify` reached only via a non-literal dynamic
 *     `import()`, with a DI factory seam for tests/custom wiring) — the modern
 *     Amplify v6 functional API (`fetchAuthSession`, `getCurrentUser`,
 *     `signOut` from `aws-amplify/auth`, configured via `Amplify.configure()`
 *     from `aws-amplify`) rather than the older, credential-heavy, server-ish
 *     `@aws-sdk/client-cognito-identity-provider`.
 *   - the SERVER fetch-to-upstream-verify pattern from `providers/auth0` (call
 *     the provider's own verify endpoint over `fetch`, map its response, mask
 *     network failures) — Cognito's OAuth2 `GET
 *     https://{userPoolDomain}/oauth2/userInfo` endpoint (verified via web
 *     search 2026-07-21) plays the same role as Auth0's `/userinfo`: it is
 *     directly callable by this library with the caller's bearer token, no
 *     app-specific bridging required, no crypto library shipped.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerCognitoProvider(config?)` registers an `AuthContract` so
 *     an app can call `useAuth()` from `minder-data-provider`. `getSession()`
 *     calls `client.fetchAuthSession()`; if no ID token is present (signed
 *     out / guest identity), returns `null`. Otherwise it reads the decoded
 *     `tokens.idToken.payload` and applies the SAME fail-closed
 *     presence+expiry validation as every other certified auth provider
 *     before trusting it. `signOut()` calls `client.signOut(...)`.
 *     `mock: true` registers the in-memory mock (zero SDK, zero pool, zero
 *     network). `getProviderClient()` returns the raw wrapped
 *     `{ fetchAuthSession, getCurrentUser, signOut }` surface (or `null` in
 *     mock mode) — same escape-hatch shape as auth0/clerk.
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT the Amplify SDK) —
 *     `createCognitoSessionHandler({ userPoolDomain })` is a web-standard
 *     `(Request) => Response` handler that verifies a Cognito access token
 *     server-side by calling the user pool's own OAuth2 `GET
 *     https://{userPoolDomain}/oauth2/userInfo` endpoint with the incoming
 *     `Authorization: Bearer <token>` header forwarded as-is, returning
 *     `{ userId, valid }`.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handler speaks to Cognito over `fetch`, so this module has NO
 * static SDK dependency and stays importable in web/edge bundles. `aws-amplify`
 * is an OPTIONAL peer, reached ONLY via a dynamic `import()` (non-literal
 * specifier) inside `registerCognitoProvider` — or supplied through the
 * `createCognitoFactory` DI seam. It never appears as a static import, so the
 * SDK is never bundled for consumers who don't use it (mock mode, or
 * server-only session verification).
 *
 * NOTE — honest framework claim: `frameworks: ['react','nextjs','vite']` only,
 * mirroring Auth0/Clerk — the Amplify auth module is usable from any of those,
 * but React Native is NOT claimed (untested here, P7); Amplify does ship an RN
 * variant, but validating it is out of scope for this v1 adapter.
 *
 * ── SECURITY (P2) ─────────────────────────────────────────────────────────────
 * `userPoolId` and `userPoolClientId` are public identifiers — like Auth0's
 * `domain`/`clientId` — registered client-safe below. The Cognito App Client
 * used with this adapter MUST be a "public client" (no client secret
 * generated): a client secret cannot be kept safe in a browser bundle, and
 * Amplify's browser SDK path does not support one. There is no secret value
 * anywhere in this provider's config surface.
 *
 * Fail-closed validation (client): a raw decoded ID-token-payload is trusted
 * ONLY if `payload.sub` is a non-empty string AND `payload.exp` (numeric,
 * seconds) is strictly in the future — anything else fails closed to `null`.
 *
 * Known trade-off / prerequisite (P7-honest, documented in README): the
 * server-side `/oauth2/userInfo` endpoint requires (a) a Hosted UI domain
 * configured for the user pool, and (b) an access token obtained via the
 * Hosted UI / OAuth2 authorization-code flow (i.e. Amplify's
 * `signInWithRedirect()`) — access tokens from a direct username/password
 * `InitiateAuth`-style sign-in carry no OAuth scopes and are rejected by this
 * endpoint. No code changes implied here; documented as a setup prerequisite.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package imports these from `minder-data-provider` subpaths
 * instead; the runtime shapes are identical.
 */
import type { AuthContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { MinderHandler } from '../../../src/server/handlers.js';
import { jsonResponse } from '../../../src/server/handlers.js';
import { registerCognitoMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. Cognito
// public-client identifiers have no secret at all, so every config value this
// provider reads is client-safe. Runs once, at import time.
registerClientSafeProviderKeys('cognito', ['userPoolId', 'userPoolClientId', 'region', 'mock']);

export interface CognitoProviderConfig {
  /** Your Cognito user pool id (e.g. `us-east-1_AbCdEfGhI`) — clientSafe, public. */
  userPoolId?: string;
  /**
   * Your Cognito App Client id. MUST be a "public client" — one with no
   * client secret generated — clientSafe, public.
   */
  userPoolClientId?: string;
  /** Optional AWS region override; Amplify infers it from `userPoolId` when omitted. */
  region?: string;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
  /** Optional params forwarded to `signOut({ global })` (Amplify's "sign out everywhere" flag). */
  signOutOptions?: { global?: boolean };
  /**
   * DI seam for tests / custom SDK wiring. Returns a `CognitoLikeClient`-shaped
   * object. Defaults to lazily importing `aws-amplify` (for `Amplify.configure`)
   * and `aws-amplify/auth` (for `fetchAuthSession`/`getCurrentUser`/`signOut`).
   */
  createCognitoFactory?: () => unknown;
}

/** The shape of a decoded Cognito ID/access token payload this adapter reads. */
export interface CognitoIdTokenClaims {
  /** The Cognito user id — the only claim this adapter relies on for identity. */
  sub?: string;
  /** Expiry, numeric UNIX seconds. */
  exp?: number;
  [key: string]: unknown;
}

/** A decoded-token-like value: Amplify wraps ID/access tokens with a `payload` getter. */
interface CognitoTokenLike {
  payload: CognitoIdTokenClaims;
}

/** The subset of Amplify v6's Auth session shape this adapter reads. */
interface CognitoAuthSession {
  tokens?: {
    idToken?: CognitoTokenLike;
    accessToken?: CognitoTokenLike;
  };
}

/** The subset of `aws-amplify`'s functional Auth surface this adapter uses. */
interface CognitoLikeClient {
  fetchAuthSession(options?: { forceRefresh?: boolean }): Promise<CognitoAuthSession>;
  getCurrentUser(): Promise<{ userId: string; username: string }>;
  signOut(options?: { global?: boolean }): Promise<void>;
}

const PROVIDER_NAME = '@minder/provider-cognito';

/** The optional-peer SDK specifiers, kept in variables so they are resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const COGNITO_CORE_SDK = 'aws-amplify';
const COGNITO_AUTH_SDK = 'aws-amplify/auth';

const SDK_MISSING_MESSAGE = 'Install aws-amplify (optional peer): npm i aws-amplify';

// The most-recently-created real Cognito client wrapper, returned by
// `getProviderClient()`. Null in mock mode (there is no raw SDK client to hand back).
let activeClient: CognitoLikeClient | null = null;

/** Return the raw underlying { fetchAuthSession, getCurrentUser, signOut } wrapper
 *  (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Default factory: lazily import `aws-amplify` + `aws-amplify/auth`, configure
 *  Amplify with the given user pool, and wrap the functional Auth API into a
 *  `CognitoLikeClient`. Throws the helpful install message if the peer is absent. */
async function defaultCreateCognito(config: {
  userPoolId: string;
  userPoolClientId: string;
}): Promise<CognitoLikeClient> {
  let core: { Amplify?: { configure: (cfg: unknown) => void } } | undefined;
  let auth:
    | {
        fetchAuthSession?: unknown;
        getCurrentUser?: unknown;
        signOut?: unknown;
      }
    | undefined;
  try {
    core = (await import(COGNITO_CORE_SDK)) as typeof core;
    auth = (await import(COGNITO_AUTH_SDK)) as typeof auth;
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  if (
    !core?.Amplify ||
    typeof auth?.fetchAuthSession !== 'function' ||
    typeof auth?.getCurrentUser !== 'function' ||
    typeof auth?.signOut !== 'function'
  ) {
    throw new Error(SDK_MISSING_MESSAGE);
  }

  core.Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
      },
    },
  });

  return {
    fetchAuthSession: auth.fetchAuthSession as CognitoLikeClient['fetchAuthSession'],
    getCurrentUser: auth.getCurrentUser as CognitoLikeClient['getCurrentUser'],
    signOut: auth.signOut as CognitoLikeClient['signOut'],
  };
}

/**
 * Fail-closed validation (P2): a raw decoded token payload is trusted ONLY if
 * it carries a non-empty `sub` and a numeric `exp` (UNIX seconds) strictly in
 * the future. Anything else — not an object, missing/empty `sub`,
 * missing/non-numeric/already-past `exp` — returns `null`.
 */
function toSession(payload: unknown): { userId: string; raw: unknown } | null {
  if (!isPlainObject(payload)) return null;
  const c = payload as CognitoIdTokenClaims;

  if (typeof c.sub !== 'string' || c.sub.length === 0) return null;
  if (typeof c.exp !== 'number' || !Number.isFinite(c.exp)) return null;
  if (c.exp * 1000 <= Date.now()) return null;

  return { userId: c.sub, raw: c };
}

function buildAuthContract(client: CognitoLikeClient, signOutOptions?: { global?: boolean }): AuthContract {
  return {
    async getSession() {
      let session: CognitoAuthSession;
      try {
        session = await client.fetchAuthSession();
      } catch {
        // A thrown session fetch (e.g. no credentials configured yet) is
        // treated as signed-out, never surfaced as an error to the UI.
        return null;
      }

      const idToken = session?.tokens?.idToken;
      if (!idToken) return null;

      return toSession(idToken.payload);
    },
    async signOut() {
      await client.signOut(signOutOptions ? { global: signOutOptions.global } : undefined);
    },
  };
}

// ── SERVER: session-verify handler (edge-safe, zero-dep) ─────────────────────

export interface CreateCognitoSessionHandlerOptions {
  /**
   * Your user pool's Hosted UI domain, no protocol, e.g.
   * `your-app.auth.us-east-1.amazoncognito.com` (custom domains work too:
   * `login.yourapp.com`). Public, not a secret. Must be configured in the
   * Cognito console (App integration -> Domain) before this handler can work —
   * see README "Setup" for the prerequisite.
   */
  userPoolDomain: string;
}

/**
 * Create an edge-safe Cognito session-verify handler. On GET it reads
 * `Authorization: Bearer <token>` from the incoming request (400 if
 * missing/malformed), then calls the user pool's own OAuth2 `GET
 * https://{userPoolDomain}/oauth2/userInfo` endpoint with that same header
 * forwarded. A 200 upstream response means the token is valid: its `sub`
 * claim maps to `{ userId: sub, valid: true }`. A non-200 upstream response
 * (401/403/etc., or a malformed/incomplete body) maps to
 * `{ userId: null, valid: false }` — the upstream body is never thrown
 * through raw. A network failure maps to a masked 502
 * (`COGNITO_UPSTREAM_ERROR`), the same pattern as Auth0's
 * `AUTH0_UPSTREAM_ERROR`. A non-GET request -> 405.
 *
 * PREREQUISITE: the `/oauth2/userInfo` endpoint only accepts access tokens
 * obtained via the Hosted UI / OAuth2 authorization-code flow (they carry
 * OAuth scopes); access tokens from a direct username/password `InitiateAuth`
 * sign-in are rejected upstream (mapped here to the same
 * `{ userId: null, valid: false }` non-200 path — never a crash).
 */
export function createCognitoSessionHandler(opts: CreateCognitoSessionHandlerOptions): MinderHandler {
  return async function cognitoSessionHandler(req: Request): Promise<Response> {
    // 0) Only GET is allowed.
    if (req.method !== 'GET') {
      return jsonResponse(
        { error: { code: 'COGNITO_METHOD_NOT_ALLOWED', message: 'Method not allowed; use GET.' } },
        { status: 405, headers: { allow: 'GET' } }
      );
    }

    // 1) Read + validate the Authorization header FIRST — malformed requests
    // never reach Cognito.
    const authHeader = req.headers.get('authorization');
    if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) {
      return jsonResponse(
        {
          error: {
            code: 'COGNITO_BAD_REQUEST',
            message: 'Request must include a valid "Authorization: Bearer <token>" header.',
          },
        },
        { status: 400 }
      );
    }

    // 2) Call the user pool's own OAuth2 /oauth2/userInfo endpoint over fetch
    // (no SDK), forwarding the SAME Authorization header the caller sent.
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`https://${opts.userPoolDomain}/oauth2/userInfo`, {
        headers: { authorization: authHeader },
      });
    } catch {
      // Network / transport failure — masked 502, never the upstream body.
      return jsonResponse(
        { error: { code: 'COGNITO_UPSTREAM_ERROR', message: 'Failed to reach Cognito.' } },
        { status: 502 }
      );
    }

    // Non-200 (401/403/etc. — including scopeless access tokens from
    // InitiateAuth-style sign-in) means the token is invalid — never throw the
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
 * Register the Cognito provider (client side). Returns an unregister function
 * that tears down the auth capability it registered.
 *
 * - `config` omitted -> read `getProviderConfig('cognito')` (global Minder config).
 * - `mock: true` (explicit or from config) -> register the in-memory
 *   AuthContract mock with zero SDK and zero pool.
 * - otherwise -> create ONE Cognito client wrapper (via `createCognitoFactory`
 *   or a lazy `aws-amplify`/`aws-amplify/auth` import from
 *   `userPoolId`/`userPoolClientId`) and register the real AuthContract.
 */
export async function registerCognitoProvider(config?: CognitoProviderConfig): Promise<() => void> {
  let effective: CognitoProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('cognito');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<CognitoProviderConfig>;
      effective = {
        userPoolId: typeof raw.userPoolId === 'string' ? raw.userPoolId : undefined,
        userPoolClientId: typeof raw.userPoolClientId === 'string' ? raw.userPoolClientId : undefined,
        region: typeof raw.region === 'string' ? raw.region : undefined,
        mock: fromGlobal.mock,
        signOutOptions: isPlainObject(raw.signOutOptions)
          ? (raw.signOutOptions as { global?: boolean })
          : undefined,
        createCognitoFactory: raw.createCognitoFactory,
      };
    }
  }

  effective = effective ?? { userPoolId: '', userPoolClientId: '' };

  // ── Mock mode: zero SDK, zero pool ──────────────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerCognitoMocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  const factory = effective.createCognitoFactory;
  let client: CognitoLikeClient;
  if (factory) {
    client = (await factory()) as CognitoLikeClient;
  } else {
    if (!effective.userPoolId || !effective.userPoolClientId) {
      throw new Error(
        'registerCognitoProvider: "userPoolId" and "userPoolClientId" are required for the real ' +
          'Cognito provider. For credential-free UI development, set providers.cognito.mock = true.'
      );
    }
    client = await defaultCreateCognito({
      userPoolId: effective.userPoolId,
      userPoolClientId: effective.userPoolClientId,
    });
  }
  activeClient = client;

  const unregister = registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'auth',
    implementation: buildAuthContract(client, effective.signOutOptions),
    getProviderClient: () => client,
  });

  return () => {
    unregister();
    if (activeClient === client) activeClient = null;
  };
}
