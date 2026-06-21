/**
 * Secret-key safety boundary.
 *
 * "Bring your API keys + a config file" is only safe if SECRET keys never reach
 * the client bundle. This module provides:
 *   - `secret(name)`  → a SecretRef whose value lives only on the server.
 *   - `env(name)`     → a plain string for NON-secret values (safe to inline).
 *   - `SecretRef`     → non-stringifiable (toString/toJSON → "[SECRET:NAME]") so
 *                       it can never be serialized into a bundle or leaked in logs.
 *   - `assertNoExposedSecrets(config)` → throws (client runtime only) if a raw
 *                       secret-shaped value is found in config, with a fix hint.
 *   - `redactSecrets(value)` → safe copy for logging.
 *
 * Server-side resolution lives in `minder-data-provider/server` (resolveSecret).
 */
import { MinderConfigError } from '../errors/MinderError.js';

const SECRET_BRAND = Symbol.for('minder.secret');

const isServer = (): boolean => typeof window === 'undefined';

const readEnv = (name: string): string | undefined =>
  typeof process !== 'undefined' && process.env ? process.env[name] : undefined;

/**
 * A reference to a secret value. Non-stringifiable on purpose: serializing or
 * logging it yields only the name marker, never the value.
 */
export class SecretRef {
  readonly name: string;
  private readonly _value?: string;
  readonly [SECRET_BRAND] = true as const;

  constructor(name: string, value?: string) {
    this.name = name;
    this._value = value;
  }

  /** True if the underlying value is available in this environment (server). */
  hasValue(): boolean {
    return this._value !== undefined;
  }

  /** Reveal the value (server only). Throws if unavailable. */
  reveal(): string {
    if (this._value === undefined) {
      throw new Error(
        `[Minder] Secret "${this.name}" has no value in this environment. ` +
        `Resolve it on the server via resolveSecret() from "minder-data-provider/server".`
      );
    }
    return this._value;
  }

  toString(): string {
    return `[SECRET:${this.name}]`;
  }

  toJSON(): string {
    return `[SECRET:${this.name}]`;
  }

  /* c8 ignore next 3 */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `[SECRET:${this.name}]`;
  }
}

export function isSecretRef(value: unknown): value is SecretRef {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[SECRET_BRAND] === true
  );
}

/**
 * Mark a value as a SECRET that must never ship to the client. On the server the
 * value is resolved from `process.env[name]` (or an explicit override); on the
 * client only the name marker exists.
 */
export function secret(name: string, value?: string): SecretRef {
  const resolved = isServer() ? (value !== undefined ? value : readEnv(name)) : undefined;
  return new SecretRef(name, resolved);
}

/**
 * Read a NON-secret value from the environment (publishable keys, base URLs).
 * Returns a plain string — safe to inline in a client bundle. Do NOT use for
 * secret keys (use `secret()`).
 */
export function env(name: string, fallback = ''): string {
  const v = readEnv(name);
  return v != null ? String(v) : fallback;
}

// ── Detection of raw (exposed) secret values ────────────────────────────────

const SECRET_VALUE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/, label: 'Stripe secret key' },
  { re: /\brk_(?:live|test)_[A-Za-z0-9]{8,}/, label: 'Stripe restricted key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key id' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |)PRIVATE KEY-----/, label: 'private key (PEM)' },
  { re: /\bghp_[A-Za-z0-9]{30,}/, label: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{30,}/, label: 'GitHub fine-grained token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
  { re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, label: 'SendGrid API key' },
];

const SUSPICIOUS_KEY =
  /(secret|password|passwd|private[_-]?key|client[_-]?secret|api[_-]?secret|access[_-]?key[_-]?secret|auth[_-]?token|service[_-]?account)/i;

export interface ExposedSecret {
  path: string;
  reason: string;
}

/**
 * Recursively scan a config object for raw secret-shaped values. SecretRef
 * values and functions (model classes) are ignored — they are safe.
 */
export function findExposedSecrets(config: unknown): ExposedSecret[] {
  const found: ExposedSecret[] = [];
  const seen = new WeakSet<object>();

  const walk = (val: unknown, path: string, keyName?: string): void => {
    if (val == null || isSecretRef(val) || typeof val === 'function') return;

    if (typeof val === 'string') {
      for (const { re, label } of SECRET_VALUE_PATTERNS) {
        if (re.test(val)) {
          found.push({ path: path || '(root)', reason: `looks like a ${label}` });
          return;
        }
      }
      if (keyName && SUSPICIOUS_KEY.test(keyName) && val.trim().length >= 8) {
        found.push({ path: path || '(root)', reason: `raw string under secret-like key "${keyName}"` });
      }
      return;
    }

    if (typeof val !== 'object') return;
    if (seen.has(val as object)) return;
    seen.add(val as object);

    if (Array.isArray(val)) {
      val.forEach((v, i) => walk(v, `${path}[${i}]`, keyName));
      return;
    }
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, k);
    }
  };

  walk(config, '');
  return found;
}

/**
 * Throw if a raw secret value is found in client-reachable config. No-op on the
 * server (secrets are legitimate there). This is the guard wired into config setup.
 */
export function assertNoExposedSecrets(config: unknown): void {
  if (isServer()) return; // secrets are fine server-side
  const exposed = findExposedSecrets(config);
  if (exposed.length === 0) return;

  const list = exposed.map((e) => `  • ${e.path} — ${e.reason}`).join('\n');
  throw new MinderConfigError(
    `Refusing to run: secret value(s) detected in CLIENT configuration. These would be shipped in your ` +
      `JavaScript bundle and exposed to every visitor:\n${list}\n\n` +
      `Fix: never place secret keys in client config. Use secret('ENV_VAR_NAME') (the value stays on the ` +
      `server) and call the integration through a server route, or move it server-side via ` +
      `'minder-data-provider/server'. Use env('NEXT_PUBLIC_...') only for values that are safe to be public.`,
    exposed[0]?.path,
    'CONFIG_EXPOSED_SECRET'
  );
}

/**
 * Produce a copy of `value` with SecretRefs and secret-shaped strings replaced,
 * safe for logging/telemetry.
 */
export function redactSecrets<T>(value: T): T {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (isSecretRef(v)) return `[SECRET:${v.name}]`;
    if (typeof v === 'string') {
      for (const { re } of SECRET_VALUE_PATTERNS) if (re.test(v)) return '[REDACTED]';
      return v;
    }
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SUSPICIOUS_KEY.test(k) && typeof val === 'string' ? '[REDACTED]' : walk(val);
    }
    return out;
  };

  return walk(value) as T;
}
