/**
 * S-03: Debug logs must never leak request/response bodies or params verbatim.
 *
 * Before the fix, ApiClient's request/response interceptors logged
 * `config.data` / `config.params` / `response.data` / `error.response.data`
 * (and, on token refresh, a raw headers object that could carry an
 * Authorization header) straight to the console whenever
 * `debug.networkLogs` was enabled — including login bodies containing
 * plaintext passwords and tokens.
 *
 * These tests drive the interceptors directly (same pattern as
 * tests/debug-refresh.test.ts) with a mock DebugManager and assert that
 * sensitive fields never reach the logged payload in plaintext, while
 * non-sensitive fields are preserved so the logs stay useful.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType } from '../src/constants/enums';
import type { DebugManager } from '../src/debug/DebugManager';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('S-03: debug log redaction', () => {
  let apiClient: ApiClient;
  let authManager: AuthManager;
  let mockAxiosInstance: any;
  let mockDebugManager: { log: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    authManager = new AuthManager({
      tokenKey: 'accessToken',
      storage: StorageType.MEMORY,
    });

    mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      request: jest.fn(),
      defaults: { headers: { common: {} } },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    mockDebugManager = { log: jest.fn() };

    apiClient = new ApiClient(
      {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        debug: { enabled: true, networkLogs: true },
      },
      authManager,
      undefined,
      mockDebugManager as unknown as DebugManager
    );
    void apiClient;
  });

  it('redacts sensitive keys in the request body and params before logging', async () => {
    const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

    const config: any = {
      method: 'post',
      url: '/login',
      headers: {},
      data: {
        email: 'user@example.com',
        password: 'hunter2',
        // "auth_token"/"authToken" match the same secret-key heuristic that
        // already protects "password" (see src/security/secrets.ts SUSPICIOUS_KEY).
        authToken: 'super-sensitive-token-value',
      },
      params: {
        page: 1,
        auth_token: 'another-sensitive-value',
      },
    };

    await requestInterceptor(config);

    expect(mockDebugManager.log).toHaveBeenCalled();
    const [, message, logged] = mockDebugManager.log.mock.calls[0];
    expect(message).toContain('POST');

    // Non-sensitive fields survive untouched — logs stay useful for debugging.
    expect(logged.data.email).toBe('user@example.com');
    expect(logged.params.page).toBe(1);

    // Sensitive fields are redacted, not passed through verbatim.
    expect(logged.data.password).toBe('[REDACTED]');
    expect(logged.data.authToken).toBe('[REDACTED]');
    expect(logged.params.auth_token).toBe('[REDACTED]');

    // Belt-and-suspenders: the raw secret values never appear anywhere in
    // what was handed to the logger.
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('super-sensitive-token-value');
    expect(serialized).not.toContain('another-sensitive-value');
  });

  it('redacts sensitive keys in successful response bodies before logging', () => {
    const responseInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];

    const response: any = {
      status: 200,
      statusText: 'OK',
      config: { method: 'post', url: '/login', headers: {} },
      headers: {},
      data: {
        userId: '42',
        password: 'should-not-appear-in-logs',
      },
    };

    responseInterceptor(response);

    expect(mockDebugManager.log).toHaveBeenCalled();
    const [, message, logged] = mockDebugManager.log.mock.calls[0];
    expect(message).toContain('200');

    expect(logged.data.userId).toBe('42');
    expect(logged.data.password).toBe('[REDACTED]');
    expect(JSON.stringify(logged)).not.toContain('should-not-appear-in-logs');
  });

  it('redacts sensitive keys in error response bodies before logging', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    const responseErrorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

    const error: any = {
      response: {
        status: 401,
        statusText: 'Unauthorized',
        data: { message: 'Invalid credentials', password: 'attempted-password-value' },
      },
      config: { method: 'post', url: '/login' },
      message: 'Request failed with status code 401',
    };

    await responseErrorInterceptor(error).catch(() => {
      /* the interceptor rejects after logging; only the log call matters here */
    });

    expect(mockDebugManager.log).toHaveBeenCalled();
    const [, message, logged] = mockDebugManager.log.mock.calls[0];
    expect(message).toContain('401');

    expect(logged.data.message).toBe('Invalid credentials');
    expect(logged.data.password).toBe('[REDACTED]');
    expect(JSON.stringify(logged)).not.toContain('attempted-password-value');
  });
});
