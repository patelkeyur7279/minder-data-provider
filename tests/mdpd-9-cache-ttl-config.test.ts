/**
 * MDPD-9 — Documented `cache: { ttl }` did not typecheck and was not normalized.
 *
 * MDP's own presets build cache configs as { type, ttl, maxSize } and
 * docs/FEATURES.md shows `cache: { ttl: 60_000 }` as the canonical example, yet
 * the UnifiedMinderConfig cache type only accepted { staleTime, gcTime, ... }.
 *
 * The fix widens the config cache type to include ttl/type/maxSize and
 * normalizes `ttl` → `staleTime` (ttl takes effect when staleTime is absent) so
 * the documented example both compiles and works at runtime.
 */
import { describe, it, expect } from '@jest/globals';
import { configureMinder, type UnifiedMinderConfig } from '../src/config/index';
import { Logger } from '../src/utils/Logger';

describe('MDPD-9: cache.ttl config support', () => {
  it('normalizes cache.ttl to staleTime and emits no unknown-key warning', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const cfg: UnifiedMinderConfig = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      // The documented example — must typecheck and normalize.
      cache: { ttl: 60_000 },
    };

    const config = configureMinder(cfg);

    expect(config.cache?.staleTime).toBe(60_000);

    const warnedAboutTtl = warnSpy.mock.calls.some((call) =>
      String(call[0]).toLowerCase().includes('ttl')
    );
    expect(warnedAboutTtl).toBe(false);

    warnSpy.mockRestore();
  });

  it('does not override an explicit staleTime with ttl', () => {
    const config = configureMinder({
      apiUrl: 'https://api.example.com',
      cache: { ttl: 60_000, staleTime: 12_345 },
    });
    expect(config.cache?.staleTime).toBe(12_345);
  });

  it('accepts type and maxSize matching the presets shape', () => {
    const config = configureMinder({
      apiUrl: 'https://api.example.com',
      cache: { ttl: 30_000, maxSize: 100 },
    });
    expect(config.cache?.staleTime).toBe(30_000);
    expect(config.cache?.maxSize).toBe(100);
  });
});
