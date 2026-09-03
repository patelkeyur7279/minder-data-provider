import type { AxiosRequestConfig } from 'axios';
import type { MinderConfig } from '../types.js';

/**
 * fix-percall-header-redirect-leak (ADR-B): ONE source of truth for both
 * "which header NAMES must never survive a cross-origin redirect" and
 * "which header NAMES are safe to print in a debug log". Replaces
 * `./sensitiveHeaders.ts` (an enumerated allowlist of KNOWN secret sources —
 * route-declared headers + the effective auth header + the CSRF header —
 * which leaked by omission every time a NEW source of headers was added:
 * per-call `options.headers`, `ProxyManager.getProxyHeaders()`, and any
 * header a plugin `onRequestIntercept` injects at runtime were all missing)
 * and `./errors.ts`'s old `sanitizeHeaders` (a hardcoded 5-name denylist).
 *
 * INVERSION: stop enumerating what is secret; enumerate what is provably
 * NOT secret (`NON_SENSITIVE_HEADER_NAMES`). Both derived values then read
 * from the SAME input — the FINAL, fully-assembled header map — instead of
 * a hand-maintained list of places headers might come from:
 *
 *   strip-set = names(final headers) ∪ {effective authHeader, CSRF header} − NON_SENSITIVE
 *   redaction = redact every header name ∉ NON_SENSITIVE
 *
 * Any future header source (a new plugin hook, a new proxy field, a new
 * per-call option) is covered BY CONSTRUCTION, because the input is the
 * assembled map itself, not an enumeration of contributors to it.
 *
 * BRAND (the anti-regression): `sealOutgoingRequest` is the only producer of
 * `SealedRequestConfig` in the codebase, and every transport seam is typed
 * to require one. A future dispatch path that forgets to seal its config is
 * a `tsc` compile error (`Property '[SEALED_REQUEST]' is missing`), not a
 * silent runtime leak the next adversarial probe has to rediscover.
 */

declare const SEALED_REQUEST: unique symbol;

export type SealedRequestConfig = AxiosRequestConfig & { readonly [SEALED_REQUEST]: true };

/**
 * Lowercased. Header names whose VALUES are safe to (a) forward across an
 * origin change on a redirect hop and (b) print in a debug log verbatim.
 * Everything NOT in this set is treated as a credential — bias inclusive:
 * an extra name in the strip-set is harmless (the header is simply dropped
 * on a cross-origin hop / redacted in a log line), a MISSING name leaks.
 *
 * Deliberately EXCLUDED so they redact/strip: `location` and `referer` (both
 * can carry tokens in a query string — `location` is response-only so it
 * never affects the strip-set, only redaction), and anything auth/cookie/
 * csrf-shaped by construction (never listed here).
 */
export const NON_SENSITIVE_HEADER_NAMES: ReadonlySet<string> = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'date',
  'etag',
  'expires',
  'host',
  'if-match',
  'if-none-match',
  'last-modified',
  'origin',
  'pragma',
  'retry-after',
  'server',
  'transfer-encoding',
  'user-agent',
  'vary',
  'x-requested-with',
  'x-request-id',
  'x-correlation-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]);

/** axios's own per-method default-header buckets — see `defaults.headers`. */
const AXIOS_METHOD_BUCKET_NAMES = new Set([
  'common',
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'link',
  'unlink',
]);

