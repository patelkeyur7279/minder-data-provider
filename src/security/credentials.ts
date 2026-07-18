/**
 * Typed credential model for the provider platform (F-01).
 *
 * A `CredentialInput` is the union of every way a provider adapter may be
 * told where to find a secret value:
 *   - `SecretRef`        — `secret('ENV_NAME')`, resolved via the environment
 *                           (mirrors `resolveSecret()` from `../server.js`).
 *   - `ServerConfigValue` — `{ kind: 'serverConfig', key }`, resolved by
 *                           reading the consuming app's own server config
 *                           object at resolve time.
 *   - `FileRef`           — `{ kind: 'file', source, ref }`, a credential
 *                           FILE (e.g. a Firebase service-account JSON),
 *                           resolved either from an env var holding the JSON
 *                           (`source: 'envJson'`, base64-or-plain) or from a
 *                           filesystem path (`source: 'path'`, Node only).
 *
 * ── Import-cycle decision ───────────────────────────────────────────────
 * `resolveCredential` deliberately does NOT import `resolveSecret` from
 * `../server.js`. `../server.ts` is the platform barrel: F-02 (server
 * handler core) re-exports `src/server/webhooks.ts` from it, and
 * `webhooks.ts` needs `resolveCredential` (its `WebhookVerifyOptions.secret`
 * is a `CredentialInput`). If this module imported from `../server.js`, the
 * result would be:
 *     credentials.ts → server.ts (barrel) → server/webhooks.ts → credentials.ts
 * — a cycle. Instead, this module imports only `SecretRef`/`isSecretRef`
 * from `./secrets.js` (a leaf module with no dependents in this graph) and
 * re-implements the SecretRef-resolution branch inline, matching
 * `resolveSecret()`'s semantics exactly (prefer the value captured at
 * `secret()` construction time, else fall back to `process.env[name]`, else
 * throw naming the secret). Keep the two in sync if either changes.
 *
 * ── Edge-safety ─────────────────────────────────────────────────────────
 * This module has no top-level Node-only imports. The `fs` module is only
 * ever brought in via a dynamic `import()` INSIDE `resolveCredential`, and
 * only on the `file`/`path` branch — so the module stays importable
 * (unexecuted paths aside) in edge bundles. The `node:fs` specifier is loaded
 * through a runtime variable + `webpackIgnore` so browser bundlers neither
 * emit a "Can't resolve 'fs'" warning nor pull it into the client graph
 * (M2-05).
 *
 * ── No-leak invariant ───────────────────────────────────────────────────
 * No error thrown by `resolveCredential` may ever include the resolved
 * secret/file/env CONTENTS — only the ref name, env var name, or file path
 * that identifies it. `describeCredential` never resolves or returns a
 * value at all; it returns a masked label plus a presence boolean.
 */
import { SecretRef, isSecretRef } from './secrets.js';

/** `secret('ENV_NAME')` — resolved via the environment, same as `resolveSecret()`. */
export type EnvSecret = SecretRef;

/** Resolved by reading the consuming app's own server config object at resolve time. */
export interface ServerConfigValue {
  kind: 'serverConfig';
  key: string;
}

/** A credential FILE (e.g. Firebase service-account JSON), server-side only. */
export interface FileRef {
  kind: 'file';
  source: 'path' | 'envJson';
  ref: string;
}

export type CredentialInput = SecretRef | ServerConfigValue | FileRef;

/** Runtime guard: narrows `unknown` to `CredentialInput`. */
export function isCredentialInput(v: unknown): v is CredentialInput {
  if (isSecretRef(v)) return true;
  if (v == null || typeof v !== 'object') return false;

  const o = v as Record<string, unknown>;

  if (o.kind === 'serverConfig') {
    return typeof o.key === 'string' && o.key.length > 0;
  }

  if (o.kind === 'file') {
    return (
      (o.source === 'path' || o.source === 'envJson') &&
      typeof o.ref === 'string' &&
      o.ref.length > 0
    );
  }

  return false;
}

const isBrowser = (): boolean => typeof window !== 'undefined';

const readEnv = (name: string): string | undefined =>
  typeof process !== 'undefined' && process.env ? process.env[name] : undefined;

/**
 * Decode `raw` as JSON, trying it as-is first and, if that fails, as a
 * base64-encoded JSON payload. Returns `undefined` (never throws) if
 * neither interpretation yields valid JSON — callers decide how to report
 * that without echoing `raw` itself.
 */
function parseJsonMaybeBase64(raw: string): object | undefined {
  try {
    return JSON.parse(raw) as object;
  } catch {
    // fall through to base64 attempt
  }

  try {
    const decoded = decodeBase64(raw);
    return JSON.parse(decoded) as object;
  } catch {
    return undefined;
  }
}

/**
 * Base64 → utf8, without a top-level Node dependency (works in edge
 * runtimes too). Mirrors `decodeBase64Url()` in `../utils/jwt.ts`: prefer
 * `atob` + `decodeURIComponent` (UTF-8-safe, works wherever `atob` is
 * available — browsers, edge runtimes, and jsdom test environments, none of
 * which reliably expose a global `TextDecoder`), falling back to `Buffer`
 * only on plain Node without `atob`.
 */
