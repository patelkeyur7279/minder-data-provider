/**
 * @minder/provider-stripe — the Stripe payments adapter. THE SERVER-BOUNDARY
 * SHOWCASE: a Checkout session is created on the SERVER with the secret key,
 * which never travels anywhere near the browser.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerStripeProvider(config?)` registers a `PaymentsContract`
 *     (so an app can call `useCheckout().createCheckout(...)` from
 *     `minder-data-provider`). Its `createCheckout` POSTs `{ items, successUrl,
 *     cancelUrl }` to the app's scaffolded server route (`config.checkoutPath`,
 *     default `/api/minder/stripe/checkout`) and returns `{ url }` from the JSON
 *     response. A non-OK response becomes a `MinderError` carrying the server's
 *     already-masked error message. `mock: true` registers the in-memory mock
 *     (zero network, zero keys).
 *
 *   SERVER (edge-safe, zero-dep — uses `fetch`, NOT the `stripe` SDK) —
 *     `createCheckoutHandler(...)` and `createStripeWebhookHandler(...)` are
 *     web-standard `(Request) => Response` handlers the scaffolded routes mount.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * The server handlers speak to Stripe over `fetch` against
 * `https://api.stripe.com/v1/checkout/sessions` (form-encoded), so this module
 * has NO static SDK dependency and stays importable in web/edge bundles. The
 * `stripe` npm package is an OPTIONAL peer, reached ONLY via a dynamic `import()`
 * inside `getProviderClient()` (non-literal specifier) — never a static import,
 * never bundled for consumers who don't use it.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `publishableKey` is Stripe's intentionally-public browser key — registered
 * client-safe below. `secretKey` and `webhookSecret` are real secrets: they are
 * `serverOnly` in the manifest, typed as `CredentialInput` (never a raw string in
 * client config), resolved per-request via `resolveCredential` INSIDE the server
 * handlers only, and never echoed by any thrown error, response body, or log.
 * A Stripe upstream error's own `message` is passed through, but the secret key
 * is NEVER included. Stripe's hosted Checkout means MDP never touches card data.
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
import { MinderError } from '../../../src/errors/MinderError.js';
import { registerStripeMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Stripe as a certified provider: `publishableKey`
// (public by design), `checkoutPath`, and `mock` are exempt, while any other
// credential-shaped key (e.g. a raw `secretKey`) hard-fails in a browser-like
// environment. Runs once, at import time.
registerClientSafeProviderKeys('stripe', ['publishableKey', 'checkoutPath', 'mock']);

export interface StripeProviderConfig {
  /** The publishable key (`pk_...`) — clientSafe, intentionally PUBLIC. */
  publishableKey: string;
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

// The most-recently-configured server-side secret, used only by the
// `getProviderClient()` escape hatch (server-only). Never read on the client.
let activeSecretKey: CredentialInput | undefined;
let activeServerConfig: Record<string, unknown> | undefined;

/** Lazily import the optional `stripe` SDK, throwing the helpful install message
 *  if it is absent. Returns the module's Stripe constructor. */
