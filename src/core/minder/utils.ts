/**
 * Utility functions for Minder data provider
 */

import type { HttpMethod, MinderError, MinderOptions } from './types.js';
import { Logger, LogLevel } from '../../utils/Logger.js';
// fix-a-app-router-crash-offline-parity (H1/H1b): the standalone minder()
// path's own no-response ("has request, no response") classification used to
// be a second, independent implementation that never consulted offline
// state at all -- see `handleError`'s network-error branch below for why
// that is the SAME "works via <MinderDataProvider>, silently no-ops
// standalone" defect shape as every other divergence this release has hit
// (sanitization no-op, DELETE-body drop, six credential-exfiltration
// channels). `buildApiError` (apiClient/errors.ts) is the ONE place that
// decides "timeout vs. offline-and-auto-queue vs. generic network error" --
// reusing it here (instead of writing a second copy) is the actual fix:
// there is structurally nowhere left for the two paths to disagree.
import { buildApiError } from '../apiClient/errors.js';
// The SAME registry ApiClient's constructor reads (getActiveOfflineManager)
// so a standalone-path auto-queue lands in the exact OfflineManager instance
// `configureMinder({ offline })` wired -- not a second, disconnected one.
import { getActiveOfflineManager } from '../../platform/offline/registry.js';

const logger = /*#__PURE__*/ new Logger('Minder', { level: LogLevel.WARN });

/**
 * Build the MinderError-shaped return value `handleError` uses for any
 * thrown value that already carries its own `code`/`status` (our own
 * `Minder*Error` subclasses -- `MinderNetworkError`, `MinderTimeoutError`,
 * `MinderOfflineError`, `MinderResponseValidationError`, ...). Extracted so
 * both the duck-typed branch below AND the no-response delegation branch
 * (which catches a THROWN `Minder*Error` from `buildApiError`) build the
 * IDENTICAL shape from a single implementation.
 *
 * NOT implemented by recursing back into `handleError(thrown)`: several
 * `Minder*Error` subclasses (e.g. `MinderNetworkError`) declare their OWN
 * `response` constructor parameter property (unrelated to axios's
 * `AxiosError.response` -- context metadata), so a thrown instance can carry
 * an own `response` key (even `undefined`-valued) that would incorrectly
 * satisfy `handleError`'s `'response' in error` axios-shaped check and route
 * into the WRONG branch (HTTP status mapping instead of the code/status this
 * function already carries).
 */
function fromMinderErrorLike(
  error: Error & { code: string; status: number; context?: Record<string, unknown>; issues?: unknown },
  solution: string = 'See error.issues (if present) or error.details for more information'
): MinderError {
  return {
    message: error.message,
    code: error.code,
    status: error.status,
    details: error.context,
    issues: error.issues as MinderError['issues'],
    solution,
  };
}

/**
 * Actionable `solution` text for the three outcomes `classifyNoResponseError`
 * (apiClient/errors.ts) can throw, keyed by `.code`. Preserves the
 * per-outcome guidance the OLD standalone-only branch hardcoded (`'Please
 * check your internet connection'` for NETWORK_ERROR) instead of falling
 * back to `fromMinderErrorLike`'s generic "see error.issues" default, which
 * doesn't apply to a network failure (there are no `.issues`).
 */
const NO_RESPONSE_SOLUTIONS: Record<string, string> = {
  TIMEOUT_ERROR: 'The request timed out. Try increasing the timeout setting or check server performance.',
  OFFLINE_ERROR: 'Device appears to be offline. Check your internet connection and try again.',
  NETWORK_ERROR: 'Please check your internet connection.',
};

function isMinderErrorLike(
  value: unknown
): value is Error & { code: string; status: number; context?: Record<string, unknown>; issues?: unknown } {
  return (
    value instanceof Error &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { status?: unknown }).status === 'number'
  );
}

// ============================================================================
// SMART OPERATION DETECTION
// ============================================================================

/**
 * Intelligently detects the HTTP method based on the data and route
 * 
 * @param route - API route
 * @param data - Request data
 * @param options - Request options
 * @returns Detected HTTP method
 */
