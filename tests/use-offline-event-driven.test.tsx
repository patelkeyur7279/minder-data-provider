/**
 * Event-Driven Offline Hooks Tests (M0-08)
 *
 * Verifies that useOffline / useNetworkState / useOfflineQueue react to
 * OfflineManager notifications and browser connectivity events instead of
 * polling with setInterval, and that no-op notifications don't cause
 * unnecessary re-renders.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { createOfflineManager, type OfflineManager } from '../src/platform/offline/OfflineManager';
import { useOffline, useNetworkState, useOfflineQueue } from '../src/platform/offline/useOffline';

// Mock StorageAdapter (mirrors tests/offline-support.test.ts)
const createMockStorage = () => ({
  getItem: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
  setItem: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  removeItem: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getAllKeys: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  hasItem: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  getSize: jest.fn<() => Promise<number>>().mockResolvedValue(0),
});

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOffline hooks are event-driven (no polling)', () => {
  let manager: OfflineManager;

  beforeEach(() => {
    jest.clearAllMocks();
    setNavigatorOnline(true);
    manager = createOfflineManager({
      enabled: true,
      storage: createMockStorage() as any,
      autoSync: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('no setInterval polling', () => {
    it('useOffline never calls setInterval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const { unmount } = renderHook(() => useOffline(manager));
      expect(setIntervalSpy).not.toHaveBeenCalled();
      unmount();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('useNetworkState never calls setInterval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const { unmount } = renderHook(() => useNetworkState(manager));
      expect(setIntervalSpy).not.toHaveBeenCalled();
      unmount();
    });

    it('useOfflineQueue never calls setInterval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const { unmount } = renderHook(() => useOfflineQueue(manager));
      expect(setIntervalSpy).not.toHaveBeenCalled();
      unmount();
    });
  });

  describe('reacts to connectivity changes', () => {
    it('updates isOnline/networkState when the manager itself transitions', () => {
      const { result } = renderHook(() => useOffline(manager));
      expect(result.current.isOnline).toBe(true);

      act(() => {
        // Simulate the manager's own network transition (e.g. from NetInfo).
        (manager as any).updateNetworkState({ isConnected: false, type: 'none' });
      });

      expect(result.current.isOnline).toBe(false);
      expect(result.current.networkState.isConnected).toBe(false);
    });

    it('updates isOnline when a window "offline" event fires', () => {
      const { result } = renderHook(() => useOffline(manager));
      expect(result.current.isOnline).toBe(true);

      act(() => {
        setNavigatorOnline(false);
        window.dispatchEvent(new Event('offline'));
      });

      expect(result.current.isOnline).toBe(false);
      expect(result.current.networkState.isConnected).toBe(false);
    });

    it('updates isOnline when a window "online" event fires after going offline (useNetworkState)', () => {
      setNavigatorOnline(false);
      const { result } = renderHook(() => useNetworkState(manager));

      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      expect(result.current.isOnline).toBe(false);

      act(() => {
        setNavigatorOnline(true);
        window.dispatchEvent(new Event('online'));
      });
      expect(result.current.isOnline).toBe(true);
    });

    it('updates the queue/queueSize when a request is added directly on the manager (useOfflineQueue)', async () => {
      const { result } = renderHook(() => useOfflineQueue(manager));
      expect(result.current.queueSize).toBe(0);

      await act(async () => {
        await manager.addToQueue('GET', '/api/test');
      });

      expect(result.current.queueSize).toBe(1);
      expect(result.current.queue).toHaveLength(1);
    });
  });

  describe('no-op notifications do not cause re-renders', () => {
    it('useOffline does not re-render when the manager notifies without any state change', () => {
      let renderCount = 0;
      const { result } = renderHook(() => {
        renderCount++;
        return useOffline(manager);
      });

      const countAfterMount = renderCount;
      expect(result.current.isOnline).toBe(true);

      act(() => {
        // Force a notify() with the exact same snapshot as before.
        (manager as any).notify();
      });

      expect(renderCount).toBe(countAfterMount);
    });

    it('useNetworkState does not re-render when the manager notifies without any state change', () => {
      let renderCount = 0;
      renderHook(() => {
        renderCount++;
        return useNetworkState(manager);
      });

      const countAfterMount = renderCount;

      act(() => {
        (manager as any).notify();
      });

      expect(renderCount).toBe(countAfterMount);
    });

    it('useNetworkState stops re-rendering once repeated "online" events carry no new information', () => {
      let renderCount = 0;
      renderHook(() => {
        renderCount++;
        return useNetworkState(manager);
      });

      // The first "online" event while already online still normalizes the
      // networkState's `type` field (undefined -> 'unknown'), a real change.
      // React's bail-out mechanism may also call the component function once
      // more on the very next dispatch to confirm nothing changed (a
      // documented React caveat: the function may run once extra before
      // React skips committing/re-rendering children). Fire two events to
      // pass that settling point, then assert renders truly stop increasing.
      act(() => {
        setNavigatorOnline(true);
        window.dispatchEvent(new Event('online'));
      });
      act(() => {
        setNavigatorOnline(true);
        window.dispatchEvent(new Event('online'));
      });
      const countAfterSettling = renderCount;

      act(() => {
        setNavigatorOnline(true);
        window.dispatchEvent(new Event('online'));
      });

      expect(renderCount).toBe(countAfterSettling);
    });

    it('useOfflineQueue does not re-render when notified with an unchanged queue', () => {
      let renderCount = 0;
      renderHook(() => {
        renderCount++;
        return useOfflineQueue(manager);
      });

      const countAfterMount = renderCount;

      act(() => {
        (manager as any).notify();
      });

      expect(renderCount).toBe(countAfterMount);
    });
  });

  describe('unmount cleanup', () => {
    it('unsubscribes from the manager on unmount', () => {
      const { unmount } = renderHook(() => useOffline(manager));
      expect((manager as any).listeners.size).toBe(1);

      unmount();

      expect((manager as any).listeners.size).toBe(0);
    });

    it('removes window connectivity listeners on unmount', () => {
      const addSpy = jest.spyOn(window, 'addEventListener');
      const removeSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useOffline(manager));
      const addedOnline = addSpy.mock.calls.filter((call) => call[0] === 'online').length;
      const addedOffline = addSpy.mock.calls.filter((call) => call[0] === 'offline').length;
      expect(addedOnline).toBeGreaterThan(0);
      expect(addedOffline).toBeGreaterThan(0);

      unmount();

      const removedOnline = removeSpy.mock.calls.filter((call) => call[0] === 'online').length;
      const removedOffline = removeSpy.mock.calls.filter((call) => call[0] === 'offline').length;
      expect(removedOnline).toBe(addedOnline);
      expect(removedOffline).toBe(addedOffline);
    });

    it('does not warn about a state update after unmount when the manager notifies late', () => {
      const errorMock = console.error as unknown as jest.Mock;
      const { unmount } = renderHook(() => useOffline(manager));

      unmount();
      const callsBeforeLateNotify = errorMock.mock.calls.length;

      act(() => {
        (manager as any).updateNetworkState({ isConnected: false, type: 'none' });
      });

      const newCalls = errorMock.mock.calls.slice(callsBeforeLateNotify);
      const updateWarnings = newCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes("state update")
      );
      expect(updateWarnings).toHaveLength(0);
      // The manager should have no dangling listeners after unmount.
      expect((manager as any).listeners.size).toBe(0);
    });

    it('unsubscribes multiple hook instances independently', () => {
      const { unmount: unmountA } = renderHook(() => useOffline(manager));
      const { unmount: unmountB } = renderHook(() => useNetworkState(manager));
      const { unmount: unmountC } = renderHook(() => useOfflineQueue(manager));

      expect((manager as any).listeners.size).toBe(3);

      unmountA();
      expect((manager as any).listeners.size).toBe(2);

      unmountB();
      expect((manager as any).listeners.size).toBe(1);

      unmountC();
      expect((manager as any).listeners.size).toBe(0);
    });
  });
});
