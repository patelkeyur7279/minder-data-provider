export interface CorsMiddlewareOptions {
  /** Allowed origin(s). Default `'*'` (public API, no credentials). */
  origin?: string | RegExp | Array<string | RegExp>;
  methods?: string[];
  allowedHeaders?: string[];
  /**
   * Send `Access-Control-Allow-Credentials`. Requires an explicit `origin`
   * allowlist — combining it with the wildcard is the canonical unsafe CORS
   * configuration and is rejected (mirrors CorsManager.validateConfig()).
   */
  credentials?: boolean;
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

  if (credentials && origin === '*') {
    throw new Error(
      '[minder-data-provider] Refusing to create CORS middleware with credentials enabled ' +
        'and a wildcard origin. Pass an explicit origin allowlist when using credentials.'
    );
  }

  const resolveAllowedOrigin = (requestOrigin: string | undefined): string | null => {
    if (origin === '*') return '*';
    if (!requestOrigin) return null;
    const allowlist = Array.isArray(origin) ? origin : [origin];
    for (const allowed of allowlist) {
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
const corsMiddleware = createCorsMiddleware();

export default corsMiddleware;
