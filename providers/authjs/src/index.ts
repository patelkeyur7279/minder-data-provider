/**
 * @minder/provider-authjs — the Auth.js (formerly NextAuth.js, v5) adapter. Auth.js
 * ships NO cloud API and NO client SDK object to wrap — session state lives in the
 * consuming app's own signed/encrypted cookie, read through Auth.js's own REST
 * contract (`GET {basePath}/session`, `GET {basePath}/csrf`, `POST {basePath}/signout`)
 * and its universal `auth()` function (built from the app's own `auth.ts`). This
 * adapter never imports `next-auth` / `@auth/core` — it is a ZERO-SDK client
 * (fetch-only, edge-safe) and a DI-wrapped server verifier.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerAuthjsProvider(config?)` registers an `AuthContract` so an app
 *     can call `useAuth()` from `minder-data-provider`. `getSession()` calls
 *     `GET {basePath}/session` (Auth.js's own session endpoint, cookie-authenticated)
 *     and fail-closed-validates the result (see below) before returning
 *     `{ userId, raw }` or `null`. `signOut()` fetches a CSRF token from
 *     `GET {basePath}/csrf` and POSTs it to `{basePath}/signout` — the exact
 *     two-step flow Auth.js's own client helpers perform. `mock: true` registers the
 *     in-memory mock (zero network, zero app route required).
 *
 *   SERVER (edge-safe, zero-dep — no Auth.js import at all) —
 *     `createAuthjsSessionHandler({ sessionResolver })` is a web-standard
 *     `(Request) => Response` handler. `sessionResolver` is a DI seam: YOUR app
 *     supplies a `(req) => auth()`-shaped function (bridging your own `auth.ts`,
 *     built with `next-auth`/`@auth/core`, into this handler) because that config is
 *     app-specific and cannot be imported by a library. The handler calls it, then
 *     applies the SAME fail-closed validation as the client before trusting the
 *     result, and returns only `{ userId, valid }`.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * Nothing in this module is a static or dynamic import of `next-auth` / `@auth/core`
 * — the client path is `fetch` against Auth.js's own REST contract, and the server
 * path is a caller-supplied function. This module stays importable in web/edge
 * bundles with ZERO peer install required for either surface; `next-auth` is listed
 * as an optional peerDependency purely because the CONSUMING app needs it to build
 * `auth.ts` in the first place — this adapter itself never imports it.
 *
 * ── SECURITY (P2) ─────────────────────────────────────────────────────────────
 * This provider never handles a raw Auth.js secret (`AUTH_SECRET`/`NEXTAUTH_SECRET`)
 * at all — that lives entirely inside the app's own `auth.ts`/environment, outside
 * Minder's config surface. What IS enforced here, on BOTH the client and the server
 * path, via the shared `toSession()` helper:
 *   - a session is trusted ONLY if `user.id` is a non-empty string AND `expires` is a
 *     parseable date STRICTLY in the future — anything else (missing user, missing
 *     id, missing/garbled `expires`, an already-expired session) fails CLOSED to
 *     `null` (client) / `{ userId: null, valid: false }` (server). Presence + expiry
 *     only, exactly like the other certified auth providers — no other claim is
 *     trusted from the raw payload.
 *   - `basePath` is the only client config value; it identifies a same-origin route
 *     path, never a secret, so it is registered client-safe below.
 *
 * NOTE — framework claim: the manifest declares `frameworks: ['nextjs']` only. Auth.js
 * v5's `auth()` DI shape is exercised here via Next.js Route Handlers (see
 * `./example.ts`); other `@auth/*` framework adapters (SvelteKit, Express, Qwik, …)
 * expose the same REST contract but are NOT tested in this repo, so they are not
 * claimed (P7).
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
import { registerAuthjsMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. `basePath`
// (a same-origin route path, never a secret) and `mock` are the only config values
// this provider accepts — there is no secret-shaped key at all, since Auth.js's own
// secret never passes through Minder config. Runs once, at import time.
registerClientSafeProviderKeys('authjs', ['basePath', 'mock']);

export interface AuthjsProviderConfig {
  /** Auth.js's own route base path. Defaults to `/api/auth` (the Auth.js default). */
  basePath?: string;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
  /** DI seam for tests / custom fetch wiring. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * The raw shape Auth.js's `GET {basePath}/session` returns (and the shape a
 * `sessionResolver` on the server must resolve to): `{}` when signed out, or
 * `{ user, expires }` when signed in. Only `user.id` and `expires` are relied on —
 * everything else is opaque and passed through as `raw`.
 */
export interface AuthjsRawSession {
  user?: { id?: string; email?: string; name?: string; [key: string]: unknown } | null;
  expires?: string;
  [key: string]: unknown;
}

const PROVIDER_NAME = '@minder/provider-authjs';

/** Auth.js's own default route base path (matches the framework adapters' default). */
const DEFAULT_BASE_PATH = '/api/auth';

interface ActiveAuthjsClient {
  basePath: string;
  fetchImpl: typeof fetch;
}

// The most-recently-registered real client config, returned by `getProviderClient()`.
// Null in mock mode (there is no SDK client at all — this is the closest analogue).
let activeClient: ActiveAuthjsClient | null = null;

/** Return the active `{ basePath, fetchImpl }` (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

/**
 * Fail-closed validation shared by the client and server paths (P2): a raw payload
 * is trusted ONLY if it carries a non-empty `user.id` and an `expires` that parses
 * to a date strictly in the future. Anything else — not an object, missing user,
 * missing/empty id, missing/unparseable/already-past expires — returns `null`.
 */
