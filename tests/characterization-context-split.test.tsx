/**
 * Characterization tests for the MinderContext/MinderDataProvider split
 * (bundle-surgery cut 1) and lazy DevTools (cut 2).
 *
 * Pins the observable contract that the refactor must preserve:
 *  - context value shape reaching hooks through the provider
 *  - throw/null behavior of the two context accessors outside a provider
 *  - re-export identity: the symbols reachable from the package root must BE
 *    the symbols hooks consume internally (mock-interception depends on it)
 *  - DevTools panel appears when enabled (async appearance allowed — lazy)
 */
import React from 'react';
import { render, screen, renderHook } from '@testing-library/react';
import {
  MinderDataProvider,
  useMinderContext as ctxFromProviderFile,
  useMinderContextSafe,
} from '../src/core/MinderDataProvider';
import { useMinderContext as ctxFromRoot } from '../src/index';
import type { MinderConfig } from '../src/core/types';

const baseConfig: MinderConfig = {
  apiBaseUrl: 'https://api.characterization.test',
  routes: {},
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MinderDataProvider config={baseConfig}>{children}</MinderDataProvider>
);

describe('characterization: context split', () => {
  test('provider supplies managers + queryClient through useMinderContext', () => {
    const { result } = renderHook(() => ctxFromProviderFile(), { wrapper });
    expect(result.current.apiClient).toBeDefined();
    expect(result.current.authManager).toBeDefined();
    expect(result.current.cacheManager).toBeDefined();
    expect(result.current.queryClient).toBeDefined();
    expect(result.current.config.apiBaseUrl).toBe(baseConfig.apiBaseUrl);
  });

  test('useMinderContext outside provider throws the exact message', () => {
    // renderHook surfaces the throw; silence React error logging noise
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => ctxFromProviderFile())).toThrow(
      'useMinderContext must be used within MinderDataProvider',
    );
    spy.mockRestore();
  });

  test('useMinderContextSafe outside provider returns null', () => {
    const { result } = renderHook(() => useMinderContextSafe());
    expect(result.current).toBeNull();
  });

  test('root re-export is the same function as the internal accessor', () => {
    expect(ctxFromRoot).toBe(ctxFromProviderFile);
  });
});

describe('characterization: DevTools rendering', () => {
  test('DevTools panel appears when debug.devTools is enabled', async () => {
    render(
      <MinderDataProvider
        config={{ ...baseConfig, debug: { enabled: true, devTools: true } }}
      >
        <div>app</div>
      </MinderDataProvider>,
    );
    // findBy* allows async appearance — tolerates React.lazy devtools
    expect(
      await screen.findByRole('complementary', {
        name: /minder development tools/i,
      }),
    ).toBeInTheDocument();
  });

  test('DevTools absent when debug not configured', () => {
    render(
      <MinderDataProvider config={baseConfig}>
        <div>app</div>
      </MinderDataProvider>,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
