/**
 * fix-a-crud-silent-success (HIGH 5): the SAME idempotent-only retry rule
 * `core/minder.ts`'s standalone `minder()` path already enforces for its own
 * retry loop (see its `IDEMPOTENT_METHODS`/`isRetryableMethod`), applied here
 * as the equivalent gate for `ApiClient`'s axios response-interceptor retry
 * loop (`setupInterceptors`'s "Exponential Backoff Retry Logic" block), which
 * had NO method-safety check at all before this fix — it retried a POST
 * exactly like a GET.
 *
 * Per RFC 7231 §4.2.2, GET/HEAD/OPTIONS/PUT/DELETE are idempotent: resending
 * an identical request cannot produce an additional side effect beyond the
 * first successful attempt. POST (and PATCH) are NOT idempotent — resending
 * one after an apparent failure can create a SECOND record, charge a card
 * twice, etc., even though the FIRST attempt may have already reached and
 * been processed by the server (the failure the caller observed was often in
 * receiving the response, not in the server's processing).
 *
 * Confirmed on a real server: `operations.create()` (a POST) against a
 * transient failure was retried by this interceptor, so the server received
 * the SAME POST body TWICE — a real, unrequested duplicate write — while the
 * caller's `await` still observed the eventual, final rejection. This gate
 * makes that combination impossible: a non-idempotent method is refused a
 * retry outright, regardless of `retryConfig.shouldRetry` (that hook decides
 * WHETHER a given error/attempt warrants retrying an already-safe method, not
 * whether a write may be resubmitted at all — method safety is a hard
 * invariant, not a caller-configurable policy).
 */
const IDEMPOTENT_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/** True for GET/HEAD/OPTIONS/PUT/DELETE (case-insensitive); false for POST/PATCH/anything else. */
export function isIdempotentHttpMethod(method: unknown): boolean {
  return typeof method === 'string' && IDEMPOTENT_HTTP_METHODS.has(method.toUpperCase());
}
