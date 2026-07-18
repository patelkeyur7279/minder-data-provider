/**
 * @minder/provider-stripe — the Stripe payments adapter. THE SERVER-BOUNDARY
 * SHOWCASE: the secret key is created into a Stripe Checkout session on the
 * SERVER and never travels anywhere near the browser.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerStripeProvider(config?)` registers a `PaymentsContract`
 *     (so an app can call `useCheckout().createCheckout(...)` from
 *     `minder-data-provider`). Its `createCheckout` POSTs `{ items, successUrl,
 *     cancelUrl }` to the app's scaffolded server route (`config.checkoutPath`,
 *     default `/api/minder/stripe/checkout`) and returns `{ url }` from the JSON
 *     response. `mock: true` registers the in-memory mock (zero network, zero
 *     keys). `getProviderClient()` is the escape hatch: it lazily imports the
 *     optional `stripe` SDK (helpful error if absent).
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT the `stripe` SDK) —
 *     `createCheckoutHandler(...)` and `createStripeWebhookHandler(...)` are
 *     web-standard `(Request) => Response` handlers the scaffolded routes mount.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handlers speak to Stripe over `fetch` against
 * `https://api.stripe.com/v1/checkout/sessions` (form-encoded), so this module
 * has NO static SDK dependency and stays importable in web/edge bundles. The
 * `stripe` npm package is an OPTIONAL peer, reached ONLY via a dynamic
 * `import()` inside `getProviderClient()` — never a static import, never bundled
 * for consumers who don't use it.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `publishableKey` is Stripe's intentionally-public browser key — registered
 * client-safe below. `secretKey` and `webhookSecret` are real secrets: they are
 * `serverOnly` in the manifest, typed as `CredentialInput` (never a raw string
 * in client config), resolved per-request via `resolveCredential` INSIDE the
 * server handlers only, and never echoed by any thrown error or log. Stripe's
 * hosted Checkout means MDP never touches card data.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package (wired by T-02) imports these from `minder-data-provider`
 * subpaths instead; the runtime shapes are identical.
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
import { registerStripeMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Stripe as a certified provider: `publishableKey`
// (public by design) and `checkoutPath` are exempt, while any other
// credential-shaped key (e.g. a raw `secretKey`) hard-fails in a browser-like
// environment. Runs once, at import time.
registerClientSafeProviderKeys('stripe', ['publishableKey', 'checkoutPath']);

export interface StripeProviderConfig {
  /** The publishable key (`pk_...`) — clientSafe, intentionally PUBLIC. */
  publishableKey?: string;
  /** Secret key (`sk_...`) — serverOnly; used only by the server handlers. */
  secretKey?: CredentialInput;
  /** Webhook signing secret (`whsec_...`) — serverOnly. */
  webhookSecret?: CredentialInput;
  /** Where the client POSTs to create a checkout session. Default below. */
  checkoutPath?: string;
  /** When true, register the in-memory mock instead of the real client contract. */
  mock?: boolean;
}

const PROVIDER_NAME = '@minder/provider-stripe';

/** The default path the scaffolded checkout route is mounted at. */
export const DEFAULT_CHECKOUT_PATH = '/api/minder/stripe/checkout';

/** Stripe's REST endpoint for creating a hosted Checkout session. */
const STRIPE_CHECKOUT_URL = 'https://api.stripe.com/v1/checkout/sessions';

/** The optional-peer SDK specifier, kept in a variable so it is resolved purely
 *  at runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const STRIPE_SDK = 'stripe';

const SDK_MISSING_MESSAGE = 'Install stripe (optional peer): npm i stripe';

/** Lazily import the optional `stripe` SDK, throwing the helpful install message
 *  if it is absent. Returns the module's Stripe constructor (escape hatch). */