function toSession(raw: unknown): { userId: string; raw: unknown } | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const session = raw as AuthjsRawSession;

  const user = session.user;
  if (user == null || typeof user !== 'object' || Array.isArray(user)) return null;

  const userId = user.id;
  if (typeof userId !== 'string' || userId.length === 0) return null;

  if (typeof session.expires !== 'string') return null;
  const expiresAt = Date.parse(session.expires);
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return null;

  return { userId, raw: session };
}

function buildAuthContract(basePath: string, fetchImpl: typeof fetch): AuthContract {
  return {
    async getSession() {
      let res: Response;
      try {
        res = await fetchImpl(`${basePath}/session`, { credentials: 'same-origin' });
      } catch {
        // Network failure — fail closed, never throw from getSession().
        return null;
      }
      if (!res.ok) return null;

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return null;
      }
      return toSession(data);
    },

    async signOut() {
      // Auth.js's own signout flow: fetch a CSRF token, then POST it (Auth.js
      // rejects a signout POST without a matching CSRF token).
      let csrfToken: string | undefined;
      try {
        const csrfRes = await fetchImpl(`${basePath}/csrf`, { credentials: 'same-origin' });
        if (csrfRes.ok) {
          const csrfData = (await csrfRes.json()) as { csrfToken?: unknown };
          if (typeof csrfData.csrfToken === 'string' && csrfData.csrfToken.length > 0) {
            csrfToken = csrfData.csrfToken;
          }
        }
      } catch {
        // fall through — no csrfToken means signOut is a deliberate no-op below.
      }
      if (!csrfToken) return;

      try {
        await fetchImpl(`${basePath}/signout`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ csrfToken, json: 'true' }).toString(),
        });
      } catch {
        // Best-effort — the client-side session cookie is invalidated server-side;
        // a network failure here must not throw out of signOut().
      }
    },
  };
}

// ── SERVER: session-verify handler (edge-safe, zero-dep) ─────────────────────

export interface CreateAuthjsSessionHandlerOptions {
  /**
   * DI seam: resolve the CURRENT request's Auth.js session. Bridge your own
   * `auth()` (from your app's `auth.ts`, built with `next-auth`/`@auth/core`) into
   * this shape — e.g. in a Next.js Route Handler: `sessionResolver: () => auth()`.
   * Return `null`/`undefined` for signed-out. This library never imports your auth
   * config (it is app-specific); the handler only fail-closed-validates whatever
   * this function resolves to before trusting it.
   */
  sessionResolver: (req: Request) => Promise<AuthjsRawSession | null | undefined>;
}

/**
 * Create an edge-safe Auth.js session-verify handler. On GET it calls
 * `opts.sessionResolver(req)`, applies the SAME fail-closed presence+expiry
 * validation as the client (`toSession`), and returns `{ userId, valid }` — never
 * the raw session. A resolver throw is masked to a 502 (no resolver internals ever
 * appear in the response body or a log message beyond its own `Error#message`, and
 * this provider never holds any secret value to leak in the first place). A
 * non-GET request → 405.
 */
export function createAuthjsSessionHandler(opts: CreateAuthjsSessionHandlerOptions): MinderHandler {
  return async function authjsSessionHandler(req: Request): Promise<Response> {
    if (req.method !== 'GET') {
      return jsonResponse(
        { error: { code: 'AUTHJS_METHOD_NOT_ALLOWED', message: 'Method not allowed; use GET.' } },
        { status: 405, headers: { allow: 'GET' } }
      );
    }

    let raw: AuthjsRawSession | null | undefined;
    try {
      raw = await opts.sessionResolver(req);
    } catch (err) {
      console.error(
        '[minder:authjs] sessionResolver threw while resolving the session.',
        err instanceof Error ? err.message : String(err)
      );
      return jsonResponse(
        { error: { code: 'AUTHJS_RESOLVER_ERROR', message: 'Could not resolve the Auth.js session.' } },
        { status: 502 }
      );
    }

    const session = toSession(raw ?? null);
    return jsonResponse({ userId: session?.userId ?? null, valid: session !== null }, { status: 200 });
  };
}

// ── CLIENT: AuthContract registration ────────────────────────────────────────

/**
 * Register the Auth.js provider (client side). Returns an unregister function that
 * tears down the auth capability it registered.
 *
 * - `config` omitted → read `getProviderConfig('authjs')` (global Minder config).
 * - `mock: true` (explicit or from config) → register the in-memory AuthContract
 *   mock with zero network and zero app route required.
 * - otherwise → register the real AuthContract, calling Auth.js's own
 *   `{basePath}/session`, `{basePath}/csrf`, `{basePath}/signout` REST endpoints.
 */
export async function registerAuthjsProvider(config?: AuthjsProviderConfig): Promise<() => void> {
  let effective: AuthjsProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('authjs');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<AuthjsProviderConfig>;
      effective = {
        basePath: typeof raw.basePath === 'string' ? raw.basePath : undefined,
        mock: fromGlobal.mock,
      };
    }
  }

  effective = effective ?? {};

  // ── Mock mode: zero network, zero app route ─────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerAuthjsMocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  const basePath = effective.basePath ?? DEFAULT_BASE_PATH;
  const fetchImpl = effective.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'registerAuthjsProvider: no global "fetch" is available in this environment; ' +
        'pass { fetchImpl } explicitly.'
    );
  }

  const client: ActiveAuthjsClient = { basePath, fetchImpl };
  activeClient = client;

  const unregister = registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'auth',
    implementation: buildAuthContract(basePath, fetchImpl),
    getProviderClient: () => client,
  });

  return () => {
    unregister();
    if (activeClient === client) activeClient = null;
  };
}
