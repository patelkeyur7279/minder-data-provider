/**
 * Config schema validation + server-only key enforcement.
 *
 * "Bring your own config" only works well if mistakes surface as ONE clear,
 * actionable report instead of a cryptic runtime crash three layers down. This
 * module inspects a raw `UnifiedMinderConfig`-shaped object (as passed to
 * `configureMinder`) and returns every problem it can find in a single pass,
 * each with an exact key and a concrete fix.
 *
 * It also enforces a registry of "server-only" config keys: keys that must
 * never hold a raw (non-`SecretRef`) value in a browser-like environment. This
 * composes with — does NOT replace — `assertNoExposedSecrets` from
 * `../security/secrets.js`, which pattern-matches secret-*shaped* values
 * anywhere in the config. This module instead hard-fails on specific,
 * registered key *paths*, regardless of whether the value looks secret-shaped.
 */
import { isSecretRef, SUSPICIOUS_KEY } from '../security/secrets.js';
import { isCredentialInput } from '../security/credentials.js';
import { levenshteinDistance } from '../utils/routeHelpers.js';

export interface ConfigError {
  /** Dot-path of the offending key, e.g. "routes.users" or "performance.timeout". */
  key: string;
  /** Human-readable description of what's wrong. */
  message: string;
  /** A concrete, actionable fix the developer can apply. */
  fix: string;
  /**
   * "error" entries make `valid` false and are included when `configureMinder`
   * throws. "warning" entries (e.g. unknown keys) are surfaced but never block
   * configuration on their own.
   */
  level: 'error' | 'warning';
}

export interface ValidateConfigResult {
  valid: boolean;
  errors: ConfigError[];
}

/**
 * Top-level keys recognized on the `UnifiedMinderConfig` surface accepted by
 * `configureMinder` (see `./index.ts`). Keep this list in sync with that
 * interface. `providers` is a reserved, currently-unused namespace — see
 * `serverOnlyKeys` below.
 */
export const KNOWN_TOP_LEVEL_KEYS = [
  'apiUrl',
  'apiBaseUrl',
  'routes',
  'dynamic',
  'auth',
  'cache',
  'cors',
  'corsHelper',
  'websocket',
  'security',
  'debug',
  'performance',
  'ssr',
  'environments',
  'providers',
] as const;

/**
 * Registry of config key PATHS (dot-notation, `*` matches any single segment)
 * whose value must be a `SecretRef` (from `secret()`) — never a raw value — in
 * a browser-like environment (`typeof window !== 'undefined'`).
 *
 * Real, concrete server-only keys were checked against `src/core/types.ts` at
 * the time this registry was created (`MinderConfig`, `AuthConfig`,
 * `CorsHelperConfig`, etc.) — none exist yet (no `auth.refreshSecret` /
 * `proxy.targetAuthToken` fields are defined). Rather than invent fields that
 * don't exist on the real config surface, this registers the MECHANISM plus a
 * documented placeholder namespace for the provider-plugin system: any
 * `providers.<name>.serverOnly` value is enforced today, and this array is the
 * single place to register additional real keys (e.g. `auth.refreshSecret`)
 * as they're added to `MinderConfig`.
 */
export const serverOnlyKeys: string[] = ['providers.*.serverOnly'];

// ── URL validation ──────────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol) && Boolean(url.host);
  } catch {
    return false;
  }
}

// ── Non-negative number validation ──────────────────────────────────────────

function validateNonNegativeNumber(value: unknown, key: string): ConfigError | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return {
      key,
      message: `"${key}" must be a non-negative number (got ${JSON.stringify(value)}).`,
      fix: `Set ${key} to 0 or a positive number, e.g. "${key}": 3000.`,
      level: 'error',
    };
  }
  return null;
}

// ── Nearest-key suggestion (mirrors getRouteSuggestions' levenshtein logic) ─

function nearestKnownKey(key: string, knownKeys: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of knownKeys) {
    const distance = levenshteinDistance(key.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

// ── serverOnly key enforcement ──────────────────────────────────────────────

function pathMatchesPattern(path: string[], pattern: string[]): boolean {
  if (path.length !== pattern.length) return false;
  return path.every((segment, i) => pattern[i] === '*' || pattern[i] === segment);
}

function findServerOnlyViolations(cfg: Record<string, unknown>): ConfigError[] {
  const errors: ConfigError[] = [];
  const patterns = serverOnlyKeys.map((p) => p.split('.'));
  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string[]): void => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = [...path, key];

      if (patterns.some((pattern) => pathMatchesPattern(childPath, pattern))) {
        if (child !== undefined && child !== null && !isSecretRef(child)) {
          const dotPath = childPath.join('.');
          errors.push({
            key: dotPath,
            message:
              `"${dotPath}" is a server-only value and must not hold a raw value in a ` +
              `browser-like environment (it would ship in the client bundle).`,
            fix: `Move ${dotPath} to server config or wrap it with secret('ENV_VAR_NAME').`,
            level: 'error',
          });
        }
        continue; // matched leaf — don't also walk into it
      }

      walk(child, childPath);
    }
  };

  walk(cfg, []);
  return errors;
}

/**
 * `providers.*` heuristic enforcement — browser-like environments only.
 *
 * Composes with (does not replace) `findServerOnlyViolations` above, which
 * hard-fails specific REGISTERED key paths (e.g. `providers.*.serverOnly`)
 * regardless of the key's name. This walker instead inspects every key
 * under `providers` and flags any RAW STRING value whose key name looks
 * secret-shaped (`SUSPICIOUS_KEY`, shared with `security/secrets.ts`'s
 * `findExposedSecrets`) and is not already a valid `CredentialInput`
 * (`security/credentials.ts`'s `secret()`/serverConfig/file refs) — e.g.
 * `providers.stripe.secretKey = 'sk_live_...'` typed directly into client
 * config instead of `secret('STRIPE_SECRET_KEY')`.
 */