async function loadStripeSdk(): Promise<unknown> {
  let mod: { default?: unknown; Stripe?: unknown } | undefined;
  try {
    mod = (await import(STRIPE_SDK)) as { default?: unknown; Stripe?: unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const StripeCtor = mod?.default ?? mod?.Stripe ?? mod;
  if (StripeCtor == null) {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  return StripeCtor;
}

/**
 * Escape hatch: return the raw `stripe` SDK constructor (lazily imported).
 * Throws the optional-peer install message if `stripe` is not installed. Async
 * because the SDK is loaded on demand — there is no long-lived client to cache
 * (checkout runs server-side over `fetch`, not the SDK).
 */
export async function getProviderClient(): Promise<unknown> {
  return loadStripeSdk();
}

// ── SERVER: create-checkout-session handler (edge-safe, zero-dep) ────────────

/**
 * Default request-body → Stripe form-field mapping. Maps `{ items, successUrl,
 * cancelUrl }` to Stripe Checkout session form fields:
 *   - each `items[i]` of shape `{ price, quantity }` →
 *     `line_items[i][price]` / `line_items[i][quantity]`
 *   - `successUrl` → `success_url`, `cancelUrl` → `cancel_url`
 *   - `mode` defaults to `payment`.
 */
function defaultBuildParams(body: unknown): Record<string, string> {
  const params: Record<string, string> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  const items = Array.isArray(b.items) ? b.items : [];
  items.forEach((item, i) => {
    if (item != null && typeof item === 'object') {
      const it = item as Record<string, unknown>;
      if (it.price != null) params[`line_items[${i}][price]`] = String(it.price);
      if (it.quantity != null) params[`line_items[${i}][quantity]`] = String(it.quantity);
    }
  });

  if (typeof b.successUrl === 'string') params['success_url'] = b.successUrl;
  if (typeof b.cancelUrl === 'string') params['cancel_url'] = b.cancelUrl;
  params['mode'] = 'payment';

  return params;
}

/**
 * Create an edge-safe checkout handler. On POST it resolves `secretKey`
 * server-side, form-encodes the checkout params, and calls Stripe's REST API
 * with `Authorization: Bearer <key>`. Returns `{ url, id }` from Stripe's
 * response. Any upstream failure is mapped to a MASKED 502: Stripe's own
 * `error.message` is passed through, but the secret key NEVER appears in any
 * response body or log.
 */
export function createCheckoutHandler(opts: {
  secretKey: CredentialInput;
  buildParams?: (body: unknown) => Record<string, string>;
}): MinderHandler {
  const buildParams = opts.buildParams ?? defaultBuildParams;

  return async function checkoutHandler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed.', code: 'STRIPE_METHOD_NOT_ALLOWED' },
        { status: 405 }
      );
    }

    // Resolve the secret key per-request, server-side only.
    let key: string;
    try {
      const resolved = await resolveCredential(opts.secretKey);
      if (typeof resolved !== 'string') {
        throw new Error('Stripe secret key resolved to a non-string value.');
      }
      key = resolved;
    } catch (err) {
      // Log-side only: never the key value.
      console.error(
        '[minder:stripe] checkout secret could not be resolved.',
        err instanceof Error ? err.message : String(err)
      );
      return jsonResponse(
        { error: 'Stripe secret could not be resolved.', code: 'STRIPE_SECRET_UNRESOLVED' },
        { status: 500 }
      );
    }

    // Parse the incoming JSON body (missing/invalid → empty object).
    let body: unknown;
    try {
      const text = await req.text();
      body = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    const form = new URLSearchParams(buildParams(body)).toString();

    let stripeRes: Response;
    try {
      stripeRes = await fetch(STRIPE_CHECKOUT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
    } catch {
      // Network / transport failure — masked 502, no key ever included.
      return jsonResponse(
        { error: 'Failed to reach Stripe.', code: 'STRIPE_UPSTREAM_UNREACHABLE' },
        { status: 502 }
      );
    }

    const data = (await stripeRes.json().catch(() => ({}))) as {
      url?: string;
      id?: string;
      error?: { message?: string };
    };

    if (!stripeRes.ok) {
      // Pass Stripe's own message through (safe — it never contains our key);
      // the secret key NEVER appears in the response body.
      const stripeMessage =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : 'Stripe checkout session creation failed.';
      return jsonResponse(
        { error: stripeMessage, code: 'STRIPE_CHECKOUT_FAILED' },
        { status: 502 }
      );
    }

    return jsonResponse({ url: data.url, id: data.id }, { status: 200 });
  };
}

// ── SERVER: webhook handler (built on the F-02 primitive) ────────────────────

/**
 * Parse a Stripe `stripe-signature` header (`t=<ts>,v1=<hex>[,v1=…]`) into the
 * hex signature and timestamp. Returns null (→ 400 malformed) if either the
 * timestamp (`t`) or a v1 signature is absent. Uses the FIRST `v1` scheme entry.
 */
export function parseStripeSignatureHeader(
  raw: string
): { signature: string; timestamp?: string } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const part of raw.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const scheme = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (scheme === 't') timestamp = value;
    else if (scheme === 'v1' && signature === undefined) signature = value;
  }

  if (!signature || !timestamp) return null;
  return { signature, timestamp };
}

