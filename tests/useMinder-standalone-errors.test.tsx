/**
 * @jest-environment jsdom
 *
 * Regression: in standalone (no-provider) mode, useMinder previously mis-called
 * minder() (passing options as the request body) and always reported success, so
 * errors never surfaced. These tests lock in correct error/success handling.
 */
import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useMinder } from '../src/hooks/useMinder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const axiosError = (status: number) =>
  Object.assign(new Error('boom'), {
    isAxiosError: true,
    response: { status, data: { message: 'nope' } },
  });

const makeWrapper = () => {
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

describe('standalone useMinder error handling (regression)', () => {
  it('surfaces the error of a failed request (no false success)', async () => {
    mockedAxios.mockRejectedValue(axiosError(500));
    const { result } = renderHook(
      () => useMinder('users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.success).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('returns data on a successful request', async () => {
    mockedAxios.mockResolvedValue({ data: { id: 1, name: 'Ada' }, status: 200, headers: {} } as any);
    const { result } = renderHook(
      () => useMinder('users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toMatchObject({ id: 1, name: 'Ada' });
  });

  it('throwOnError propagates the error to a React error boundary', async () => {
    mockedAxios.mockRejectedValue(axiosError(500));
    let caught = false;
    class Boundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
      state = { hasError: false };
      static getDerivedStateFromError() { return { hasError: true }; }
      componentDidCatch() { caught = true; }
      render() {
        return this.state.hasError ? React.createElement('div', null, 'err') : this.props.children;
      }
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <Boundary>{children}</Boundary>
      </QueryClientProvider>
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* silence boundary noise */ });
    renderHook(() => useMinder('users', { throwOnError: true, queryOptions: { retry: false } }), {
      wrapper,
    });
    await waitFor(() => expect(caught).toBe(true));
    spy.mockRestore();
  });
});
