/**
 * @jest-environment jsdom
 *
 * Phase 0 reliability: ApiClient must not leak its background timers. The
 * analytics (60s) and telemetry (300s) setInterval handles were never stored or
 * cleared, so they kept firing after the owning provider unmounted. destroy()
 * must clear them.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import type { MinderConfig } from '../src/core/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/utils/analytics', () => ({
  AnalyticsManager: jest.fn().mockImplementation(() => ({
    trackPerformance: jest.fn(),
  })),
}));
jest.mock('../src/utils/telemetry', () => ({
  TelemetryManager: jest.fn().mockImplementation(() => ({
    trackPerformance: jest.fn(),
  })),
}));
jest.mock('../src/utils/security', () => ({
  CSRFTokenManager: jest.fn(),
  XSSSanitizer: jest.fn(),
  RateLimiter: jest.fn(),
  getSecurityHeaders: jest.fn().mockReturnValue({}),
}));

describe('ApiClient resource safety (Phase 0)', () => {
  let setIntervalSpy: jest.SpiedFunction<typeof setInterval>;
  let clearIntervalSpy: jest.SpiedFunction<typeof clearInterval>;
  // Minimal AuthManager stub — ApiClient receives it as a constructor param.
  const authManager = { getToken: jest.fn(), clearAuth: jest.fn() } as any;

  const fullConfig: MinderConfig = {
    apiBaseUrl: 'http://api.example.com',
    routes: {},
    performance: { monitoring: true },
    analytics: { enabled: true, autoTrackPerformance: true },
    telemetry: { enabled: true },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create = jest.fn().mockReturnValue({
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }) as any;
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('starts background timers and clears all of them on destroy()', () => {
    const client = new ApiClient(fullConfig, authManager);

    // analytics + telemetry timers must have been registered
    expect(setIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    const clearedBefore = clearIntervalSpy.mock.calls.length;
    client.destroy();
    const clearedAfter = clearIntervalSpy.mock.calls.length;

    expect(clearedAfter - clearedBefore).toBeGreaterThanOrEqual(2);
  });

  it('destroy() is safe when no background features are enabled', () => {
    const minimal = new ApiClient(
      { apiBaseUrl: 'http://x', routes: {} } as any,
      authManager
    );
    expect(() => minimal.destroy()).not.toThrow();
    // No optional timers were started for the minimal config.
    expect(setIntervalSpy.mock.calls.length).toBe(0);
  });
});
