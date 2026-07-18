/**
 * Minimal, dependency-free call-recording function.
 *
 * The testing harness must work under any test runner (Jest, Vitest, node:test, …),
 * so it cannot import `jest` from `src`. This is a tiny jest-mock-fn-compatible
 * shape: `.calls`, `.results`, `.mockReturnValue`, `.mockResolvedValue`,
 * `.mockRejectedValue`, `.mockImplementation`, `.mockReset`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface MockFn<Args extends any[] = any[], R = any> {
  (...args: Args): R;
  /** Every argument list this fn was called with, in call order. */
  calls: Args[];
  /** The return value produced for each call, in call order. */
  results: R[];
  /** Force every subsequent call to return `value`. */
  mockReturnValue(value: R): MockFn<Args, R>;
  /** Force every subsequent call to return a Promise resolved with `value`. */
  mockResolvedValue(value: Awaited<R>): MockFn<Args, R>;
  /** Force every subsequent call to return a Promise rejected with `value`. */
  mockRejectedValue(value: unknown): MockFn<Args, R>;
  /** Replace the underlying implementation entirely. */
  mockImplementation(fn: (...args: Args) => R): MockFn<Args, R>;
  /** Clear recorded calls/results and restore the original implementation. */
  mockReset(): void;
}

/**
 * Create a jest-compatible call-recording function. Safe to use from any test
 * runner since it has zero dependency on a global `jest`/`vi` object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockFn<Args extends any[] = any[], R = any>(
  initialImpl?: (...args: Args) => R
): MockFn<Args, R> {
  let implementation: ((...args: Args) => R) | undefined = initialImpl;

  const fn = ((...args: Args): R => {
    fn.calls.push(args);
    const result = implementation ? implementation(...args) : (undefined as unknown as R);
    fn.results.push(result);
    return result;
  }) as MockFn<Args, R>;

  fn.calls = [];
  fn.results = [];

  fn.mockReturnValue = (value: R) => {
    implementation = () => value;
    return fn;
  };

  fn.mockResolvedValue = (value: Awaited<R>) => {
    implementation = () => Promise.resolve(value) as unknown as R;
    return fn;
  };

  fn.mockRejectedValue = (value: unknown) => {
    implementation = () => Promise.reject(value) as unknown as R;
    return fn;
  };

  fn.mockImplementation = (newImpl: (...args: Args) => R) => {
    implementation = newImpl;
    return fn;
  };

  fn.mockReset = () => {
    fn.calls = [];
    fn.results = [];
    implementation = initialImpl;
  };

  return fn;
}