function findSuspiciousProviderKeyViolations(cfg: Record<string, unknown>): ConfigError[] {
  const errors: ConfigError[] = [];

  const providers = cfg.providers;
  if (providers == null || typeof providers !== 'object' || Array.isArray(providers)) {
    return errors;
  }

  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string[]): void => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = [...path, key];

      if (isCredentialInput(child)) continue; // secret()/serverConfig/file refs are safe — never descend into them

      if (typeof child === 'string' && SUSPICIOUS_KEY.test(key)) {
        const dotPath = childPath.join('.');
        errors.push({
          key: dotPath,
          message:
            `"${dotPath}" looks like a secret (its key name is "${key}") but holds a raw string in a ` +
            `browser-like environment (it would ship in the client bundle).`,
          fix: `wrap it with secret('ENV_NAME') or move it to server-side config`,
          level: 'error',
        });
        continue;
      }

      walk(child, childPath);
    }
  };

  walk(providers, ['providers']);
  return errors;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Validate a raw `UnifiedMinderConfig`-shaped object and return every problem
 * found, each with an exact key and a concrete fix. Never throws — callers
 * (e.g. `configureMinder`) decide what to do with the result.
 */
export function validateMinderConfig(config: unknown): ValidateConfigResult {
  const errors: ConfigError[] = [];

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: true, errors };
  }

  const cfg = config as Record<string, unknown>;

  // 1. apiUrl / apiBaseUrl must be a valid absolute URL when present.
  for (const field of ['apiUrl', 'apiBaseUrl'] as const) {
    const value = cfg[field];
    if (value === undefined || value === null) continue;

    if (typeof value !== 'string' || !isValidUrl(value)) {
      errors.push({
        key: field,
        message:
          typeof value === 'string'
            ? `"${field}" must be a valid absolute URL (got "${value}").`
            : `"${field}" must be a valid absolute URL string.`,
        fix: `Set ${field} to a fully-qualified URL, e.g. "https://api.example.com".`,
        level: 'error',
      });
    }
  }

  // 2. routes entries must have `url` + `method` when given as ApiRoute objects.
  //    String routes (shorthand, auto-generates CRUD operations) are exempt.
  if (cfg.routes !== undefined && cfg.routes !== null && typeof cfg.routes === 'object' && !Array.isArray(cfg.routes)) {
    for (const [name, route] of Object.entries(cfg.routes as Record<string, unknown>)) {
      if (route == null || typeof route !== 'object' || Array.isArray(route)) continue;

      const r = route as Record<string, unknown>;
      const missing: string[] = [];
      if (typeof r.url !== 'string' || r.url.length === 0) missing.push('url');
      if (r.method === undefined || r.method === null || r.method === '') missing.push('method');

      if (missing.length > 0) {
        errors.push({
          key: `routes.${name}`,
          message: `Route "${name}" is missing ${missing.map((m) => `"${m}"`).join(' and ')}.`,
          fix: `Add ${missing.join(' and ')} to routes.${name}, e.g. { method: 'GET', url: '/${name}' }.`,
          level: 'error',
        });
      }

      if (r.timeout !== undefined) {
        const err = validateNonNegativeNumber(r.timeout, `routes.${name}.timeout`);
        if (err) errors.push(err);
      }
    }
  }

  // 3. timeout / retries must be non-negative numbers, wherever they appear.
  if (cfg.performance !== undefined && cfg.performance !== null && typeof cfg.performance === 'object') {
    const perf = cfg.performance as Record<string, unknown>;
    if (perf.timeout !== undefined) {
      const err = validateNonNegativeNumber(perf.timeout, 'performance.timeout');
      if (err) errors.push(err);
    }
    if (perf.retries !== undefined) {
      const err = validateNonNegativeNumber(perf.retries, 'performance.retries');
      if (err) errors.push(err);
    }
  }
  if (cfg.timeout !== undefined) {
    const err = validateNonNegativeNumber(cfg.timeout, 'timeout');
    if (err) errors.push(err);
  }
  if (cfg.retries !== undefined) {
    const err = validateNonNegativeNumber(cfg.retries, 'retries');
    if (err) errors.push(err);
  }

  // 4. Unknown top-level keys -> warning, with nearest-known-key suggestion.
  for (const key of Object.keys(cfg)) {
    if ((KNOWN_TOP_LEVEL_KEYS as readonly string[]).includes(key)) continue;

    const suggestion = nearestKnownKey(key, KNOWN_TOP_LEVEL_KEYS);
    errors.push({
      key,
      message: `Unknown configuration key "${key}".`,
      fix: suggestion
        ? `Did you mean "${suggestion}"? Remove "${key}" if it was a typo, or ignore this warning if it's intentional.`
        : `Remove "${key}" if it was a typo, or ignore this warning if it's intentional.`,
      level: 'warning',
    });
  }

  // 5. serverOnly key enforcement + suspicious-key heuristic — browser-like environments only.
  if (typeof window !== 'undefined') {
    errors.push(...findServerOnlyViolations(cfg));
    errors.push(...findSuspiciousProviderKeyViolations(cfg));
  }

  const valid = !errors.some((e) => e.level === 'error');
  return { valid, errors };
}