async function loadStripeSdk(): Promise<new (key: string) => unknown> {
  let mod: { default?: unknown; Stripe?: unknown } | undefined;
  try {
    mod = (await import(STRIPE_SDK)) as { default?: unknown; Stripe?: unknown };
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  const ctor = mod?.default ?? mod?.Stripe ?? mod;
  if (typeof ctor !== 'function') {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  return ctor as new (key: string) => unknown;
}

/**
 * Escape hatch: return a raw `stripe` SDK client, constructed with the RESOLVED
 * secret key. SERVER-ONLY — throws immediately in the browser (it would otherwise
 * require the secret key client-side). Throws the optional-peer install message
 * if `stripe` is not installed. Async because both the credential and the SDK are
 * resolved on demand.
 */
export async function getProviderClient(): Promise<unknown> {
  if (typeof window !== 'undefined') {
    throw new Error(
      '[Minder] Stripe getProviderClient() must only be called on the server ' +
        '(it constructs the SDK with the secret key).'
    );
  }
  if (!activeSecretKey) {
    throw new Error(
      '[Minder] Stripe getProviderClient(): no secretKey configured. Pass secretKey to ' +
        'registerStripeProvider (or use the server handlers) before reaching for the SDK.'
    );
  }
  const resolved = await resolveCredential(activeSecretKey, activeServerConfig);
  if (typeof resolved !== 'string') {
    throw new Error('[Minder] Stripe secret key resolved to a non-string value.');
  }
  const Stripe = await loadStripeSdk();
  return new Stripe(resolved);
}

// ── SERVER: create-checkout-session handler (edge-safe, zero-dep) ────────────

interface CheckoutItem {
  name: string;
  amountCents: number;
  currency: string;
  quantity: number;
}

interface ParsedCheckout {
  items: CheckoutItem[];
  successUrl: string;
  cancelUrl: string;
}

/**
 * Validate + normalize the incoming checkout request body. Returns `null` for any
 * malformed shape (→ 400). Expected: `{ items: [{ name, amountCents, currency?,
 * quantity? }], successUrl, cancelUrl }`, `items` non-empty.
 */
function parseCheckoutBody(body: unknown): ParsedCheckout | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.successUrl !== 'string' || b.successUrl.length === 0) return null;
  if (typeof b.cancelUrl !== 'string' || b.cancelUrl.length === 0) return null;
  if (!Array.isArray(b.items) || b.items.length === 0) return null;

  const items: CheckoutItem[] = [];
  for (const raw of b.items) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const it = raw as Record<string, unknown>;
    if (typeof it.name !== 'string' || it.name.length === 0) return null;
    if (typeof it.amountCents !== 'number' || !Number.isFinite(it.amountCents)) return null;
    items.push({
      name: it.name,
      amountCents: it.amountCents,
      currency: typeof it.currency === 'string' && it.currency.length > 0 ? it.currency : 'usd',
      quantity: typeof it.quantity === 'number' && Number.isFinite(it.quantity) ? it.quantity : 1,
    });
  }

  return { items, successUrl: b.successUrl, cancelUrl: b.cancelUrl };
}

/**
 * Flatten a parsed checkout request into Stripe's form-encoded Checkout session
 * fields (`mode=payment`, `success_url`, `cancel_url`, and per-item inline
 * `line_items[i][price_data][...]` price data + `line_items[i][quantity]`).
 */
function buildCheckoutForm(parsed: ParsedCheckout): string {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', parsed.successUrl);
  form.set('cancel_url', parsed.cancelUrl);
  parsed.items.forEach((item, i) => {
    form.set(`line_items[${i}][price_data][currency]`, item.currency);
    form.set(`line_items[${i}][price_data][product_data][name]`, item.name);
    form.set(`line_items[${i}][price_data][unit_amount]`, String(item.amountCents));
    form.set(`line_items[${i}][quantity]`, String(item.quantity));
  });
  return form.toString();
}

/**
 * Create an edge-safe checkout handler. On POST it validates the request body
 * (malformed → 400), resolves `secretKey` server-side, form-encodes the checkout
 * params, and calls Stripe's REST API with `Authorization: Bearer <key>`. Returns
 * `{ url }` from Stripe's response. Any upstream failure is mapped to a MASKED
 * 502: Stripe's own `error.message` is passed through, but the secret key NEVER
 * appears in any response body or log.
 */
