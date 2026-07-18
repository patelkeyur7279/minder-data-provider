/**
 * minder-data-provider/server — server-only helpers.
 *
 * Import this ONLY from server code (API routes, server components, Node).
 * It resolves secret values from the environment; calling it in the browser
 * throws, so a secret can never be revealed client-side.
 *
 * @example
 * // app/api/checkout/route.ts (server)
 * import { resolveSecret } from 'minder-data-provider/server';
 * const stripeKey = resolveSecret('STRIPE_SECRET_KEY');
 */
import { SecretRef, isSecretRef } from './security/secrets.js';

/**
 * Resolve a secret's real value on the SERVER. Accepts a `SecretRef` (from
 * `secret()`) or a bare env-var name. Throws in the browser or if the value is
 * not present in the environment.
 */
export function resolveSecret(ref: SecretRef | string): string {
  if (typeof window !== 'undefined') {
    throw new Error('[Minder] resolveSecret() must only be called on the server.');
  }

  if (typeof ref === 'string') {
    const v = typeof process !== 'undefined' ? process.env[ref] : undefined;
    if (v == null) throw new Error(`[Minder] Secret env var "${ref}" is not set.`);
    return v;
  }

  if (isSecretRef(ref)) {
    if (ref.hasValue()) return ref.reveal();
    const v = typeof process !== 'undefined' ? process.env[ref.name] : undefined;
    if (v == null) throw new Error(`[Minder] Secret "${ref.name}" is not set in the server environment.`);
    return v;
  }

  throw new Error('[Minder] resolveSecret() expects a SecretRef or an env-var name.');
}

export { secret, env, SecretRef, isSecretRef, redactSecrets, findExposedSecrets } from './security/secrets.js';

// ── Typed credential model (G-06) — server-only resolution ──────────────────
// `CredentialInput`/`isCredentialInput`/`describeCredential` mirror the root
// entry point's exports (see src/index.ts), but `resolveCredential` belongs
// HERE ONLY: it touches process.env/fs and throws immediately if called in
// the browser, so it must never be reachable from the root entry point. Every
// certified provider's server handler (e.g. createClerkSessionHandler) and
// createWebhookHandler resolve their CredentialInput via this function.
export { resolveCredential, describeCredential, isCredentialInput } from './security/credentials.js';
export type { CredentialInput } from './security/credentials.js';

// ── Web-standard server handler core (F-02) ─────────────────────────────────
// Edge-safe handler types + JSON helper, HMAC webhook verification, and the
// Node mount adapter. `toNodeHandler` is re-exported by name (its `http`
// dependency is type-only, so this stays edge-importable).
export * from './server/handlers.js';
export * from './server/webhooks.js';
export { toNodeHandler } from './server/nodeMount.js';
