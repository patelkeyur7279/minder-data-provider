/**
 * @jest-environment jsdom
 *
 * Phase 4: developer "freedom" escape hatches — opt-in throwing and ad-hoc URLs.
 */
import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { minder, configureMinder } from '../src/core/minder';
import { useMinder } from '../src/hooks/useMinder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const axiosError = (status: number) =>
  Object.assign(new Error('boom'), { isAxiosError: true, response: { status, data: {} } });

describe('minder() throwOnError (Phase 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMinder({ baseURL: '', timeout: 30000, headers: {} });
  });

  it('returns a structured error by default (never throws)', async () => {
    mockedAxios.mockRejectedValueOnce(axiosError(500));
    const res = await minder('users');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('throws when throwOnError is set', async () => {
    mockedAxios.mockRejectedValueOnce(axiosError(500));
    await expect(minder('users', undefined, { throwOnError: true })).rejects.toThrow();
  });

  it('attaches code/status to the thrown error', async () => {
    mockedAxios.mockRejectedValueOnce(axiosError(404));
    await expect(minder('users', undefined, { throwOnError: true })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('useMinder rawUrl / absolute-URL passthrough (Phase 4)', () => {
  const createWrapper = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setGlobalMinderConfig({
      apiBaseUrl: 'http://localhost',
      routes: { users: { url: '/users', method: 'GET' } },
    } as any);
  });

  it('an absolute URL is not rejected by the route registry', async () => {
    mockedAxios.mockResolvedValue({ data: { id: 1 }, status: 200, headers: {} } as any);
    const { result } = renderHook(
      () => useMinder('https://api.example.com/widgets'),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Without the passthrough this would be a "route not found" error.
    expect(result.current.error).toBeFalsy();
  });
});
