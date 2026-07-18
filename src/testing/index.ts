/**
 * `minder-data-provider/testing`
 *
 * A test-only toolkit for provider/adapter authors: a fully-typed `ApiClient`
 * mock, a fixture factory for building certifiable `MinderPlugin`s from a
 * `ProviderManifest`, a request/response contract-replay helper, and a
 * console-secret-leak assertion built on the same heuristics the security
 * layer uses to guard client bundles.
 *
 * Framework/test-runner agnostic: nothing here imports `jest` (or any other
 * runner) from `src` — mock functions are a minimal, self-contained
 * jest-mock-compatible shape (`.calls`, `.mockReturnValue`, …).
 */

export { createMockFn } from './mockFn.js';
export type { MockFn } from './mockFn.js';

export { mockApiClient } from './mockApiClient.js';
export type { MockApiClient, MockApiClientOverrides } from './mockApiClient.js';

export { createMockProvider } from './createMockProvider.js';
export type { MockProvider, MockProviderImpl } from './createMockProvider.js';

export { contractTest, deepEqual, diffValues } from './contractTest.js';
export type {
  ContractAdapterFn,
  ContractFixture,
  ContractRequest,
  ContractFailure,
  ContractTestResult,
} from './contractTest.js';

export { expectNoSecretLeak } from './expectNoSecretLeak.js';