export function detectMethod(
  route: string,
  data: any,
  options?: MinderOptions
): HttpMethod {
  // 1. Explicit method override
  if (options?.method) {
    return options.method;
  }
  
  // 2. No data = GET request
  if (data === null || data === undefined) {
    return 'GET';
  }
  
  // 3. Route pattern detection — the final segment must actually LOOK like an
  // entity id: purely numeric (/users/123), a UUID, or a 24-hex Mongo ObjectId.
  // The previous pattern (/\/[a-zA-Z0-9-_]+$/) matched ANY final segment, so a
  // plain collection route like /api/orders was mis-detected as UPDATE and
  // creates were sent as PUT instead of POST (release-audit fix). Callers with
  // non-standard id shapes can always pass options.method explicitly.
  const hasIdInRoute =
    /\/\d+$/.test(route) ||
    /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(route) ||
    /\/[0-9a-fA-F]{24}$/.test(route);

  // 4. Data has ID field = UPDATE
  const hasIdInData = typeof data === 'object' &&
    (('id' in data && data.id) || ('_id' in data && data._id));

  if (hasIdInRoute || hasIdInData) {
    return 'PUT';
  }

  // 5. Default = POST (create)
  return 'POST';
}

/**
 * Detects if data is a file upload
 */
export function isFileUpload(data: unknown): boolean {
  if (!data) return false;

  // Guard every browser-only global with `typeof` before `instanceof`: in Node,
  // SSR, and edge runtimes `File`/`FileList` are undefined, so a bare
  // `data instanceof FileList` throws `ReferenceError: FileList is not defined`.
  // That crashed EVERY minder() write (POST/PUT/PATCH with a body) outside the
  // browser — masked in tests because jsdom provides these globals.
  return (
    (typeof File !== 'undefined' && data instanceof File) ||
    (typeof Blob !== 'undefined' && data instanceof Blob) ||
    (typeof FileList !== 'undefined' && data instanceof FileList) ||
    (typeof FormData !== 'undefined' && data instanceof FormData)
  );
}

/**
 * True ONLY in an edge runtime (Cloudflare Workers / Vercel Edge / Deno Deploy):
 * a global `fetch` exists, it is NOT Node (no `process.versions.node`), and it is
 * NOT a classic browser (no `XMLHttpRequest`). Used to pick the native-fetch
 * transport for `transport: 'auto'`/unset ONLY where axios's Node HTTP adapter is
 * unavailable — so Node and browser behavior (axios default) is unchanged, while
 * edge, where axios simply fails, transparently works. The env is injectable for
 * testing. Deliberately conservative: any doubt -> false -> axios.
 */
export function isEdgeRuntime(
  env: {
    fetch?: unknown;
    process?: { versions?: { node?: unknown } };
    XMLHttpRequest?: unknown;
  } = globalThis as unknown as { fetch?: unknown }
): boolean {
  return (
    typeof env.fetch === 'function' &&
    typeof env.process?.versions?.node === 'undefined' &&
    typeof env.XMLHttpRequest === 'undefined'
  );
}

// ============================================================================
// MODEL INTEGRATION
// ============================================================================

/**
 * Encodes data using model class (if provided)
 * Calls model.encode() method before sending to API
 */
export function encodeWithModel<T>(
  data: any,
  ModelClass?: new (...args: any[]) => T
): any {
  if (!ModelClass || !data) return data;
  
  try {
    // Type guard for static encode method
    const hasStaticEncode = (cls: any): cls is { encode: (data: any) => any } => {
      return 'encode' in cls && typeof cls.encode === 'function';
    };
    
    // If model has static encode method, use it
    if (hasStaticEncode(ModelClass)) {
      return ModelClass.encode(data);
    }
    
    // Type guard for instance encode method
    const hasEncode = (obj: any): obj is { encode: () => any } => {
      return obj && 'encode' in obj && typeof obj.encode === 'function';
    };
    
    // If model instance has encode method, use it
    const instance = new ModelClass(data);
    if (hasEncode(instance)) {
      return instance.encode();
    }
    
    return data;
  } catch (error) {
    logger.warn('Model encode failed, using raw data:', error);
    return data;
  }
}

/**
 * Decodes response data using model class (if provided)
 * Calls model.decode() or creates model instance
 */
