/**
 * `mockApiClient` — a fully-typed, dependency-free stand-in for `ApiClient`'s
 * public surface, for provider/adapter authors to write unit tests against
 * without spinning up a real `ApiClient` (and its axios/auth/plugin wiring).
 *
 * Every method is a {@link MockFn} (`.calls`, `.mockReturnValue`, …) rather than
 * a real `jest.fn()` so this module works under any test runner.
 */
import type { AxiosInstance } from 'axios';
import type { ApiClient } from '../core/ApiClient.js';
import { createMockFn } from './mockFn.js';
import type { MockFn } from './mockFn.js';

/** Configuration accepted by {@link mockApiClient}. */
export interface MockApiClientOverrides {
  /**
   * Canned responses for `request(routeName, ...)`, keyed by route name.
   * When a route name has no entry, `request` resolves `{}`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responses?: Record<string, any>;
  /** Value returned by `getAxiosInstance()`. Defaults to an empty object. */
  axiosInstance?: AxiosInstance;
  /** Value returned by `getPerformanceMetrics()`. Defaults to `undefined`. */
  performanceMetrics?: ReturnType<ApiClient['getPerformanceMetrics']>;
  /**
   * Per-method implementation overrides. Wins over the `responses` /
   * `axiosInstance` / `performanceMetrics` defaults for that method.
   */
  implementations?: Partial<{
    request: ApiClient['request'];
    uploadFile: ApiClient['uploadFile'];
    createWebSocket: ApiClient['createWebSocket'];
    getAxiosInstance: ApiClient['getAxiosInstance'];
    getPerformanceMetrics: ApiClient['getPerformanceMetrics'];
    resetPerformanceMetrics: ApiClient['resetPerformanceMetrics'];
    destroy: ApiClient['destroy'];
  }>;
}

/** A fully-typed mock of `ApiClient`'s public API — one {@link MockFn} per public method. */
export interface MockApiClient {
  request: MockFn<Parameters<ApiClient['request']>, ReturnType<ApiClient['request']>>;
  uploadFile: MockFn<Parameters<ApiClient['uploadFile']>, ReturnType<ApiClient['uploadFile']>>;
  createWebSocket: MockFn<Parameters<ApiClient['createWebSocket']>, ReturnType<ApiClient['createWebSocket']>>;
  getAxiosInstance: MockFn<Parameters<ApiClient['getAxiosInstance']>, ReturnType<ApiClient['getAxiosInstance']>>;
  getPerformanceMetrics: MockFn<Parameters<ApiClient['getPerformanceMetrics']>, ReturnType<ApiClient['getPerformanceMetrics']>>;
  resetPerformanceMetrics: MockFn<Parameters<ApiClient['resetPerformanceMetrics']>, ReturnType<ApiClient['resetPerformanceMetrics']>>;
  destroy: MockFn<Parameters<ApiClient['destroy']>, ReturnType<ApiClient['destroy']>>;
}

/**
 * Build a mock matching `ApiClient`'s public surface: `request`, `uploadFile`,
 * `createWebSocket`, `getAxiosInstance`, `getPerformanceMetrics`,
 * `resetPerformanceMetrics`, `destroy`.
 *
 * `request(routeName, ...)` resolves `overrides.responses[routeName]` when
 * present, else `{}` — mirroring the shape most adapter code expects back.
 */
export function mockApiClient(overrides: MockApiClientOverrides = {}): MockApiClient {
  const responses = overrides.responses ?? {};
  const axiosInstance = (overrides.axiosInstance ?? ({} as AxiosInstance)) as AxiosInstance;

  const request = createMockFn<Parameters<ApiClient['request']>, ReturnType<ApiClient['request']>>(
    overrides.implementations?.request ??
      (((routeName: string) =>
        Promise.resolve(
          Object.prototype.hasOwnProperty.call(responses, routeName) ? responses[routeName] : {}
        )) as ApiClient['request'])
  );

  const uploadFile = createMockFn<Parameters<ApiClient['uploadFile']>, ReturnType<ApiClient['uploadFile']>>(
    overrides.implementations?.uploadFile ?? (((() => Promise.resolve({})) as unknown) as ApiClient['uploadFile'])
  );

  const createWebSocket = createMockFn<
    Parameters<ApiClient['createWebSocket']>,
    ReturnType<ApiClient['createWebSocket']>
  >(
    overrides.implementations?.createWebSocket ??
      (((() => ({} as WebSocket)) as unknown) as ApiClient['createWebSocket'])
  );

  const getAxiosInstance = createMockFn<
    Parameters<ApiClient['getAxiosInstance']>,
    ReturnType<ApiClient['getAxiosInstance']>
  >(overrides.implementations?.getAxiosInstance ?? (() => axiosInstance));

  const getPerformanceMetrics = createMockFn<
    Parameters<ApiClient['getPerformanceMetrics']>,
    ReturnType<ApiClient['getPerformanceMetrics']>
  >(overrides.implementations?.getPerformanceMetrics ?? (() => overrides.performanceMetrics));

  const resetPerformanceMetrics = createMockFn<
    Parameters<ApiClient['resetPerformanceMetrics']>,
    ReturnType<ApiClient['resetPerformanceMetrics']>
  >(overrides.implementations?.resetPerformanceMetrics ?? (() => undefined));

  const destroy = createMockFn<Parameters<ApiClient['destroy']>, ReturnType<ApiClient['destroy']>>(
    overrides.implementations?.destroy ?? (() => undefined)
  );

  return {
    request,
    uploadFile,
    createWebSocket,
    getAxiosInstance,
    getPerformanceMetrics,
    resetPerformanceMetrics,
    destroy,
  };
}
