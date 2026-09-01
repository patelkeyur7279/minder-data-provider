/**
 * fix-a-hostile-route-params (RELEASE BLOCKER, structural fix): the ONE
 * detector every path that substitutes a caller-supplied value into a
 * ":param" URL-PATH segment must call before that substitution happens.
 *
 * BACKGROUND — this is the SEVENTH time in this release that a guard existed
 * on one dispatch path and a second path reached the same sink unguarded
 * (urlOverride, options.url, options.baseURL, options.proxy, requestRaw's
 * duplicate spread, minder()'s baseURL, and now this one). The value-level
 * hostile-id check already existed for `operations.update`/`operations
 * .delete` (previously duplicated inline in `useMinder.helpers.ts` as
 * `ID_PATH_HOSTILE_PATTERN`/`fullyDecodeBounded`/`describeInvalidId`), but it
 * was never applied to route-param substitution on the standalone `minder()`
 * path when a param was supplied via `options.params` — real repro (bare
 * tarball install, no jsdom, `configureMinder({ routes: { updateUser: {
 * url: '/users/:id', method: 'PUT' } } })`):
 *
 *   minder('updateUser', body, { params: { id: '..' } })
 *     -> substituteUrlParams naively does '/users/:id'.split(':id').join('..')
 *        = '/users/..', which a real HTTP client/URL parser normalizes past
 *        '/users' entirely -> PUT / (the SITE ROOT), carrying the full body.
 *   id: '5#'    -> '/users/5#' -> fragment truncates the path to '/users/5'
 *                  (a DIFFERENT real resource than intended).
 *   id: '5?a=1' -> '/users/5?a=1' -> raw '?' opens a caller-controlled query
 *                  string the caller never should have been able to inject
 *                  into the PATH segment.
 *   id: ''      -> '/users/' -> the COLLECTION, not a single resource.
 *
 * None of these throw, none are refused client-side, and none leave an
 * unresolved ":param" token behind for the existing "unresolved placeholder"
 * guard (`resolveRequest.ts`'s `hasUnresolvedRouteParam`) to catch — the
 * placeholder WAS "resolved", just to something hostile.
 *
 * THE STRUCTURAL FIX: `substituteUrlParams` (resolveRequest.ts) is already
 * the single, shared PATH-substitution function `ApiClient.request`
 * (`resolveRequest`), `ApiClient.requestRaw`, and the standalone `minder()`
 * all call — see that module's own doc comment. Calling
 * {@link validateRouteParamValue} from INSIDE `substituteUrlParams`, before a
 * param value is spliced into the URL, means every one of those three
 * dispatch paths is protected automatically, structurally, by construction —
 * a hypothetical fourth/future dispatch path can only skip this validation by
 * NOT calling `substituteUrlParams` at all, which would also mean it never
 * substitutes ":param" placeholders in the first place (a functional defect
 * anyone would notice immediately, not a silent security regression).
 *
 * `operations.update`/`operations.delete`'s own `assertValidResourceId`
 * (useMinder.helpers.ts) now delegates to {@link validateRouteParamValue}
 * too, so there is exactly ONE hostile-value detector in the codebase, not
 * two copies that can drift apart the next time either is edited.
 */

/**
 * fix-route-param-dot-segment-detector (RELEASE BLOCKER, positive-definition
 * REDESIGN): `ROUTE_PARAM_HOSTILE_PATTERN`'s literal `'..'` alternation was a
 * BLACKLIST — it named the one hostile sequence a prior probe had found, and
 * a THIRD probe then found the blacklist still missed a bare `'.'` segment
 * and every encoding of it (`%2e`, `%2E`, `%252e`, ...): `/users/.`
 * normalizes to `/users/` exactly the way `/users/..` normalizes past
 * `/users` entirely, so a lone dot is the same escape primitive, just one
 * character short. Patching in four more literals would only survive until
 * the next encoding nobody enumerated. Instead of growing the blacklist a
 * fourth time, this module now validates against a POSITIVE definition of
 * what a value must satisfy to be SAFE inside a single URL path segment,
 * split into two independent, exhaustive rules:
 *
 *   1. {@link ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN} — the value must contain
 *      NONE of the characters a URL parser assigns STRUCTURAL meaning to
 *      (divides the string into different path/query/fragment components
 *      than the caller intended): a path separator ('/' or '\\' — some
 *      parsers normalize backslash to forward-slash), a query/fragment
 *      delimiter ('?'/'#'), or a raw control character / space / DEL. This
 *      is checked and unchanged in spirit from the prior pattern; it is
 *      exhaustive because it is defined by what a URL parser treats as
 *      structural, not by which hostile string someone already tried.
 *   2. {@link ALL_DOTS_PATTERN} — the FULLY DECODED value must not be
 *      NOTHING BUT '.' characters. RFC 3986 §5.2.4 gives a lone "." segment
 *      ("stay here") and ".." ("go up one level") special meaning during
 *      path normalization; real HTTP servers/proxies/CDNs collapse both the
 *      same way even where the RFC doesn't strictly require it. Checking
 *      this against the CANONICAL, fully-decoded form (see
 *      {@link decodeRouteParamBounded}) rather than enumerating encoded
 *      spellings means '.', '..', '%2e', '%2E', '%2e%2e', '%252e',
 *      '%252e%252e', '.%2e', '%2e.', '...' and any FUTURE encoding of a
 *      dot-segment nobody has thought of yet are all refused by the SAME
 *      one rule, because they all decode to the same canonical shape.
 *
 * A value that is neither (1) structural nor (2) a bare dot-segment is,
 * by construction, ordinary resource-identifier text that fills exactly one
 * path segment and nothing else — the positive definition of "safe" this
 * module now validates against, rather than a growing negative list of
 * "hostile sequences discovered so far".
 */

