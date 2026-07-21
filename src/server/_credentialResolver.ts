/**
 * Internal seam for the webhook credential resolver (EDGE-SAFE, NOT public API).
 *
 * On real runtimes (Cloudflare/Vercel Edge, Node, Deno, Bun) `webhooks.ts` loads
 * the resolver via a native dynamic `import()` of the Node-touching
 * `credentials.ts`, which keeps that module OUT of the webhook handler's static
 * import graph (so an edge bundle of `webhooks.ts` never inlines its `Buffer` /
 * `node:fs` code).
 *
 * Some CommonJS test runners — notably Jest without `--experimental-vm-modules`
 * — cannot execute a dynamic `import()` at all. Elsewhere the repo falls back to
 * a synchronous `require()` (see `credentials.ts`, `platforms/node.ts`), but the
 * webhook handler must stay edge-safe and therefore may NOT contain `require(`.
 * Instead, such an environment (or a host that wants to plug in its own resolver)
 * can inject the resolver here.
 *
 * This module is deliberately NOT re-exported by `src/server.ts`, so it is not
 * part of the published package surface. It defaults to no injected resolver,
 * so production behavior is unchanged unless a host explicitly opts in.
 */
import type { CredentialInput } from '../security/credentials.js';

export type CredentialResolver = (c: CredentialInput) => Promise<string | object>;

let injected: CredentialResolver | undefined;

/** Provide (or clear, with `undefined`) the credential resolver. */
export function __setCredentialResolver(resolver: CredentialResolver | undefined): void {
  injected = resolver;
}

/** The injected resolver, if any. */
export function __getInjectedCredentialResolver(): CredentialResolver | undefined {
  return injected;
}