function decodeBase64(input: string): string {
  if (typeof atob === 'function') {
    const binary = atob(input);
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(binary, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch {
      return binary;
    }
  }
  // Node environment without atob.
  return Buffer.from(input, 'base64').toString('utf8');
}

/**
 * Resolve a `CredentialInput` to its real value. SERVER-ONLY: throws
 * immediately if called where `window` is defined, mirroring
 * `resolveSecret()`'s guard so a credential can never be revealed
 * client-side.
 *
 * - `SecretRef` → resolves like `resolveSecret()` (see cycle-decision note
 *   above): the value captured at `secret()` construction time, else
 *   `process.env[name]`, else throws naming the secret.
 * - `{ kind: 'serverConfig' }` → reads `serverConfig?.[key]`; throws naming
 *   the key if absent.
 * - `{ kind: 'file', source: 'envJson' }` → reads `process.env[ref]`,
 *   parses it as JSON (raw or base64-encoded).
 * - `{ kind: 'file', source: 'path' }` → dynamically imports `node:fs`
 *   (Node only) and reads + parses the file at `ref`.
 *
 * No thrown error ever includes secret/file/env CONTENTS — only the name or
 * path identifying the credential.
 */
export async function resolveCredential(
  c: CredentialInput,
  serverConfig?: Record<string, unknown>
): Promise<string | object> {
  if (isBrowser()) {
    throw new Error('[Minder] resolveCredential() must only be called on the server.');
  }

  if (isSecretRef(c)) {
    if (c.hasValue()) return c.reveal();
    const v = readEnv(c.name);
    if (v == null) {
      throw new Error(`[Minder] Secret "${c.name}" is not set in the server environment.`);
    }
    return v;
  }

  if (c.kind === 'serverConfig') {
    const v = serverConfig?.[c.key];
    if (v === undefined) {
      throw new Error(
        `[Minder] Server config value "${c.key}" is not set. Provide it via the ` +
          `serverConfig passed to resolveCredential().`
      );
    }
    return v as string | object;
  }

  if (c.kind === 'file') {
    if (c.source === 'envJson') {
      const raw = readEnv(c.ref);
      if (raw == null) {
        throw new Error(`[Minder] Credential env var "${c.ref}" is not set.`);
      }
      const parsed = parseJsonMaybeBase64(raw);
      if (parsed === undefined) {
        throw new Error(
          `[Minder] Credential env var "${c.ref}" does not contain valid JSON ` +
            `(checked both raw and base64-decoded).`
        );
      }
      return parsed;
    }

    // source === 'path' — Node only. The `node:fs` specifier is loaded through
    // a runtime-computed variable so bundlers targeting the browser (webpack in
    // the Next.js example) neither statically resolve it — which produced a
    // spurious "Can't resolve 'fs'" warning — nor descend into it: this branch
    // is unreachable in a browser (resolveCredential throws first). The
    // webpackIgnore hint keeps the dynamic import out of the client graph
    // entirely; the require fallback covers CJS test runners that can't execute
    // a dynamic import() of a builtin.
    const fsSpecifier = 'node:fs';
    let readFileSync: (path: string, encoding: 'utf8') => string;
    try {
      readFileSync = (await import(/* webpackIgnore: true */ fsSpecifier)).readFileSync;
    } catch {
      readFileSync = require(fsSpecifier).readFileSync;
    }

    let contents: string;
    try {
      contents = readFileSync(c.ref, 'utf8');
    } catch {
      throw new Error(`[Minder] Credential file at path "${c.ref}" could not be read.`);
    }

    try {
      return JSON.parse(contents) as object;
    } catch {
      throw new Error(`[Minder] Credential file at path "${c.ref}" does not contain valid JSON.`);
    }
  }

  throw new Error('[Minder] resolveCredential() received an unrecognized CredentialInput.');
}

/** At most the first 4 characters of `name`, plus a fixed mask suffix. */
function maskLabel(name: string): string {
  return `${name.slice(0, 4)}***`;
}

/**
 * Describe a `CredentialInput` WITHOUT resolving it — safe to call
 * anywhere, including the browser. Never returns the value; `label` is
 * masked (at most the first 4 characters of the underlying name/key/path)
 * and `present` is a presence check only:
 *   - server-side: checks `process.env` (for `env`/`envJson` credentials);
 *     `serverConfig` and file-`path` presence cannot be determined without
 *     the app's server config / a filesystem read, so they report `false`.
 *   - browser-side: always `false` (no env access from the client).
 */
export function describeCredential(c: CredentialInput): {
  kind: string;
  label: string;
  present: boolean;
} {
  if (isSecretRef(c)) {
    const present = !isBrowser() && (c.hasValue() || readEnv(c.name) != null);
    return { kind: 'env', label: maskLabel(c.name), present };
  }

  if (c.kind === 'serverConfig') {
    // No serverConfig object is available here by design (describeCredential
    // never touches app config or files) — presence is unknowable, so it is
    // conservatively reported as not present.
    return { kind: 'serverConfig', label: maskLabel(c.key), present: false };
  }

  // c.kind === 'file'
  const present =
    !isBrowser() && c.source === 'envJson' ? readEnv(c.ref) != null : false;
  return { kind: 'file', label: maskLabel(c.ref), present };
}
