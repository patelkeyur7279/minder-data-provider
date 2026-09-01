/**
 * Type definitions for Minder data provider
 */

import type { StandardSchemaV1, StandardSchemaIssue } from '../../types/standard-schema.js';

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * HTTP methods supported by minder
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Upload progress information
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Minder operation options
 */
export interface MinderOptions<TModel = any> {
  /**
   * HTTP method override
   * If not specified, auto-detected based on data
   */
  method?: HttpMethod;

  /**
   * Model class for encode/decode
   * Your custom model class extending BaseModel
   * @example
   * model: UserModel
   */
  model?: new (...args: any[]) => TModel;

  /**
   * Opt-in runtime validation of the response body against any Standard
   * Schema validator (Zod >=3.24, Valibot, ArkType, Effect Schema, or any
   * object implementing the `~standard` interface). Distinct from `validate`
   * (client-side pre-flight over the OUTGOING data on mutations): `schema`
   * checks what the server sent back, AFTER the network round-trip. On
   * success `data` is typed as `InferOutput<S>` and replaced with the
   * validator's (possibly transformed) output; on failure `minder()` returns
   * `{ success: false, error }` with `error.code ===
   * 'RESPONSE_VALIDATION_FAILED'` — it never silently lets bad data through.
   * Wins over a route-def `schema` when both are set.
   */
  schema?: StandardSchemaV1<any, any>;

  /**
   * Upload progress callback
   * Called during file uploads
   */
  onProgress?: (progress: UploadProgress) => void;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Custom per-call Axios configuration (e.g. `responseType`, `timeout`,
   * `withCredentials`, `validateStatus`, `paramsSerializer`, `decompress`,
   * `signal`, `onUploadProgress`, `onDownloadProgress`).
   *
   * fix-2.2.0-blockers (SECURITY, BREAKING — see CHANGELOG.md): when used
   * inside a `<MinderDataProvider>` (i.e. `useMinder()`'s provider-mode
   * path, which dispatches through `ApiClient`), this is merged into the
   * SAME per-call option bag `ApiClient.request()` allowlists — only the
   * keys above ever reach the outgoing request; `url`, `baseURL`, `proxy`,
   * `adapter`, `transformRequest`, `transformResponse`, `httpAgent`,
   * `httpsAgent`, `socketPath`, and `beforeRedirect` are refused with a
   * `MinderSecurityError` (they control WHERE a request goes or HOW it is
   * physically transported, and the route's own headers — including any
   * static auth/API-key header — would otherwise travel wherever they
   * pointed). Standalone `minder()` calls (no provider) never reached these
   * fields to begin with.
   *
   * fix-2.2.0-blockers (BLOCKER 2, SECURITY — see CHANGELOG.md /
   * docs/MIGRATION_GUIDE.md): do NOT use the top-level `baseURL` field below
   * as a general way to point a call at a different host — see its own doc
   * comment for what it actually does and does not protect.
   */
  axiosConfig?: Record<string, any>;

  /**
   * Transport to use for the request.
   * - `'axios'` (default): full-featured and predictable — honors withCredentials,
   *   axiosConfig, and produces consistent error shapes.
   * - `'fetch'`: faster native-fetch fast-path for simple GET/POST requests. Does
   *   not apply axiosConfig or credentials handling — opt in only when you want
   *   the minimal-overhead path.
   * @default 'axios'
   */
  transport?: 'auto' | 'axios' | 'fetch';

  /**
   * Throw on error instead of returning a structured error result. By default
   * `minder()` never throws; set this to opt into try/catch-style error handling.
   * @default false
   */
  throwOnError?: boolean;

  /**
   * Query parameters
   */
  params?: Record<string, unknown>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Opt-in response cache for standalone minder() GET requests. Entries are
   * keyed by method+URL+params+auth-identity (a hash of token/Authorization —
   * never shared across different credentials) and capped at 200 entries.
   * @default false (no caching unless explicitly enabled)
   */
  cache?: boolean;

