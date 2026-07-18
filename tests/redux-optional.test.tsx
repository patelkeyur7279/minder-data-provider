/**
 * M1-07: Redux must be TRULY optional.
 *
 * MinderDataProvider (src/core/MinderDataProvider.tsx) and the Redux hooks
 * (src/hooks/index.ts: useReduxSlice/useStore) statically imported
 * react-redux + @reduxjs/toolkit even though package.json marks both as
 * OPTIONAL peer dependencies - so any consumer without those packages
 * installed got a hard "Module not found" error, even if they never touched
 * Redux.
 *
 * These tests simulate "package not installed" via jest.doMock() (throwing
 * from the mock factory - the same failure Node's `require()` produces for a
 * missing module) combined with jest.isolateModules(), so the module-scope
 * `require()` probe in MinderDataProvider.tsx / hooks/index.ts re-runs fresh
 * and actually observes the simulated absence.
 *
 * IMPORTANT: every module involved in a given scenario (react,
 * @testing-library/react, the provider, the hooks) is `require()`d from
 * *inside the same* isolateModules() callback so they all resolve to one
 * consistent, isolated module graph - mixing an isolated React with the
 * outer (already-imported) React instance causes "Invalid hook call" errors.
 * The isolateModules() calls themselves live at `describe()`-body scope
 * (test collection time), not inside `it()` bodies - @testing-library/react
 * registers a global `afterEach(cleanup)` as a side effect of being
 * `require()`d, and jest-circus forbids registering hooks while a test is
 * actively running.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, renderHook } from '@testing-library/react';
import React from 'react';
import { MinderDataProvider, useMinderContext } from '../src/core/MinderDataProvider';
import type { MinderConfig } from '../src/core/types';

const baseConfig: MinderConfig = {
  apiBaseUrl: 'https://api.test.com',
  routes: {
    users: { method: 'GET' as any, url: '/users' },
  },
};

describe('Redux optional peer dependency (M1-07)', () => {
  describe('when react-redux / @reduxjs/toolkit are NOT installed', () => {
    // All of these come from one isolated, self-consistent module graph -
    // resolved once, at describe-collection time (see file header comment).
    let IsolatedReact: typeof React;
    let isolatedRender: typeof render;
    let isolatedRenderHook: typeof renderHook;
    let IsolatedProvider: typeof MinderDataProvider;
    let isolatedUseMinderContext: typeof useMinderContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isolatedUseMinder: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isolatedUseStore: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isolatedUseReduxSlice: any;

    jest.isolateModules(() => {
      jest.doMock('react-redux', () => {
        throw new Error("Cannot find module 'react-redux'");
      });
      jest.doMock('@reduxjs/toolkit', () => {
        throw new Error("Cannot find module '@reduxjs/toolkit'");
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      IsolatedReact = require('react');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rtl = require('@testing-library/react');
      isolatedRender = rtl.render;
      isolatedRenderHook = rtl.renderHook;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const providerModule = require('../src/core/MinderDataProvider');
      IsolatedProvider = providerModule.MinderDataProvider;
      isolatedUseMinderContext = providerModule.useMinderContext;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      isolatedUseMinder = require('../src/hooks/useMinder').useMinder;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const hooksModule = require('../src/hooks/index');
      isolatedUseStore = hooksModule.useStore;
      isolatedUseReduxSlice = hooksModule.useReduxSlice;
    });

    it('renders children without crashing (no ReduxProvider wrap) and leaves store undefined', () => {
      let storeSeen: unknown = 'unset';

      function Probe() {
        const ctx = isolatedUseMinderContext();
        storeSeen = ctx.store;
        return IsolatedReact.createElement('div', null, 'child-rendered');
      }

      const { getByText } = isolatedRender(
        IsolatedReact.createElement(
          IsolatedProvider,
          { config: baseConfig },
          IsolatedReact.createElement(Probe)
        )
      );

      expect(getByText('child-rendered')).toBeTruthy();
      expect(storeSeen).toBeUndefined();
    });

    it('useMinder still works without the Redux packages installed', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        IsolatedReact.createElement(IsolatedProvider, { config: baseConfig }, children);

      expect(() => {
        isolatedRenderHook(() => isolatedUseMinder('users', { autoFetch: false }), { wrapper });
      }).not.toThrow();
    });

    it('useStore() throws a clear MinderError instead of crashing on undefined', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        IsolatedReact.createElement(IsolatedProvider, { config: baseConfig }, children);

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let thrown: any;
      try {
        isolatedRenderHook(() => isolatedUseStore(), { wrapper });
      } catch (e) {
        thrown = e;
      } finally {
        spy.mockRestore();
      }

      expect(thrown).toBeTruthy();
      expect(thrown.message).toMatch(/Redux is not enabled/i);
      expect(thrown.message).toMatch(/react-redux/);
      expect(thrown.message).toMatch(/@reduxjs\/toolkit/);
      expect(thrown.code).toBe('REDUX_NOT_ENABLED');
    });

    it('useReduxSlice() throws a clear MinderError instead of crashing on undefined', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        IsolatedReact.createElement(IsolatedProvider, { config: baseConfig }, children);

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let thrown: any;
      try {
        isolatedRenderHook(() => isolatedUseReduxSlice('users'), { wrapper });
      } catch (e) {
        thrown = e;
      } finally {
        spy.mockRestore();
      }

      expect(thrown).toBeTruthy();
      expect(thrown.message).toMatch(/Redux is not enabled/i);
      expect(thrown.code).toBe('REDUX_NOT_ENABLED');
    });
  });

  describe('config.redux === false', () => {
    let IsolatedReact: typeof React;
    let isolatedRender: typeof render;
    let IsolatedProvider: typeof MinderDataProvider;
    let isolatedUseMinderContext: typeof useMinderContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createApiSlicesSpy: any;

    jest.isolateModules(() => {
      // Undo the throwing react-redux/@reduxjs-toolkit mocks registered by
      // the sibling describe block above - jest's explicit mock registry is
      // shared per test file and outlives any single isolateModules() call.
      jest.dontMock('react-redux');
      jest.dontMock('@reduxjs/toolkit');

      jest.doMock('../src/core/SliceGenerator', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const actual: any = jest.requireActual('../src/core/SliceGenerator');
        createApiSlicesSpy = jest.fn(actual.createApiSlices);
        return { ...actual, createApiSlices: createApiSlicesSpy };
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      IsolatedReact = require('react');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      isolatedRender = require('@testing-library/react').render;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const providerModule = require('../src/core/MinderDataProvider');
      IsolatedProvider = providerModule.MinderDataProvider;
      isolatedUseMinderContext = providerModule.useMinderContext;
    });

    it('skips the store even when the Redux packages ARE present (SliceGenerator never invoked)', () => {
      let storeSeen: unknown = 'unset';

      function Probe() {
        const ctx = isolatedUseMinderContext();
        storeSeen = ctx.store;
        return null;
      }

      isolatedRender(
        IsolatedReact.createElement(
          IsolatedProvider,
          { config: { ...baseConfig, redux: false } },
          IsolatedReact.createElement(Probe)
        )
      );

      expect(storeSeen).toBeUndefined();
      expect(createApiSlicesSpy).not.toHaveBeenCalled();
    });
  });

  describe('regression: default behavior with the Redux packages present', () => {
    it('still creates a real Redux store when redux is left unconfigured (auto)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedStore: any;

      function Probe() {
        const ctx = useMinderContext();
        capturedStore = ctx.store;
        return null;
      }

      render(
        <MinderDataProvider config={baseConfig}>
          <Probe />
        </MinderDataProvider>
      );

      expect(capturedStore).toBeDefined();
      expect(typeof capturedStore.getState).toBe('function');
      expect(typeof capturedStore.dispatch).toBe('function');
    });

    it('useStore() works normally when the store is present', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useStore } = require('../src/hooks/index');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MinderDataProvider config={baseConfig}>{children}</MinderDataProvider>
      );

      const { result } = renderHook(() => useStore(), { wrapper });

      expect(typeof result.current.getState).toBe('function');
      expect(typeof result.current.dispatch).toBe('function');
      expect(typeof result.current.subscribe).toBe('function');
    });
  });
});
