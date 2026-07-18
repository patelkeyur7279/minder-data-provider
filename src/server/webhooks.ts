/**
 * minder-data-provider/server — HMAC webhook verification (EDGE-SAFE, security-critical).
 *
 * Verifies inbound webhook signatures using HMAC-SHA256 via WebCrypto
 * (`crypto.subtle`). Signature comparison is done with `crypto.subtle.verify`,
 * which is constant-time — we NEVER compare signature strings with `===`, which
 * would be timing-attackable.
 *
 * Edge-safe rules honored here:
 *   - No CommonJS loader, no `Buffer`, no Node-only imports at module scope.
 *   - `crypto.subtle` and `TextEncoder` only; hex decoded by hand.
 *   - The credential resolver is imported lazily INSIDE request execution (via a
 *     native dynamic `import()`), so there is no module load-order / test-order
 *     coupling with credentials.ts and its Node-only code never enters this
 *     handler's static import graph. A CommonJS test runner that cannot execute
 *     dynamic `import()` may inject the resolver through the internal
 *     `_credentialResolver` seam (never a synchronous CommonJS loader here).
 *
 * Signature encoding: the signature header value is expected to be a HEX-encoded
 * HMAC-SHA256 digest (64 lowercase/uppercase hex chars). Malformed hex → 400.
 */
import type { CredentialInput } from '../security/credentials.js';
import type { MinderHandler } from './handlers.js';
import { jsonResponse } from './handlers.js';
import {
  __getInjectedCredentialResolver,
  type CredentialResolver,
} from './_credentialResolver.js';

export interface WebhookVerifyOptions {
  /** The credential holding the shared signing secret (resolved per-request). */
  secret: CredentialInput;
  /** Header carrying the hex signature, e.g. 'stripe-signature'. */
  signatureHeader: string;
  /** Only HMAC-SHA256 is supported today. */
  algorithm: 'hmac-sha256';
  /** Max allowed clock skew in seconds; default 300. `0` disables the check. */
  timestampToleranceSec?: number;
  /** When set, the timestamp is read from this header and tolerance is enforced. */
  timestampHeader?: string;
  /**
   * How the signed payload string is assembled from the raw body (+ timestamp).
   * Default: `timestamp ? `${timestamp}.${body}` : body`.
   */
  payloadFormat?: (body: string, timestamp?: string) => string;
}

const defaultPayloadFormat = (body: string, timestamp?: string): string =>
  timestamp ? `${timestamp}.${body}` : body;

/**
 * Decode a hex string to bytes. Returns null for malformed input (odd length,
 * non-hex characters, or empty). Edge-safe (no Buffer).
 */
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    // parseInt returns NaN for non-hex pairs; also reject '0x'/whitespace via regex-free check.
    if (Number.isNaN(byte) || !/^[0-9a-fA-F]{2}$/.test(hex.slice(i * 2, i * 2 + 2))) {
      return null;
    }
    out[i] = byte;
  }
  return out;
}

/**
 * Load the credential resolver. Real runtimes use a native dynamic `import()`
 * (keeping credentials.ts out of this handler's static graph). If dynamic import
 * is unavailable (e.g. a CommonJS test VM) an injected resolver is used instead.
 * Edge-safe: no synchronous CommonJS loader is ever referenced here.
 */
async function loadResolveCredential(): Promise<CredentialResolver> {
  try {
    const mod = await import('../security/credentials.js');
    return mod.resolveCredential;
  } catch (importErr) {
    const injected = __getInjectedCredentialResolver();
    if (injected) return injected;
    throw importErr;
  }
}

/**
 * Masked, value-free description of a credential's kind for server-side logs.
 * Hand-rolled (does NOT import describeCredential) to keep this module's deps
 * minimal and edge-safe. Never includes the secret name or value.
 */
function credentialKind(c: CredentialInput): string {
  if (c && typeof c === 'object' && 'kind' in c) {
    return String((c as { kind: unknown }).kind);
  }
  // SecretRef (env-backed) has no `kind` property.
  return 'env';
}