  /**
   * Cache time to live in milliseconds. Falls back to the global config's
   * cache.staleTime/ttl when unset.
   * @default 60000 (60 seconds)
   */
  cacheTTL?: number;

  /**
   * Enable realtime updates via WebSocket
   * @default false
   */
  realtime?: boolean;

  /**
   * Enable optimistic updates
   * @default false
   */
  optimistic?: boolean;

  /**
   * Retry transiently-failed requests (network error / 5xx / 429; never 4xx)
   * up to this many times with a small backoff. Retries apply only to
   * idempotent methods (GET/HEAD/OPTIONS/PUT/DELETE) unless
   * `retryNonIdempotent` is also set.
   * @default 0 (no retries unless explicitly enabled)
   */
  retries?: number;

  /**
   * DANGER: also retry non-idempotent methods (POST/PATCH) when `retries` is
   * set. A retried POST can duplicate a side-effectful write (double order /
   * double charge) if the server processed the original request but the
   * response was lost. Enable only when the endpoint is idempotent by design
   * (e.g. guarded by an idempotency key).
   * @default false
   */
  retryNonIdempotent?: boolean;

  /**
   * Base URL override for this one call. If not provided, uses the baseURL
   * set via `configureMinder()` / `minder.config()`.
   *
   * fix-2.2.0-blockers (BLOCKER 2, SECURITY, BREAKING — see CHANGELOG.md /
   * docs/MIGRATION_GUIDE.md): this is NOT a safe general-purpose way to send
   * a request to a different host. `minder()` throws `MinderSecurityError`
   * (`code: 'UNSAFE_REQUEST_OPTION_OVERRIDE'`) if `baseURL` is combined with
   * EITHER a registered route that declares its own `headers` (e.g. a static
   * `X-Api-Key`) OR an ambient bearer token set via `configureMinder()` /
   * `minder.config()` — in both cases the credential is attached by the
   * library, not this call, and must not silently follow a caller-chosen
   * destination. It is safe to use `baseURL` for a route/call that carries
   * NO such credential (e.g. an unregistered path with no ambient token —
   * this is what the existing "override baseURL per request" tests cover).
   *
   * `baseURL` does NOT protect against every credential path, though: it only
   * ever changes the AXIOS-level prefix. Passing an ABSOLUTE URL as the
   * `route` argument itself bypasses `baseURL` (and this guard) entirely and
   * STILL attaches an ambient token/headers to whatever host you name — a
   * documented escape hatch, not a defect, but use it deliberately, only for
   * destinations you trust with that credential.
   */
  baseURL?: string;

  /**
   * Authentication token
   * If not provided, uses stored token
   */
  token?: string;

  /**
   * Success callback
   */
  onSuccess?: (data: any) => void;

  /**
   * Error callback
   */
  onError?: (error: MinderError) => void;
}

/**
 * Minder result - NEVER throws errors
 * Always returns success or error in structured format
 */
export interface MinderResult<TData = any> {
  /**
   * Response data (null if error occurred)
   */
  data: TData | null;

  /**
   * Error information (null if successful)
   */
  error: MinderError | null;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Success flag
   */
  success: boolean;

  /**
   * Response headers
   */
  headers?: Record<string, string>;

  /**
   * Request metadata
   */
  metadata?: {
    method: HttpMethod;
    url: string;
    duration: number;
    cached: boolean;
  };
}

/**
 * Structured error - user-friendly error information
 */
export interface MinderError {
  /**
   * Error message (user-friendly)
   */
  message: string;

  /**
   * Error code
   */
  code: string;

  /**
   * HTTP status code
   */
  status: number;

  /**
   * Original error details
   */
  details?: any;

  /**
   * Suggested solution
   */
  solution?: string;

  /**
   * Standard Schema validation issues. Populated only when `code ===
   * 'RESPONSE_VALIDATION_FAILED'` (see `MinderOptions.schema` /
   * `ApiRoute.schema`); absent otherwise.
   */
  issues?: readonly StandardSchemaIssue[];
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * Global minder configuration
 * @internal
 */
export interface MinderConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  token?: string;
}
