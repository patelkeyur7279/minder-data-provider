/**
 * @minder/provider-razorpay — the Razorpay payments adapter. Mirrors the Stripe
 * provider's server-boundary shape: an order is created on the SERVER with the
 * key secret (HTTP Basic auth), which never travels anywhere near the browser —
 * only the intentionally-public `keyId` is returned so the client Razorpay
 * Checkout widget can open against the order.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerRazorpayProvider(config?)` registers a `PaymentsContract`
 *     (so an app can call `useCheckout().createCheckout(...)` from
 *     `minder-data-provider`). Its `createCheckout` POSTs the order details to the
 *     app's scaffolded server route (`DEFAULT_ORDER_PATH`,
 *     `/api/minder/razorpay/order`) and returns `{ url }` — an order reference
 *     (`razorpay://order/<id>`) built from the server's response. `mock: true`
 *     registers the in-memory mock (zero network, zero keys).
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT the `razorpay` SDK) —
 *     `createOrderHandler(...)` and `createRazorpayWebhookHandler(...)` are
 *     web-standard `(Request) => Response` handlers the scaffolded routes mount.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handlers speak to Razorpay over `fetch` against
 * `https://api.razorpay.com/v1/orders` (JSON, HTTP Basic auth), so this module
 * has NO static SDK dependency and stays importable in web/edge bundles. The
 * `razorpay` npm package is an OPTIONAL peer, reached ONLY via a dynamic
 * `import()` inside `getProviderClient()` (non-literal specifier) — never a static
 * import, never bundled for consumers who don't use it.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `keyId` is Razorpay's intentionally-public key id (the browser widget needs it)
 * — registered client-safe below. `keySecret` and `webhookSecret` are real
 * secrets: they are `serverOnly` in the manifest, typed as `CredentialInput`
 * (never a raw string in client config), resolved per-request via
 * `resolveCredential` INSIDE the server handlers only, and never echoed by any
 * thrown error, response body, or log. A Razorpay upstream error's own
 * `description` is passed through, but the key secret is NEVER included.
 *
 * ── WEBHOOK NOTE ─────────────────────────────────────────────────────────────
 * Razorpay signs webhooks as a bare hex HMAC-SHA256 over the RAW body, carried in
 * `x-razorpay-signature` with NO timestamp — the simplest webhook case. So this
 * adapter needs NO signature-header parser and sets `timestampToleranceSec: 0`.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package imports these from `minder-data-provider` subpaths
 * instead; the runtime shapes are identical.
 */