function isHeaderBucket(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Duck-types the Fetch API's `Headers` — the one shape whose entries are
 * NOT own-enumerable properties (unlike a plain object OR an `AxiosHeaders`
 * instance, which both store their entries directly on `this`/itself — see
 * node_modules/axios/lib/core/AxiosHeaders.js). `AxiosHeaders` has `.get`/
 * `.set`/`.has` too, so `.append` (Fetch-only) is the discriminator. */
function isWebHeadersInstance(value: unknown): value is Headers {
  const h = value as Partial<Headers> | null | undefined;
  return (
    !!h &&
    typeof h.forEach === 'function' &&
    typeof h.append === 'function' &&
    typeof h.get === 'function'
  );
}

/**
 * Every header NAME present in `headers`, regardless of shape: a plain
 * object, an `AxiosHeaders` instance (replay/retry paths hold
 * `error.config.headers`), or a Fetch API `Headers` instance. `undefined`/
 * `null` -> `[]`.
 *
 * TRAP (the single highest-risk detail here — matches the identical one
 * already documented at `ApiClient.dispatchNativeFetch`):
 * `axiosInstance.defaults.headers` is shaped
 * `{ common: {...}, get: {...}, post: {...}, 'Content-Type': '...' }` — the
 * per-method buckets are NOT header names, they are NESTED MAPS of header
 * names. Any object-valued (non-array) entry is recursed into exactly one
 * level and its keys are collected — by VALUE SHAPE, not by hardcoding the
 * bucket names, so this can never fall out of sync with axios's own bucket
 * list the way a second named list could.
 */
export function headerNamesOf(headers: unknown): string[] {
  if (!headers) return [];

  if (isWebHeadersInstance(headers)) {
    const names = new Set<string>();
    headers.forEach((_value, key) => names.add(key));
    return Array.from(names);
  }

  const names = new Set<string>();
  const obj = headers as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (isHeaderBucket(value)) {
      for (const inner of Object.keys(value)) {
        names.add(inner);
      }
      // A real per-method bucket's OWN key (e.g. "post") is never itself a
      // header name. Bias inclusive for anything else object-shaped (never
      // happens for axios/fetch in practice, but a name here is harmless).
      if (!AXIOS_METHOD_BUCKET_NAMES.has(key.toLowerCase())) {
        names.add(key);
      }
      continue;
    }
    names.add(key);
  }
  return Array.from(names);
}

/**
 * Redact every header whose name is NOT in {@link NON_SENSITIVE_HEADER_NAMES}
 * before it reaches a debug log. Replaces `errors.ts`'s old
 * `sanitizeHeaders` (a hardcoded 5-name denylist) — same call signature and
 * behavior for the names that denylist already covered (Authorization,
 * Cookie, Set-Cookie, X-CSRF-Token all redact; Content-Type passes through),
 * but now also redacts a route-declared, per-call, or custom-named auth
 * header that denylist never knew about.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redactHeadersForLog(headers: any): any {
  if (!headers) return headers;

  const isSensitive = (name: string) => !NON_SENSITIVE_HEADER_NAMES.has(name.toLowerCase());

  if (isWebHeadersInstance(headers)) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = isSensitive(key) ? '[REDACTED]' : value;
    });
    return out;
  }

  const sanitized: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(sanitized)) {
    const value = sanitized[key];
    if (isHeaderBucket(value)) {
      const innerSanitized: Record<string, unknown> = { ...value };
      for (const innerKey of Object.keys(innerSanitized)) {
        if (isSensitive(innerKey)) {
          innerSanitized[innerKey] = '[REDACTED]';
        }
      }
      sanitized[key] = innerSanitized;
      continue;
    }
    if (isSensitive(key)) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * THE choke point. Idempotent — calling it twice on an already-sealed config
 * recomputes the identical strip-set from the identical (unchanged) headers.
 * Derives the strip-set from `cfg.headers` AS THEY ARE **NOW** — including
 * any per-call `options.headers`, `ProxyManager.getProxyHeaders()` output,
 * and any header a plugin `onRequestIntercept` already injected, as long as
 * this is called AFTER those mutations (every transport seam does — see
 * ApiClient.ts / minder.ts call sites) — plus the effective auth header name
 * and the CSRF header name (added BY NAME, not by presence, since the axios
 * request interceptor injects the actual Authorization value LATER, inside
 * axios's own dispatch).
 *
 * ALWAYS overwrites `cfg.sensitiveHeaders`; never merges a caller-supplied
 * value in (`sensitiveHeaders` is deliberately absent from
 * `FORWARDABLE_REQUEST_OPTION_KEYS` — keep it that way). Mutates `cfg` in
 * place and returns the SAME object, branded.
 */
export function sealOutgoingRequest<C extends AxiosRequestConfig>(
  cfg: C,
  config: MinderConfig | null | undefined
): C & SealedRequestConfig {
  const names = new Set<string>(headerNamesOf(cfg.headers));
  names.add(config?.auth?.authHeader || 'Authorization');
  if (config?.security?.csrfProtection) {
    const csrfConfig =
      typeof config.security.csrfProtection === 'object'
        ? config.security.csrfProtection
        : { headerName: 'X-CSRF-Token' };
    names.add(csrfConfig.headerName || 'X-CSRF-Token');
  }

  cfg.sensitiveHeaders = Array.from(names).filter(
    (name) => !NON_SENSITIVE_HEADER_NAMES.has(name.toLowerCase())
  );

  return cfg as C & SealedRequestConfig;
}