/**
 * Create an edge-safe Stripe webhook handler. Wraps the F-02
 * `createWebhookHandler` primitive with Stripe's specifics: the `stripe-signature`
 * header, HMAC-SHA256, the `t=,v1=` parser, and the `${t}.${body}` signed-payload
 * format. `webhookSecret` is resolved per-request server-side and never leaked.
 */
export function createStripeWebhookHandler(opts: {
  webhookSecret: CredentialInput;
  onEvent: (event: { body: unknown; rawBody: string; headers: Headers }) => Promise<Response | void>;
}): MinderHandler {
  return createWebhookHandler({
    secret: opts.webhookSecret,
    signatureHeader: 'stripe-signature',
    algorithm: 'hmac-sha256',
    parseSignatureHeader: parseStripeSignatureHeader,
    payloadFormat: (body, timestamp) => `${timestamp}.${body}`,
    onEvent: opts.onEvent,
  });
}

// ── CLIENT: PaymentsContract registration ────────────────────────────────────

/** Build the client-side PaymentsContract that POSTs to the scaffolded route. */
function buildClientPaymentsContract(checkoutPath: string): PaymentsContract {
  return {
    async createCheckout(input) {
      const res = await fetch(checkoutPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: input.items,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(`[minder:stripe] Checkout request failed (HTTP ${res.status}).`);
      }

      const data = (await res.json()) as { url?: string };
      if (typeof data?.url !== 'string' || data.url.length === 0) {
        throw new Error('[minder:stripe] Checkout response did not include a url.');
      }
      return { url: data.url };
    },
  };
}

/**
 * Register the Stripe provider (client side). Returns an unregister function.
 *
 * - `config` omitted → read `getProviderConfig('stripe')` (global Minder config).
 * - `mock: true` → register the in-memory PaymentsContract mock (zero SDK, zero
 *   keys, zero network).
 * - otherwise → register a PaymentsContract whose `createCheckout` POSTs to
 *   `checkoutPath` (default `/api/minder/stripe/checkout`).
 */
export async function registerStripeProvider(
  config?: StripeProviderConfig
): Promise<() => void> {
  let effective: StripeProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('stripe');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<StripeProviderConfig>;
      effective = {
        publishableKey: typeof raw.publishableKey === 'string' ? raw.publishableKey : undefined,
        checkoutPath: typeof raw.checkoutPath === 'string' ? raw.checkoutPath : undefined,
        secretKey: raw.secretKey,
        webhookSecret: raw.webhookSecret,
        mock: fromGlobal.mock,
      };
    }
  }

  effective = effective ?? {};

  // ── Mock mode: zero SDK, zero keys, zero network ────────────────────────────
  if (effective.mock === true) {
    return registerStripeMocks();
  }

  // ── Real mode: client POSTs to the scaffolded server route ──────────────────
  const checkoutPath = effective.checkoutPath ?? DEFAULT_CHECKOUT_PATH;
  return registerCapabilityProvider({
    providerName: PROVIDER_NAME,
    capability: 'payments',
    implementation: buildClientPaymentsContract(checkoutPath),
    getProviderClient: () => getProviderClient(),
  });
}
