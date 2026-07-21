/**
 * `expectNoSecretLeak` — run a function while capturing everything it logs to
 * the console, then scan the captured output for secret-shaped values using
 * the same heuristics `minder-data-provider`'s security layer uses to guard
 * client bundles (`findExposedSecrets` / `SUSPICIOUS_KEY` from
 * `../security/secrets.js`). Throws a descriptive error listing every
 * offending location when a leak is found. The original console methods are
 * always restored, even if `fn` throws/rejects.
 */
import { findExposedSecrets, SUSPICIOUS_KEY } from '../security/secrets.js';

type CapturedConsoleMethod = 'log' | 'warn' | 'error' | 'info';

const CAPTURED_METHODS: CapturedConsoleMethod[] = ['log', 'warn', 'error', 'info'];

interface SecretLeakFinding {
  method: CapturedConsoleMethod;
  argIndex: number;
  path: string;
  reason: string;
}

/**
 * Run `fn` (sync or async) with `console.log`/`warn`/`error`/`info` captured
 * instead of writing to the real console. After `fn` settles, every captured
 * argument is scanned (deeply, via `findExposedSecrets`) for secret-shaped
 * values. Throws if any are found; always restores the console first.
 */
export async function expectNoSecretLeak(fn: () => unknown | Promise<unknown>): Promise<void> {
  const original = {} as Record<CapturedConsoleMethod, (...args: unknown[]) => void>;
  const captured: { method: CapturedConsoleMethod; args: unknown[] }[] = [];

  for (const method of CAPTURED_METHODS) {
    original[method] = console[method];
    console[method] = (...args: unknown[]) => {
      captured.push({ method, args });
    };
  }

  try {
    await fn();
  } finally {
    for (const method of CAPTURED_METHODS) {
      console[method] = original[method];
    }
  }

  const findings: SecretLeakFinding[] = [];

  for (const { method, args } of captured) {
    args.forEach((arg, argIndex) => {
      for (const exposed of findExposedSecrets(arg)) {
        findings.push({ method, argIndex, path: exposed.path, reason: exposed.reason });
      }

      // console.log('apiKey', rawValue) style calls: a secret-like label
      // immediately followed by a plain string value. findExposedSecrets can't
      // catch this on its own since the two are separate top-level arguments
      // with no shared object key to anchor the "suspicious key" heuristic to.
      if (typeof arg === 'string' && SUSPICIOUS_KEY.test(arg)) {
        const next = args[argIndex + 1];
        if (typeof next === 'string' && next.trim().length >= 8) {
          findings.push({
            method,
            argIndex: argIndex + 1,
            path: arg,
            reason: `raw string value following secret-like label "${arg}"`,
          });
        }
      }
    });
  }

  if (findings.length > 0) {
    const list = findings
      .map((f) => `  • console.${f.method}(...) arg[${f.argIndex}] at "${f.path}" — ${f.reason}`)
      .join('\n');
    throw new Error(`expectNoSecretLeak: secret-shaped value(s) were logged to the console:\n${list}`);
  }
}
