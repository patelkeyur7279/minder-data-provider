/**
 * fix-2.2.0-blockers (SHOULD-FIX, dedup/cache-key divergence class — see
 * ApiClient.ts's own dedup-key comment for the two PRIOR rounds of this same
 * bug: first `method`+`url` only, then a bare `JSON.stringify(requestConfig)`
 * that silently omitted every function-valued field). `paramsSerializer` was
 * added to the per-call forwardable allowlist (apiClient/requestOptions.ts)
 * and IS wire-affecting — it changes HOW `params` gets encoded into the
 * actual query string — but `JSON.stringify` drops function values from an
 * object entirely, so two concurrent `apiClient.request()` calls differing
 * ONLY in `paramsSerializer` computed the SAME cache key and collapsed into
 * one wire request, with the second caller silently receiving the first
 * caller's body. The same blind spot exists for ANY other function-valued
 * axios option (present or future) and for values `JSON.stringify` can't see
 * into at all — `URLSearchParams`/`FormData` have no enumerable own
 * properties, so they stringify to `{}` regardless of their actual content.
 *
 * Rather than special-casing `paramsSerializer` (exactly the kind of
 * hand-maintained field list the file's own history warns against — see
 * ApiClient.ts's dedup-key comment), this walks `requestConfig` via
 * `JSON.stringify`'s own replacer and repairs the THREE ways it can silently
 * lose wire-affecting information, generically, for any field:
 *
 *   - function values (would otherwise vanish): tagged with a STABLE id keyed
 *     by reference identity — the SAME function reference always produces the
 *     SAME tag (so two calls sharing one bound callback still dedup
 *     together), but two DIFFERENT function references NEVER collide, even if
 *     their source text happens to be identical. Errs toward SPLITTING dedup
 *     groups (more wire requests, never a wrong shared response) rather than
 *     trying to guess which functions are "purely local" — that judgment call
 *     is exactly what caused the `paramsSerializer` gap in the first place.
 *   - `URLSearchParams` (no enumerable own properties, would stringify to
 *     `{}`): replaced with its actual serialized query string — the thing
 *     that actually reaches the wire.
 *   - `FormData` (same blind spot): replaced with its ordered field list;
 *     file/blob entries are described by name/size/type (their content is
 *     inherently async to read and is not needed to distinguish requests for
 *     dedup purposes).
 *
 * Everything else (plain objects, arrays, strings, numbers, headers, the
 * already-sanitized `data`) still goes through `JSON.stringify`'s own
 * recursive walk unchanged — there is no hand-maintained field list to drift
 * out of sync with `requestConfig` the next time a new option is added.
 */

const nonSerializableRefIds = new WeakMap<object, number>();
let nextNonSerializableRefId = 1;

/** Stable id for a value `JSON.stringify` can't represent, keyed by reference identity. */
function stableRefId(value: object): number {
  let id = nonSerializableRefIds.get(value);
  if (id === undefined) {
    id = nextNonSerializableRefId++;
    nonSerializableRefIds.set(value, id);
  }
  return id;
}

/** Describes one FormData entry without reading a File/Blob's async content. */
function describeFormDataValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const file = value as { name?: string; size?: number; type?: string };
  return `[file:${file?.name ?? ''}:${file?.size ?? ''}:${file?.type ?? ''}]`;
}

/**
 * Builds the dedup/cache-key string for a fully-assembled axios request
 * config. See the module doc comment above for what this fixes and why.
 */
export function serializeRequestConfigForDedupKey(requestConfig: unknown): string {
  return JSON.stringify(requestConfig, (_key: string, val: unknown) => {
    if (typeof val === 'function') {
      return { __mdpFn: stableRefId(val as unknown as object) };
    }
    if (typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams) {
      return { __mdpUsp: val.toString() };
    }
    if (typeof FormData !== 'undefined' && val instanceof FormData) {
      const entries: Array<[string, string]> = [];
      (val as FormData).forEach((v, k) => entries.push([k, describeFormDataValue(v)]));
      return { __mdpFd: entries };
    }
    return val;
  }) ?? 'undefined';
}