export function createCheckoutHandler(opts: {
  secretKey: CredentialInput;
  serverConfig?: Record<string, unknown>;
}): MinderHandler {
  return async function checkoutHandler(req: Request): Promise<Response> {
    // 1) Validate the body FIRST — malformed requests never touch the secret.
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return jsonResponse(
        { error: { code: 'STRIPE_BAD_REQUEST', message: 'Could not read request body.' } },
        { status: 400 }
      );
    }

    let json: unknown;
    try {
      json = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      return jsonResponse(
        { error: { code: 'STRIPE_BAD_REQUEST', message: 'Request body is not valid JSON.' } },
        { status: 400 }
      );
    }

    const parsed = parseCheckoutBody(json);
    if (!parsed) {
      return jsonResponse(
        {
          error: {
            code: 'STRIPE_BAD_REQUEST',
            message:
              'Request body must include a non-empty items[] (each with name + amountCents), ' +
              'successUrl, and cancelUrl.',
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
        { error: { code: 'STRIPE_SECRET_UNRESOLVED', message: 'Stripe secret could not be resolved.' } },
        { status: 500 }
      );
    }

    // 3) Form-encode + call Stripe over fetch (no SDK).
    const form = buildCheckoutForm(parsed);
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
        { error: { code: 'STRIPE_UPSTREAM_ERROR', message: 'Failed to reach Stripe.' } },
        { status: 502 }
      );
    }

    const data = (await stripeRes.json().catch(() => ({}))) as {
      url?: string;
      error?: { message?: string };
    };

    if (!stripeRes.ok) {
      // Pass Stripe's own message through (it never contains our key). The secret
      // key NEVER appears in the response body — sentinel-tested.
      const message =
        typeof data?.error?.message === 'string' && data.error.message.length > 0
          ? data.error.message
          : 'Stripe checkout session creation failed.';
      return jsonResponse({ error: { code: 'STRIPE_UPSTREAM_ERROR', message } }, { status: 502 });
    }

    return jsonResponse({ url: data.url }, { status: 200 });
  };
}

// ── SERVER: webhook handler (built on the F-02 primitive) ────────────────────

/**
 * Parse a Stripe `stripe-signature` header (`t=<ts>,v1=<hex>[,v1=…]`) into the
 * hex signature and timestamp. Returns `null` (→ 400 malformed) if either the
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
 * header, HMAC-SHA256, the `t=,v1=` parser, the `${t}.${body}` signed-payload
 * format, and a 300s tolerance. The verified, parsed event body is adapted to
 * `{ type, data, raw }` for `onEvent`. `webhookSecret` is resolved per-request
 * server-side and never leaked.
 */
export function createStripeWebhookHandler(opts: {
  webhookSecret: CredentialInput;
  onEvent: (event: { type: string; data: unknown; raw: unknown }) => Promise<Response | void>;
}): MinderHandler {
  return createWebhookHandler({
    secret: opts.webhookSecret,
    signatureHeader: 'stripe-signature',
    algorithm: 'hmac-sha256',
    timestampToleranceSec: 300,
    parseSignatureHeader: parseStripeSignatureHeader,
    payloadFormat: (body, timestamp) => `${timestamp}.${body}`,
    onEvent: async ({ body }) => {
      const evt = (body ?? {}) as { type?: unknown; data?: unknown };
      return opts.onEvent({
        type: typeof evt.type === 'string' ? evt.type : '',
        data: evt.data,
        raw: body ?? null,
      });
    },
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
        // Surface the server's already-masked error message via a MinderError.
        let message = `Checkout request failed (HTTP ${res.status}).`;
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
        throw new MinderError(message, 'STRIPE_CHECKOUT_FAILED', res.status);
      }

      const data = (await res.json()) as { url?: string };
      if (typeof data?.url !== 'string' || data.url.length === 0) {
        throw new MinderError(
          'Stripe checkout response did not include a url.',
          'STRIPE_CHECKOUT_MALFORMED_RESPONSE',
          502
        );
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
        publishableKey: typeof raw.publishableKey === 'string' ? raw.publishableKey : '',
        checkoutPath: typeof raw.checkoutPath === 'string' ? raw.checkoutPath : undefined,
        secretKey: raw.secretKey,
        webhookSecret: raw.webhookSecret,
        mock: fromGlobal.mock,
      };
    }
  }

  effective = effective ?? { publishableKey: '' };

  // Remember the secret for the server-only getProviderClient() escape hatch.
  activeSecretKey = effective.secretKey;
  activeServerConfig = undefined;

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
