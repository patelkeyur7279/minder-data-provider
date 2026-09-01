export interface CorsMiddlewareOptions {
  /** Allowed origin(s). Default `'*'` (public API, no credentials). */
  origin?: string | RegExp | Array<string | RegExp>;
  methods?: string[];
  allowedHeaders?: string[];
  /**
   * Send `Access-Control-Allow-Credentials`. Requires an explicit `origin`
   * allowlist — combining it with a wildcard is the canonical unsafe CORS
   * configuration and is rejected (mirrors CorsManager.validateConfig()).
   * "Wildcard" here means the literal string `'*'`, an `origin` array that
   * contains `'*'`, or a `RegExp` that matches any origin (M4) — a
   * string-only `origin === '*'` check let a trivially-matching RegExp slip
   * through and reflect any Origin header with credentials enabled.
   */
  credentials?: boolean;
}

/**
 * M4: a `RegExp` that matches an arbitrary, unpredictable probe origin
 * cannot be a real allowlist entry — it matches everything (e.g. a
 * match-all-input pattern, or a caret-only anchor). Used to reject
 * `credentials: true` combined with such a regex, the same way the literal
 * `'*'` string is rejected.
 */
function isTriviallyMatchingRegex(re: RegExp): boolean {
  const probe = `https://minder-cors-guard-probe-${Math.random().toString(36).slice(2)}.invalid`;
  return re.test(probe);
}

function isWildcardEquivalent(origin: CorsMiddlewareOptions['origin']): boolean {
  if (origin === '*') return true;
  if (origin instanceof RegExp) return isTriviallyMatchingRegex(origin);
  if (Array.isArray(origin)) {
    return origin.some((entry) =>
      entry === '*' || (entry instanceof RegExp && isTriviallyMatchingRegex(entry))
    );
  }
  return false;
}

/**
 * Dependency-free CORS middleware factory (the previous implementation
 * imported the `cors` package, which was never declared as a dependency —
 * importing this module used to crash with "Cannot find module 'cors'").
 */
export function createCorsMiddleware(options: CorsMiddlewareOptions = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false,
  } = options;

  if (credentials && isWildcardEquivalent(origin)) {
    throw new Error(
      '[minder-data-provider] Refusing to create CORS middleware with credentials enabled ' +
        "and a wildcard-equivalent origin ('*', an origin array containing '*', or a RegExp that " +
        'matches any origin). Pass an explicit origin allowlist when using credentials.'
    );
  }

  const resolveAllowedOrigin = (requestOrigin: string | undefined): string | null => {
    // M4: '*' inside an array is a wildcard too, not just the bare string.
    if (origin === '*' || (Array.isArray(origin) && origin.includes('*'))) return '*';
    if (!requestOrigin) return null;
    const allowlist = Array.isArray(origin) ? origin : [origin];
    for (const allowed of allowlist) {
      if (allowed === '*') continue; // handled above; credentials+'*' already rejected at construction
      if (typeof allowed === 'string' ? allowed === requestOrigin : allowed.test(requestOrigin)) {
        return requestOrigin;
      }
    }
    return null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any): Promise<void> =>
    new Promise((resolve) => {
      const allowOrigin = resolveAllowedOrigin(req?.headers?.origin);
      if (allowOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowOrigin);
        if (allowOrigin !== '*') {
          res.setHeader('Vary', 'Origin');
        }
        if (credentials) {
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
      if (req?.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', methods.join(','));
        res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));
        res.statusCode = 204;
        res.end();
      }
      resolve();
    });
}

/**
 * Backward-compatible default: wildcard origin WITHOUT credentials.
 * (Before 2.2.0-beta.1 this default was `origin: '*'` + `credentials: true` —
 * the unsafe combination the library's own CorsManager flags.)
 */
// `/*#__PURE__*/` (A3): the factory call is a module-scope side effect that a
// `sideEffects: false` consumer would otherwise be forced to retain. Annotated
// pure so bundlers may drop this default export when unused (the server entry
// re-exports the `createCorsMiddleware` factory, not this pre-built instance).
const corsMiddleware = /*#__PURE__*/ createCorsMiddleware();

export default corsMiddleware;
