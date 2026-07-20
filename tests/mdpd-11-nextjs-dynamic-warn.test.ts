/**
 * @jest-environment jsdom
 *
 * MDPD-11 — Next.js detection hard-threw NEXTJS_DYNAMIC_REQUIRED when `dynamic`
 * was absent, yet docs/NEXTJS_APP_ROUTER.md never mentions `dynamic`, so
 * following the docs crashed production builds.
 *
 * The fix downgrades the throw to a single console.warn with the actionable
 * message and continues with a working default (no dynamic-import devtools).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { configureMinder } from '../src/config/index';
import { PlatformDetector } from '../src/platform/PlatformDetector';
import { Platform } from '../src/constants/enums';

describe('MDPD-11: Next.js without dynamic warns instead of throwing', () => {
  let detectSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    detectSpy = jest
      .spyOn(PlatformDetector, 'detect')
      .mockReturnValue(Platform.NEXT_JS);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    detectSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('does not throw and emits exactly one warning when dynamic is absent', () => {
    let result: any;
    expect(() => {
      result = configureMinder({
        apiUrl: 'https://api.example.com',
        routes: { users: '/users' },
      });
    }).not.toThrow();

    // Config is returned and usable.
    expect(result.apiBaseUrl).toBe('https://api.example.com');

    // Exactly one warning mentioning `dynamic`.
    const dynamicWarnings = warnSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0]).toLowerCase().includes('dynamic')
    );
    expect(dynamicWarnings.length).toBe(1);
  });

  it('still accepts a valid dynamic function without warning', () => {
    const dynamic = () => null;
    expect(() =>
      configureMinder({
        apiUrl: 'https://api.example.com',
        dynamic,
      })
    ).not.toThrow();

    const dynamicWarnings = warnSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0]).toLowerCase().includes('dynamic')
    );
    expect(dynamicWarnings.length).toBe(0);
  });
});
