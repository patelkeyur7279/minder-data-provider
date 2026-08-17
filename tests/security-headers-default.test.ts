/**
 * M0-01: Remove the CORS-preflight tax from the default HTTP client.
 *
 * Response-type security headers (CSP, X-Frame-Options, etc.) are non-safelisted
 * request headers. Shipping them as default axios *request* headers forces a
 * CORS preflight OPTIONS round-trip on every cross-origin call. They belong on
 * server *responses*, not client requests, so the default axios instance must
 * not carry them, and `withCredentials` must be opt-in (it also affects
 * preflight/credentialed-request behavior).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import type { MinderConfig } from '../src/core/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiClient default headers (no CORS-preflight tax)', () => {
  let mockAxiosInstance: any;
  const authManager = { getToken: jest.fn(), clearAuth: jest.fn() } as any;
  let config: MinderConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;

    config = {
      apiBaseUrl: 'http://api.example.com',
      routes: {},
    };
  });

  it('creates the axios instance with only Content-Type and Accept as default headers', () => {
    new ApiClient(config, authManager);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
    );
  });

  it('does not include any response-type security headers on the default axios instance', () => {
    new ApiClient(config, authManager);

    const createArgs = mockedAxios.create.mock.calls[0][0] as any;
    const headers = createArgs.headers;

    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['X-Content-Type-Options']).toBeUndefined();
    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(headers['X-XSS-Protection']).toBeUndefined();
    expect(headers['Referrer-Policy']).toBeUndefined();
    expect(headers['Permissions-Policy']).toBeUndefined();
  });

  it('defaults withCredentials to false (opt-in only)', () => {
    new ApiClient(config, authManager);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        withCredentials: false,
      })
    );
  });

  it('sets withCredentials to true only when config.cors.credentials === true', () => {
    const corsConfig: MinderConfig = {
      ...config,
      cors: { credentials: true },
    };

    new ApiClient(corsConfig, authManager);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        withCredentials: true,
      })
    );
  });

  it('keeps withCredentials false when config.cors is present but credentials is not exactly true', () => {
    const corsConfig: MinderConfig = {
      ...config,
      cors: { enabled: true },
    };

    new ApiClient(corsConfig, authManager);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        withCredentials: false,
      })
    );
  });

  it('exposes the axios instance without security headers via the private axiosInstance', () => {
    const client = new ApiClient(config, authManager) as any;

    const instanceHeaders = (client.axiosInstance === mockAxiosInstance)
      ? (mockedAxios.create.mock.calls[0][0] as any).headers
      : client.axiosInstance.defaults?.headers;

    expect(instanceHeaders['Content-Security-Policy']).toBeUndefined();
    expect(instanceHeaders['X-Frame-Options']).toBeUndefined();
  });
});