/**
 * Matches any forward/back slash, a query/fragment delimiter ('?'/'#'), or a
 * raw control character / space / DEL — anywhere in the string. Any of these
 * lets a route-param value escape the single URL PATH SEGMENT a ":param"
 * placeholder is meant to fill by re-dividing the URL into different
 * components than the caller intended. See the block comment above for why
 * this is only HALF of the positive safety definition — the other half is
 * {@link ALL_DOTS_PATTERN}.
 */
// Intentional: refusing raw control characters/space/DEL in a route param is
// the fix itself, not an accidental literal.
// eslint-disable-next-line no-control-regex
export const ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN = /[/\\?#\x00-\x20\x7f]/;

/**
 * Matches a value that, once fully decoded, consists of ONE OR MORE '.'
 * characters and nothing else — a bare dot-segment. Deliberately not
 * anchored to exactly '.' or exactly '..': a segment that is nothing but
 * dots (of any length — '...', '....', ...) can never be a legitimate
 * resource identifier, so refusing the whole shape is simpler and more
 * robust than trying to enumerate exactly which lengths a given URL parser
 * happens to special-case. See the block comment above for the full
 * rationale.
 */
export const ALL_DOTS_PATTERN = /^\.+$/;

/**
 * Best-effort, bounded percent-decode so a hostile value can't smuggle a
 * traversal/separator sequence past the raw-string check by encoding it
 * (single- OR double-encoded, e.g. "%2e%2e%2f" or "%252e%252e"). Stops as
 * soon as decoding stabilizes. A malformed/overlong percent-escape (one
 * `decodeURIComponent` itself throws on) is reported as `malformed: true` —
 * a value that cannot be decoded is a value that cannot be proven safe, so
 * callers must refuse it rather than pass the still-encoded original
 * through unchanged.
 */
export function decodeRouteParamBounded(
  value: string,
  maxIterations = 5
): { decoded: string; malformed: boolean } {
  let current = value;
  for (let i = 0; i < maxIterations; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return { decoded: current, malformed: true };
    }
    if (next === current) return { decoded: current, malformed: false };
    current = next;
  }
  return { decoded: current, malformed: false };
}

/** Safely describes an arbitrary route-param value for an error message without ever throwing itself. */
export function describeRouteParamValue(value: unknown): string {
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Date) {
    return `Date(${Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()})`;
  }
  if (Array.isArray(value)) return `an array (${JSON.stringify(value)})`;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'object') return Object.prototype.toString.call(value);
  try {
    return String(value);
  } catch {
    return '<unstringifiable value>';
  }
}

/** The result of {@link validateRouteParamValue} — a discriminated pass/fail, never itself a throw. */
export type RouteParamValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

/**
 * Validates a value about to be substituted into a ":param" URL-path
 * segment. Refuses: null/undefined, any type other than string/number/
 * bigint, a non-finite number (NaN/Infinity/-Infinity), an empty or
 * whitespace-only string, a value that cannot be percent-decoded, and any
 * value containing a path separator, query/fragment delimiter, control
 * character, or traversal sequence (raw or percent-encoded, single- or
 * double-encoded). Pure — returns a result, never throws; callers decide
 * how to surface the refusal (see `resolveRequest.ts`'s `substituteUrlParams`
 * and `useMinder.helpers.ts`'s `assertValidResourceId`).
 */
export function validateRouteParamValue(value: unknown): RouteParamValidation {
  if (value === null) return { ok: false, reason: 'null' };
  if (value === undefined) return { ok: false, reason: 'undefined' };

  const valueType = typeof value;
  if (valueType !== 'string' && valueType !== 'number' && valueType !== 'bigint') {
    return {
      ok: false,
      reason: `must be a string, number, or bigint, not ${valueType} (received ${describeRouteParamValue(value)})`,
    };
  }
  if (valueType === 'number' && !Number.isFinite(value as number)) {
    return {
      ok: false,
      reason: Number.isNaN(value) ? 'NaN' : `a non-finite number (${String(value)})`,
    };
  }

  const asString = typeof value === 'string' ? value : String(value);
  if (asString.trim().length === 0) {
    return { ok: false, reason: 'empty or whitespace-only' };
  }

  const { decoded, malformed } = decodeRouteParamBounded(asString);
  if (malformed) {
    return {
      ok: false,
      reason: `contains a percent-escape that cannot be decoded, so it cannot be proven safe: ${JSON.stringify(asString)}`,
    };
  }

  // POSITIVE DEFINITION (see the block comment above ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN):
  // a value is safe to splice into a ':param' placeholder iff it contains no
  // URL-structural character — raw OR once fully decoded, since a hostile
  // character can be smuggled in single- or double-encoded — AND its fully
  // decoded canonical form is not a bare dot-segment ('.'/'..'/'...'/...).
  if (
    ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN.test(asString) ||
    ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN.test(decoded)
  ) {
    return {
      ok: false,
      reason: `contains a path separator, query/fragment delimiter, or control character: ${JSON.stringify(asString)}`,
    };
  }
  if (ALL_DOTS_PATTERN.test(decoded)) {
    return {
      ok: false,
      reason: `decodes to a bare dot-segment ("${decoded}"), which a URL parser treats as path navigation ("stay here"/"go up a level") rather than a resource identifier: ${JSON.stringify(asString)}`,
    };
  }

  return { ok: true, normalized: asString };
}
