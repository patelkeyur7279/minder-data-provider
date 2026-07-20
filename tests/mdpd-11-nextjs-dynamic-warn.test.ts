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
import { configureMinder, __resetNextjsDynamicWarning } from '../src/config/index';
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
    // Warn-once (MDPD fix) is a module-level flag — reset it so each test
    // observes the warning firing fresh, regardless of what earlier tests
    // (in this file or others) already triggered.
    __resetNextjsDynamicWarning();
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

  // MDPD fix: config.dynamic was never forwarded onto the returned config,
  // so the warning's own remediation advice ("pass `dynamic` from
  // next/dynamic") could never actually be verified as working.
  it('forwards config.dynamic onto the returned config', () => {
    const dynamic = () => null;
    const config = configureMinder({
      apiUrl: 'https://api.example.com',
      dynamic,
    });
    expect(config.dynamic).toBe(dynamic);
  });

  // MDPD fix: the missing-dynamic warning used to fire on EVERY
  // configureMinder call. It must now fire at most once per process.
  it('warns only once across multiple configureMinder calls', () => {
    configureMinder({ apiUrl: 'https://api.example.com', routes: { users: '/users' } });
    configureMinder({ apiUrl: 'https://api.example.com', routes: { posts: '/posts' } });
    configureMinder({ apiUrl: 'https://api.example.com', routes: { comments: '/comments' } });

    const dynamicWarnings = warnSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0]).toLowerCase().includes('dynamic')
    );
    expect(dynamicWarnings.length).toBe(1);
  });
});
