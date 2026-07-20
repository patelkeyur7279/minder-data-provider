/**
 * Task 3.1 — Standard Schema response validation.
 *
 * The single implementation shared by both call sites (`minder()` in
 * `core/minder.ts` and `ApiClient.request()`/`requestRaw()`) — see the design
 * doc §4 "one pure helper, two thin call sites". Pure: no I/O, no side
 * effects, no dependency on either transport.
 *
 * Sync AND async validators are handled uniformly via `Promise.resolve()`,
 * which normalizes the sync-return case without changing async behavior. A
 * validator that itself throws is spec-non-compliant (Standard Schema
 * validators are contracted to return `{ issues }` on failure, never throw),
 * but is still treated as a failure here rather than crashing the request —
 * fail-closed: bad OR broken data never passes as valid.
 */
import type { StandardSchemaV1, StandardSchemaIssue } from '../types/standard-schema.js';
import { MinderError } from '../errors/MinderError.js';

/**
 * Response validation error (Task 3.1 — Standard Schema).
 *
 * Defined HERE, in the lazy-loaded validation chunk, rather than alongside the
 * other error subclasses in `errors/MinderError.ts`. Reason: that module is
 * eagerly re-exported by every top-level entry (`index`, `core`), so a class
 * living there ships in every consumer's INITIAL bundle. This class is only
 * ever constructed on the response-validation path — which is already a
 * dynamic `import('./responseValidation.js')` — so co-locating it here keeps it
 * in the deferred chunk and honors the design's "≈0 bytes when unused" promise
 * (P4). Consumers branch on the stable `error.code === 'RESPONSE_VALIDATION_FAILED'`
 * (plus `error.issues`) — the idiomatic library pattern — rather than needing
 * the class value eagerly; the concrete instance is still reachable at
 * `result.error.raw`, and the class is exported type-only from the main / core
 * entries for annotation.
 *
 * Distinct from {@link MinderValidationError} (client-side INPUT validation over
 * OUTGOING data): this fires AFTER a successful HTTP round-trip — the request
 * itself succeeded, the payload just didn't match its contract. `status` is
 * therefore the REAL HTTP status the server returned (often 200).
 */
export class MinderResponseValidationError extends MinderError {
  constructor(
    message: string,
    public issues: ReadonlyArray<StandardSchemaIssue>,
    status: number,
    code: string = 'RESPONSE_VALIDATION_FAILED'
  ) {
    super(message, code, status, { issues });
    this.name = 'MinderResponseValidationError';

    this.addSuggestion({
      message:
        'The response body failed Standard Schema validation — a server-contract violation, not a request error',
      action: 'Inspect error.issues for the failing path(s) and confirm the API response matches the configured schema',
      link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/API_REFERENCE.md#response-validation-standard-schema',
    });
  }
}

export type ValidateResponseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly StandardSchemaIssue[] };

/**
 * Validate `data` against a Standard Schema validator, awaiting the result
 * whether the validator itself is sync or async.
 */
export async function validateResponse<T>(
  data: unknown,
  schema: StandardSchemaV1<any, T>
): Promise<ValidateResponseResult<T>> {
  try {
    const result = await Promise.resolve(schema['~standard'].validate(data));
    if (result.issues) {
      return { ok: false, issues: result.issues };
    }
    return { ok: true, value: result.value };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          message:
            error instanceof Error
              ? error.message
              : 'Standard Schema validator threw an unexpected error',
        },
      ],
    };
  }
}

/**
 * Validate `data`; on success return the (possibly transformed) value, on
 * failure THROW a {@link MinderResponseValidationError}.
 *
 * The throw path — message construction, issue-count pluralization, error
 * instantiation — lives HERE, in the lazy chunk, so the eager call sites in
 * `minder()` / `ApiClient` shrink to a bare presence-guard plus this single
 * call. That keeps the synchronous cost of wiring the feature into the shared
 * request path minimal for consumers who never configure a `schema`.
 */
export async function validateResponseOrThrow<T>(
  data: unknown,
  schema: StandardSchemaV1<any, T>,
  status: number
): Promise<T> {
  const result = await validateResponse<T>(data, schema);
  if (!result.ok) {
    throw new MinderResponseValidationError(
      `Response failed schema validation (${result.issues.length} issue${result.issues.length === 1 ? '' : 's'})`,
      result.issues,
      status
    );
  }
  return result.value;
}