export function decodeWithModel<T>(
  data: any,
  ModelClass?: new (...args: any[]) => T
): T | any {
  if (!ModelClass || !data) return data;
  
  try {
    // Type guard for static decode method
    const hasStaticDecode = (cls: any): cls is { decode: (data: any) => T } => {
      return 'decode' in cls && typeof cls.decode === 'function';
    };
    
    // If model has static decode method, use it
    if (hasStaticDecode(ModelClass)) {
      return ModelClass.decode(data);
    }
    
    // Create model instance (model handles decoding in constructor)
    return new ModelClass(data);
  } catch (error) {
    logger.warn('Model decode failed, using raw data:', error);
    return data;
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Converts any error to user-friendly MinderError
 * NEVER throws - always returns structured error
 */
export function handleError(error: unknown): MinderError {
  // Type narrowing for axios-like errors
  const hasResponse = error && typeof error === 'object' && 'response' in error;
  
  // Axios error
  if (hasResponse) {
    const axiosError = error as { response?: { status?: number; data?: unknown } };
    const status = axiosError.response?.status;
    
    // Map common status codes to user-friendly messages
    const errorMap: Record<number, { message: string; solution: string }> = {
      400: {
        message: 'Invalid request data',
        solution: 'Please check your input and try again'
      },
      401: {
        message: 'Authentication required',
        solution: 'Please login and try again'
      },
      403: {
        message: 'Access denied',
        solution: 'You don\'t have permission to perform this action'
      },
      404: {
        message: 'Resource not found',
        solution: 'The requested resource doesn\'t exist'
      },
      422: {
        message: 'Validation failed',
        solution: 'Please check your input fields'
      },
      429: {
        message: 'Too many requests',
        solution: 'Please wait a moment and try again'
      },
      500: {
        message: 'Server error',
        solution: 'Please try again later or contact support'
      },
      503: {
        message: 'Service unavailable',
        solution: 'The service is temporarily down, please try again later'
      },
    };
    
    const errorInfo = status ? (errorMap[status] || {
      message: 'Request failed',
      solution: 'Please try again'
    }) : {
      message: 'Request failed',
      solution: 'Please try again'
    };
    
    return {
      message: errorInfo.message,
      code: status ? `HTTP_${status}` : 'HTTP_ERROR',
      status: status || 0,
      details: axiosError.response?.data,
      solution: errorInfo.solution,
    };
  }
  
  // Network error (has request but no response)
  const hasRequest = error && typeof error === 'object' && 'request' in error;
  if (hasRequest) {
    // fix-a-app-router-crash-offline-parity (H1/H1b): delegate to the SAME
    // no-response classifier the provider path (ApiClient -> normalizeApiError
    // -> buildApiError) already uses, instead of the hand-rolled generic
    // NETWORK_ERROR this branch used to always return regardless of offline
    // configuration. `buildApiError` NEVER returns for this shape -- it
    // always throws (a genuine timeout -> MinderTimeoutError, an
    // offline/unreachable condition with an active OfflineManager -> auto-
    // queues the mutation via `offlineManager.addToQueue` THEN throws
    // MinderOfflineError, otherwise a generic MinderNetworkError) -- so the
    // throw is caught immediately below and converted via the shared
    // `fromMinderErrorLike` helper, preserving `handleError`'s own
    // never-throws contract.
    try {
      buildApiError(error, getActiveOfflineManager() ?? undefined);
    } catch (classified) {
      if (isMinderErrorLike(classified)) {
        return fromMinderErrorLike(classified, NO_RESPONSE_SOLUTIONS[classified.code]);
      }
      // Defensive fallback only -- buildApiError's no-response path always
      // throws a Minder*Error, so this should be unreachable in practice.
      return {
        message: 'Network error',
        code: 'NETWORK_ERROR',
        status: 0,
        details: classified instanceof Error ? classified.message : classified,
        solution: 'Please check your internet connection',
      };
    }
  }

  // Task 3.1 adaptation: a thrown MinderError-shaped value (e.g.
  // MinderResponseValidationError from schema validation) already carries its
  // own code/status/issues — preserve them instead of flattening to
  // UNKNOWN_ERROR below. Checked ONLY here, after the axios-shaped branches
  // above: a real (thrown-by-axios) AxiosError also has top-level `.code`/
  // `.status`, but it ALWAYS carries `.request` too (set by every axios
  // adapter), so it is already caught by `hasResponse`/`hasRequest` and never
  // reaches this point — this duck-type can only match our own errors.
  // Duck-typed (not `instanceof`) so this file never statically imports the
  // errors module, keeping the lazy-loaded response-validation feature's
  // synchronous bundle cost at zero for callers who never configure a schema.
  if (isMinderErrorLike(error)) {
    return fromMinderErrorLike(error);
  }

  // Other errors (Error instances or plain objects)
  const errorMessage = error instanceof Error
    ? error.message
    : (error && typeof error === 'object' && 'message' in error)
      ? String((error as { message: unknown }).message)
      : 'Unknown error';

  return {
    message: errorMessage,
    code: 'UNKNOWN_ERROR',
    status: 0,
    details: error,
    solution: 'Please try again or contact support',
  };
}
