/**
 * `contractTest` — replay a fixed set of request/response fixtures through an
 * adapter function and report pass/fail with a field-level diff for
 * mismatches. Used to pin a provider adapter's request→response contract
 * (e.g. against recorded real API responses) without a live network call.
 *
 * Implements its own small stable deep-equal + diff (no new dependency).
 */

/** The request shape passed to `adapterFn` for a single fixture. */
export interface ContractRequest {
  routeName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  params?: Record<string, unknown>;
}

export interface ContractFixture {
  /** Human-readable fixture name, surfaced in failure reports. */
  name: string;
  request: ContractRequest;
  /** The response `adapterFn(request)` is expected to resolve to. */
  expectedResponse: unknown;
}

export interface ContractFailure {
  name: string;
  /** Human-readable, path-annotated description of every mismatch found. */
  diff: string;
}

export interface ContractTestResult {
  passed: boolean;
  failed: ContractFailure[];
}

export type ContractAdapterFn = (request: ContractRequest) => Promise<unknown>;

/**
 * Run every fixture's `request` through `adapterFn` and deep-compare the
 * result against `expectedResponse`. Never throws: an adapter rejection is
 * captured and reported as a failure like any other mismatch.
 */
export async function contractTest(
  adapterFn: ContractAdapterFn,
  fixtures: ContractFixture[]
): Promise<ContractTestResult> {
  const failed: ContractFailure[] = [];

  for (const fixture of fixtures) {
    try {
      const actual = await adapterFn(fixture.request);
      if (!deepEqual(actual, fixture.expectedResponse)) {
        failed.push({ name: fixture.name, diff: diffValues(fixture.expectedResponse, actual) });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ name: fixture.name, diff: `adapterFn threw: ${message}` });
    }
  }

  return { passed: failed.length === 0, failed };
}

// ── Stable deep-equal + path diff (self-contained; no dependency) ──────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural equality: order-independent for object keys, order-sensitive for arrays. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual(a[k], b[k]));
  }

  return false;
}

function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectDiffs(expected: unknown, actual: unknown, path: string): string[] {
  if (deepEqual(expected, actual)) return [];

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: string[] = [];
    const len = Math.max(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      diffs.push(...collectDiffs(expected[i], actual[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const diffs: string[] = [];
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      diffs.push(...collectDiffs(expected[key], actual[key], `${path}.${key}`));
    }
    return diffs;
  }

  return [`${path}: expected ${stringify(expected)}, got ${stringify(actual)}`];
}

/** Human-readable, path-annotated diff between `expected` and `actual`. */
export function diffValues(expected: unknown, actual: unknown): string {
  const diffs = collectDiffs(expected, actual, '$');
  return diffs.length > 0
    ? diffs.join('\n')
    : `expected ${stringify(expected)}, got ${stringify(actual)}`;
}
