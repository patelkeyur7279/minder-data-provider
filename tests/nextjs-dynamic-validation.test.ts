/**
 * Tests for Next.js dynamic import handling.
 *
 * MDPD-11: a missing/invalid `dynamic` in a Next.js app used to hard-throw
 * NEXTJS_DYNAMIC_REQUIRED, which crashed `next build` even though
 * docs/NEXTJS_APP_ROUTER.md never documents `dynamic`. It now emits a single
 * warning and continues with a working default. These tests assert the
 * warn-and-continue contract.
 *
 * MDPD fix: the warning itself is now warn-ONCE-per-process (previously it
 * fired on every single configureMinder call, spamming the console). Each
 * test below resets the warn-once flag via `__resetNextjsDynamicWarning()` so
 * it can independently observe "does this specific call warn?" — without the
 * reset, only the first test in this file would ever see a warning and every
 * later test asserting `dynamicWarnings().length > 0` would incorrectly fail,
 * since the process-wide flag would already be tripped. This was previously
 * the actual (bugged) behavior these tests exercised: every configureMinder
 * call re-warned, so no reset was needed. That is the defect the warn-once
 * fix (src/config/index.ts) resolves.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { configureMinder, __resetNextjsDynamicWarning } from '../src/config/index.js';
import { PlatformDetector } from '../src/platform/PlatformDetector.js';
import { Platform } from '../src/constants/enums.js';

describe('Next.js Dynamic Import Handling', () => {
  let originalDetect: typeof PlatformDetector.detect;
  let warnSpy: any;

  beforeEach(() => {
    originalDetect = PlatformDetector.detect;
    PlatformDetector.reset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    __resetNextjsDynamicWarning();
  });

  afterEach(() => {
    PlatformDetector.detect = originalDetect;
    PlatformDetector.reset();
    warnSpy.mockRestore();
  });

  const dynamicWarnings = () =>
    warnSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0]).toLowerCase().includes('dynamic')
    );

  it('warns (does not throw) when Next.js detected without dynamic', () => {
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
    };

    expect(() => configureMinder(config)).not.toThrow();
    const result = configureMinder(config);
    expect(result.apiBaseUrl).toBe('https://api.example.com');

    // Warning mentions dynamic and points at next/dynamic.
    expect(dynamicWarnings().length).toBeGreaterThan(0);
    const message = String(dynamicWarnings()[0][0]).toLowerCase();
    expect(message).toContain('next.js');
    expect(message).toContain('next/dynamic');
  });

  it('does NOT warn or throw when Next.js detected WITH a dynamic function', () => {
    PlatformDetector.detect = () => Platform.NEXT_JS;
    const mockDynamic = () => null;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: mockDynamic,
    };

    expect(() => configureMinder(config)).not.toThrow();
    const result = configureMinder(config);
    expect(result.apiBaseUrl).toBe('https://api.example.com');
    expect(dynamicWarnings().length).toBe(0);
  });

  it('does NOT warn or throw for non-Next.js platforms without dynamic', () => {
    PlatformDetector.detect = () => Platform.WEB;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
    };

    expect(() => configureMinder(config)).not.toThrow();
    expect(dynamicWarnings().length).toBe(0);
  });

  it('warns (does not throw) when Next.js detected with a non-function dynamic', () => {
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: {} as any, // not a function
    };

    expect(() => configureMinder(config)).not.toThrow();
    expect(dynamicWarnings().length).toBeGreaterThan(0);
  });

  it('warns (does not throw) when Next.js detected with null dynamic', () => {
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: null as any,
    };

    expect(() => configureMinder(config)).not.toThrow();
    expect(dynamicWarnings().length).toBeGreaterThan(0);
  });
});