/**
 * Create an edge-safe webhook handler that verifies an HMAC-SHA256 signature
 * before invoking `onEvent`.
 *
 * Responses:
 *   - 400 `WEBHOOK_SIGNATURE_MISSING` / `WEBHOOK_SIGNATURE_MALFORMED` — no/invalid header.
 *   - 401 `WEBHOOK_SIGNATURE_INVALID` — signature does not match.
 *   - 401 `WEBHOOK_TIMESTAMP_STALE` — timestamp outside tolerance.
 *   - 500 `WEBHOOK_SECRET_UNRESOLVED` — secret could not be resolved (generic; the
 *          secret name/value NEVER appears in the response body).
 *   - Whatever `onEvent` returns if it returns a `Response`; otherwise 200 `{received:true}`.
 */
export function createWebhookHandler(
  opts: WebhookVerifyOptions & {
    onEvent: (event: { body: unknown; rawBody: string; headers: Headers }) => Promise<Response | void>;
  }
): MinderHandler {
  const toleranceSec = opts.timestampToleranceSec ?? 300;
  const format = opts.payloadFormat ?? defaultPayloadFormat;

  return async function webhookHandler(req: Request): Promise<Response> {
    const rawBody = await req.text();

    // 1) Signature header must be present.
    const sigHeader = req.headers.get(opts.signatureHeader);
    if (!sigHeader || sigHeader.trim().length === 0) {
      return jsonResponse(
        { error: 'Missing webhook signature header.', code: 'WEBHOOK_SIGNATURE_MISSING' },
        { status: 400 }
      );
    }

    // 2) Signature must be valid hex.
    const sigBytes = hexToBytes(sigHeader.trim());
    if (!sigBytes) {
      return jsonResponse(
        { error: 'Malformed webhook signature header.', code: 'WEBHOOK_SIGNATURE_MALFORMED' },
        { status: 400 }
      );
    }

    // 3) Optional timestamp (used both for the signed payload and staleness).
    const timestamp =
      opts.timestampHeader != null ? req.headers.get(opts.timestampHeader) ?? undefined : undefined;

    // 4) Resolve the signing secret per-request (lazy import → no load-order coupling).
    let secretValue: string;
    try {
      const resolveCredential = await loadResolveCredential();
      const resolved = await resolveCredential(opts.secret);
      if (typeof resolved !== 'string') {
        throw new Error('Webhook signing secret resolved to a non-string value.');
      }
      secretValue = resolved;
    } catch (err) {
      // Log-side only: masked kind, never the secret name/value.
      console.error(
        `[Minder] Webhook secret resolution failed (credential kind: ${credentialKind(opts.secret)}).`,
        err instanceof Error ? err.message : String(err)
      );
      return jsonResponse(
        { error: 'Webhook secret could not be resolved.', code: 'WEBHOOK_SECRET_UNRESOLVED' },
        { status: 500 }
      );
    }

    // 5) Constant-time HMAC verification via crypto.subtle.verify.
    // TextEncoder is created lazily (at request time) so importing this module
    // has no side effects in runtimes that lack the global (e.g. jsdom).
    const encoder = new TextEncoder();
    const payload = format(rawBody, timestamp);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretValue),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));

    if (!valid) {
      return jsonResponse(
        { error: 'Webhook signature verification failed.', code: 'WEBHOOK_SIGNATURE_INVALID' },
        { status: 401 }
      );
    }

    // 6) Timestamp tolerance — only after the request is proven authentic.
    if (opts.timestampHeader != null && toleranceSec > 0) {
      const ts = timestamp != null ? Number.parseInt(timestamp, 10) : Number.NaN;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Number.isNaN(ts) || Math.abs(nowSec - ts) > toleranceSec) {
        return jsonResponse(
          { error: 'Webhook timestamp is outside the allowed tolerance.', code: 'WEBHOOK_TIMESTAMP_STALE' },
          { status: 401 }
        );
      }
    }

    // 7) Parse body for convenience; parse failure leaves `body` undefined.
    let body: unknown;
    try {
      body = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      body = undefined;
    }

    const result = await opts.onEvent({ body, rawBody, headers: req.headers });
    if (result instanceof Response) return result;
    return jsonResponse({ received: true }, { status: 200 });
  };
}