import type { PaymentsContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { CredentialInput } from '../../../src/security/credentials.js';
import { resolveCredential } from '../../../src/security/credentials.js';
import type { MinderHandler } from '../../../src/server/handlers.js';
import { jsonResponse } from '../../../src/server/handlers.js';
import { createWebhookHandler } from '../../../src/server/webhooks.js';
import { MinderError } from '../../../src/errors/MinderError.js';
import { registerRazorpayMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Razorpay as a certified provider: `keyId` (public by
// design) and `mock` are exempt, while any other credential-shaped key (e.g. a raw
// `keySecret`) hard-fails in a browser-like environment. Runs once, at import time.
registerClientSafeProviderKeys('razorpay', ['keyId', 'mock']);

export interface RazorpayProviderConfig {
  /** The key id (`rzp_test_...` / `rzp_live_...`) — clientSafe, intentionally PUBLIC. */
  keyId?: string;
  /** Key secret — serverOnly; used only by the server handlers. */
  keySecret?: CredentialInput;
  /** Webhook signing secret — serverOnly. */
  webhookSecret?: CredentialInput;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
}

const PROVIDER_NAME = '@minder/provider-razorpay';

/** The default path the scaffolded order route is mounted at (client POSTs here). */
export const DEFAULT_ORDER_PATH = '/api/minder/razorpay/order';

/** Razorpay's REST endpoint for creating an order. */
const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

/** The optional-peer SDK specifier, kept in a variable so it is resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const RAZORPAY_SDK = 'razorpay';

const SDK_MISSING_MESSAGE = 'Install razorpay (optional peer): npm i razorpay';

// The most-recently-configured server-side credentials, used only by the
// `getProviderClient()` escape hatch (server-only). Never read on the client.
let activeKeyId: string | undefined;
let activeKeySecret: CredentialInput | undefined;
let activeServerConfig: Record<string, unknown> | undefined;

/**
 * Base64-encode `input`, edge-safe: `btoa` exists in browsers, edge runtimes,
 * Deno, Bun, and Node >= 16. `keyId:secret` is ASCII, so there are no UTF-8
 * surrogate concerns. Falls back to `Buffer` only where `btoa` is absent.
 */
function toBase64(input: string): string {
  if (typeof btoa === 'function') return btoa(input);
  return Buffer.from(input, 'utf8').toString('base64');
}

/** Lazily import the optional `razorpay` SDK, throwing the helpful install message
 *  if it is absent. Returns the module's Razorpay constructor. */
async function loadRazorpaySdk(): Promise<new (opts: { key_id: string; key_secret: string }) => unknown> {
  let mod: { default?: unknown } | undefined;
  try {
    mod = (await import(RAZORPAY_SDK)) as { default?: unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const ctor = mod?.default ?? mod;
  if (typeof ctor !== 'function') {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  return ctor as new (opts: { key_id: string; key_secret: string }) => unknown;
}

/**
 * Escape hatch: return a raw `razorpay` SDK client, constructed with the public
 * `keyId` and the RESOLVED key secret. SERVER-ONLY — throws immediately in the
 * browser (it would otherwise require the key secret client-side). Throws the
 * optional-peer install message if `razorpay` is not installed. Async because
 * both the credential and the SDK are resolved on demand.
 */
export async function getProviderClient(): Promise<unknown> {
  if (typeof window !== 'undefined') {
    throw new Error(
      '[Minder] Razorpay getProviderClient() must only be called on the server ' +
        '(it constructs the SDK with the key secret).'
    );
  }
  if (!activeKeySecret) {
    throw new Error(
      '[Minder] Razorpay getProviderClient(): no keySecret configured. Pass keySecret to ' +
        'registerRazorpayProvider (or use the server handlers) before reaching for the SDK.'
    );
  }
  const resolved = await resolveCredential(activeKeySecret, activeServerConfig);
  if (typeof resolved !== 'string') {
    throw new Error('[Minder] Razorpay key secret resolved to a non-string value.');
  }
  const Razorpay = await loadRazorpaySdk();
  return new Razorpay({ key_id: activeKeyId ?? '', key_secret: resolved });
}

// ── SERVER: create-order handler (edge-safe, zero-dep) ───────────────────────

interface ParsedOrder {
  amount: number;
  currency: string;
  receipt?: string;
}

/**
 * Validate + normalize the incoming order request body. Returns `null` for any
 * malformed shape (→ 400). Expected: `{ amount, currency?, receipt? }` where
 * `amount` is a positive integer in the smallest currency subunit (e.g. paise).
 * `currency` defaults to `INR`.
 */
function parseOrderBody(body: unknown): ParsedOrder | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.amount !== 'number' || !Number.isInteger(b.amount) || b.amount <= 0) return null;

  const currency =
    typeof b.currency === 'string' && b.currency.length > 0 ? b.currency : 'INR';
  const receipt = typeof b.receipt === 'string' && b.receipt.length > 0 ? b.receipt : undefined;

  return { amount: b.amount, currency, receipt };
}

/**
 * Create an edge-safe order handler. On POST it validates the request body
 * (non-POST → 405, malformed → 400), resolves `keySecret` server-side, and calls
 * Razorpay's REST API with `Authorization: Basic base64(keyId:secret)`. Returns
 * `{ id, amount, currency, keyId }` — `keyId` is public and returned so the client
 * Checkout widget can use it. Any upstream failure is mapped to a MASKED 502:
 * Razorpay's own `error.description` is passed through, but the key secret NEVER
 * appears in any response body or log.
 */
export function createOrderHandler(opts: {
  keyId: string;
  keySecret: CredentialInput;
  serverConfig?: Record<string, unknown>;
}): MinderHandler {
  return async function orderHandler(req: Request): Promise<Response> {
    // 0) Only POST creates an order.
    if (req.method !== 'POST') {
      return jsonResponse(
        { error: { code: 'RAZORPAY_METHOD_NOT_ALLOWED', message: 'Method not allowed; use POST.' } },
        { status: 405, headers: { allow: 'POST' } }
      );
    }

    // 1) Validate the body FIRST — malformed requests never touch the secret.
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return jsonResponse(
        { error: { code: 'RAZORPAY_BAD_REQUEST', message: 'Could not read request body.' } },
        { status: 400 }
      );
    }

    let json: unknown;
    try {
      json = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      return jsonResponse(
        { error: { code: 'RAZORPAY_BAD_REQUEST', message: 'Request body is not valid JSON.' } },
        { status: 400 }
      );
    }

    const parsed = parseOrderBody(json);
    if (!parsed) {
      return jsonResponse(
        {
          error: {
            code: 'RAZORPAY_BAD_REQUEST',
            message:
              'Request body must include a positive integer amount (smallest currency subunit); ' +
              'currency and receipt are optional.',
          },
        },
        { status: 400 }
      );
    }

    // 2) Resolve the key secret per-request, server-side only.
    let secretValue: string;
    try {
      const resolved = await resolveCredential(opts.keySecret, opts.serverConfig);
      if (typeof resolved !== 'string') {
        throw new Error('Razorpay key secret resolved to a non-string value.');
      }
      secretValue = resolved;
    } catch (err) {
      // Log-side only: never the key value.
      console.error(
        '[minder:razorpay] order key secret could not be resolved.',
        err instanceof Error ? err.message : String(err)
      );
      return jsonResponse(
        { error: { code: 'RAZORPAY_SECRET_UNRESOLVED', message: 'Razorpay secret could not be resolved.' } },
        { status: 500 }
      );
    }

    // 3) Call Razorpay over fetch with HTTP Basic auth (no SDK).
    const authorization = `Basic ${toBase64(`${opts.keyId}:${secretValue}`)}`;
    const orderPayload: Record<string, unknown> = {
      amount: parsed.amount,
      currency: parsed.currency,
    };
    if (parsed.receipt !== undefined) orderPayload.receipt = parsed.receipt;

    let razorpayRes: Response;
    try {
      razorpayRes = await fetch(RAZORPAY_ORDERS_URL, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });
    } catch {
      // Network / transport failure — masked 502, no key ever included.
      return jsonResponse(
        { error: { code: 'RAZORPAY_UPSTREAM_ERROR', message: 'Failed to reach Razorpay.' } },
        { status: 502 }
      );
    }

    const data = (await razorpayRes.json().catch(() => ({}))) as {
      id?: string;
      amount?: number;
      currency?: string;
      error?: { description?: string; reason?: string };
    };

    if (!razorpayRes.ok) {
      // Pass Razorpay's own description through (it never contains our key). The
      // key secret NEVER appears in the response body — sentinel-tested.
      const message =
        typeof data?.error?.description === 'string' && data.error.description.length > 0
          ? data.error.description
          : 'Razorpay order creation failed.';
      return jsonResponse({ error: { code: 'RAZORPAY_UPSTREAM_ERROR', message } }, { status: 502 });
    }

    // 4) Return the order + the PUBLIC keyId (the client widget needs it). The
    //    key SECRET is never part of this response.
    return jsonResponse(
      {
        id: data.id,
        amount: data.amount,
        currency: data.currency,
        keyId: opts.keyId,
      },
      { status: 200 }
    );
  };
}

// ── SERVER: webhook handler (built on the F-02 primitive) ────────────────────

/**
 * Create an edge-safe Razorpay webhook handler. Wraps the F-02
 * `createWebhookHandler` primitive with Razorpay's specifics: the
 * `x-razorpay-signature` header, HMAC-SHA256, and a BARE hex signature over the
 * RAW body — no timestamp, so `timestampToleranceSec: 0` and no
 * `parseSignatureHeader`. `webhookSecret` is resolved per-request server-side and
 * never leaked. `onEvent` receives the verified `{ body, rawBody, headers }`.
 */
export function createRazorpayWebhookHandler(opts: {
  webhookSecret: CredentialInput;
  onEvent: (event: { body: unknown; rawBody: string; headers: Headers }) => Promise<Response | void>;
}): MinderHandler {
  return createWebhookHandler({
    secret: opts.webhookSecret,
    signatureHeader: 'x-razorpay-signature',
    algorithm: 'hmac-sha256',
    timestampToleranceSec: 0,
    onEvent: opts.onEvent,
  });
}

// ── CLIENT: PaymentsContract registration ────────────────────────────────────

/**
 * Reduce the checkout items to a single Razorpay `amount` (sum of each item's
 * `amountCents * quantity`, in the smallest currency subunit) and a `currency`
 * (the first item's, uppercased, else `INR`). Robust to missing/odd fields.
 */
function summarizeItems(items: unknown[]): { amount: number; currency: string } {
  let amount = 0;
  let currency: string | undefined;
  for (const raw of items) {
    if (raw == null || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const unit = typeof it.amountCents === 'number' && Number.isFinite(it.amountCents) ? it.amountCents : 0;
    const qty = typeof it.quantity === 'number' && Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1;
    amount += Math.round(unit) * qty;
    if (currency === undefined && typeof it.currency === 'string' && it.currency.length > 0) {
      currency = it.currency.toUpperCase();
    }
  }
  return { amount, currency: currency ?? 'INR' };
}

/** Build the client-side PaymentsContract that POSTs to the scaffolded route. */
function buildClientPaymentsContract(orderPath: string): PaymentsContract {
  return {
    async createCheckout(input) {
      const { amount, currency } = summarizeItems(input.items);
      const res = await fetch(orderPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount, currency }),
      });

      if (!res.ok) {
        // Surface the server's already-masked error message via a MinderError.
        let message = `Order request failed (HTTP ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: { message?: string } | string };
          if (
            data &&
            typeof data.error === 'object' &&
            data.error !== null &&
            typeof data.error.message === 'string' &&
            data.error.message.length > 0
          ) {
            message = data.error.message;
          } else if (typeof data?.error === 'string' && data.error.length > 0) {
            message = data.error;
          }
        } catch {
          // Non-JSON error body — keep the default message.
        }
        throw new MinderError(message, 'RAZORPAY_ORDER_FAILED', res.status);
      }

      const data = (await res.json()) as { id?: string };
      if (typeof data?.id !== 'string' || data.id.length === 0) {
        throw new MinderError(
          'Razorpay order response did not include an id.',
          'RAZORPAY_ORDER_MALFORMED_RESPONSE',
          502
        );
      }
      // Razorpay has no hosted-redirect URL; the client widget opens against the
      // order id + public keyId. Return an order reference for `useCheckout()`.
      return { url: `razorpay://order/${data.id}` };
    },
  };
}

/**
 * Register the Razorpay provider (client side). Returns an unregister function.
 *
 * - `config` omitted → read `getProviderConfig('razorpay')` (global Minder config).
 * - `mock: true` → register the in-memory PaymentsContract mock (zero SDK, zero
 *   keys, zero network).
 * - otherwise → register a PaymentsContract whose `createCheckout` POSTs to
 *   `DEFAULT_ORDER_PATH` (`/api/minder/razorpay/order`).
 */
export async function registerRazorpayProvider(
  config?: RazorpayProviderConfig
): Promise<() => void> {
  let effective: RazorpayProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('razorpay');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<RazorpayProviderConfig>;
      effective = {
        keyId: typeof raw.keyId === 'string' ? raw.keyId : undefined,
        keySecret: raw.keySecret,
        webhookSecret: raw.webhookSecret,
        mock: fromGlobal.mock,
      };
    }
  }

  effective = effective ?? {};

  // Remember the credentials for the server-only getProviderClient() escape hatch.
  activeKeyId = effective.keyId;
  activeKeySecret = effective.keySecret;
  activeServerConfig = undefined;

  // ── Mock mode: zero SDK, zero keys, zero network ────────────────────────────
  if (effective.mock === true) {
    return registerRazorpayMocks();
  }

  // ── Real mode: client POSTs to the scaffolded server route ──────────────────
  return registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'payments',
    implementation: buildClientPaymentsContract(DEFAULT_ORDER_PATH),
    getProviderClient: () => getProviderClient(),
  });
}
