/**
 * Single source of truth for JWT decoding across the library.
 *
 * Previously six call sites each rolled their own `split('.') + atob + JSON.parse`
 * with subtly different validation (one used to crash on malformed tokens). This
 * is the one correct, never-throws implementation; everything else delegates here.
 */
export interface JWTPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Decode a JWT payload. Returns `null` for any missing/malformed/undecodable
 * token — never throws.
 */
export function parseJWT<T = JWTPayload>(token: string | null | undefined): T | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeBase64Url(base64)) as T;
  } catch {
    return null;
  }
}

/**
 * True iff the token has the structural shape of a JWT (three dot-separated
 * segments with non-empty header and payload). Says nothing about validity —
 * use it to decide whether JWT semantics (expiry checks) apply at all, vs.
 * an opaque bearer token that cannot be inspected client-side.
 */
export function isJwtShaped(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && !!parts[0] && !!parts[1];
}

function decodeBase64Url(base64: string): string {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    // UTF-8-safe decode (handles non-ASCII claims); fall back to raw binary.
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(binary, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch {
      return binary;
    }
  }
  // Node environment without atob.
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/** Token `exp` (seconds) as epoch milliseconds, or `null` if absent/unparseable. */
export function getTokenExpiry(token: string): number | null {
  const payload = parseJWT(token);
  return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
}

/** True only if the token has an `exp` claim that is in the past. No `exp` ⇒ not expired. */
export function isTokenExpired(token: string, skewMs = 0): boolean {
  const expiry = getTokenExpiry(token);
  return expiry !== null && Date.now() >= expiry - skewMs;
}
