/**
 * G-05: configureMinder() platform presets must not silently override the
 * documented M0 flagship defaults (CHANGELOG.md, "2.2.0-beta.1" —
 * "Changed (performance — behavior changes)"):
 *
 *   - Default query/mutation retry is 1, not 3 (M0-02, `?? 1` in
 *     MinderDataProvider.getQueryClientConfig).
 *   - `withCredentials` / CORS `credentials` is opt-in via
 *     `credentials === true`, never on by default (M0-01, ApiClient).
 *
 * Before this fix, `getPlatformDefaults()` in src/config/index.ts hardcoded
 * `retries: 3` for every platform and `cors: { enabled: true, credentials:
 * true }` for the web platform, and `applyUserConfig()` defaulted
 * `credentials` to `true` via `?? true`. Since configureMinder() is the
 * primary/documented config entry point, this silently reinstated the old
 * 3-retry / always-credentialed behavior for virtually every consumer,
 * nullifying the M0-01/M0-02 fixes and reintroducing the CORS-preflight
 * latency tax the CHANGELOG says was removed.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { configureMinder } from '../src/config/index';
import { getQueryClientConfig } from '../src/core/MinderDataProvider';
import { PlatformDetector } from '../src/platform/PlatformDetector';
import { Platform } from '../src/constants/enums';

describe('G-05: configureMinder() preset defaults match the documented M0 contract', () => {
  let originalDetect: typeof PlatformDetector.detect;

  beforeEach(() => {
    originalDetect = PlatformDetector.detect;
    PlatformDetector.detect = () => Platform.WEB;
  });

  afterEach(() => {
    PlatformDetector.detect = originalDetect;
    PlatformDetector.reset();
  });

  describe('retries default (web platform)', () => {
    it('does not hardcode retries: 3 in the stored config', () => {
      const config = configureMinder({ apiUrl: 'https://api.example.com' });

      // Documented default is 1. Either an explicit 1, or an omitted value
      // that lets MinderDataProvider's `?? 1` fallback apply, keeps the
      // EFFECTIVE default at 1 — see the getQueryClientConfig test below for
      // the authoritative check.
      expect(
        config.performance?.retries === 1 || config.performance?.retries === undefined
      ).toBe(true);
      expect(config.performance?.retries).not.toBe(3);
    });

    it('produces an effective query/mutation retry of 1 through getQueryClientConfig', () => {
      const config = configureMinder({ apiUrl: 'https://api.example.com' });
      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retry).toBe(1);
      expect(queryConfig.defaultOptions.mutations.retry).toBe(1);
    });

    it('respects an explicit user retries: 5 override', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        performance: { retries: 5 },
      });

      expect(config.performance?.retries).toBe(5);
      expect(getQueryClientConfig(config).defaultOptions.queries.retry).toBe(5);
    });

    it('respects an explicit user retries: 0 (?? semantics, not ||)', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        performance: { retries: 0 },
      });

      expect(config.performance?.retries).toBe(0);
      expect(getQueryClientConfig(config).defaultOptions.queries.retry).toBe(0);
    });
  });

  describe('retries default (non-web platform, shared defaults object)', () => {
    it('does not hardcode retries: 3 on the Node platform either', () => {
      PlatformDetector.detect = () => Platform.NODE;

      const config = configureMinder({ apiUrl: 'https://api.example.com' });

      expect(config.performance?.retries).not.toBe(3);
      expect(getQueryClientConfig(config).defaultOptions.queries.retry).toBe(1);
    });
  });

  describe('CORS credentials default (web platform)', () => {
    it('does not default cors.credentials to true when no cors config is passed', () => {
      const config = configureMinder({ apiUrl: 'https://api.example.com' });

      expect(config.cors?.credentials).toBeFalsy();
    });

    // B4 (fix-2.2.0-blockers, ratified — landed after this G-05 suite was
    // written): configureMinder() now throws when cors/corsHelper resolves
    // `enabled: true` with no `proxy` route configured, since that used to
    // silently rewrite every request to a proxy route that almost certainly
    // doesn't exist. Boolean shorthand `true` has no way to express a
    // proxy, so it can no longer produce a working config on its own —
    // covered directly below. The credentials-default concern these tests
    // exist for is still exercised via the object form with an explicit
    // `proxy`.
    it('throws for boolean shorthand cors: true because no proxy route is configured (B4)', () => {
      expect(() =>
        configureMinder({ apiUrl: 'https://api.example.com', cors: true })
      ).toThrow(/no `proxy` route was configured/);
    });

    it('throws for boolean shorthand corsHelper: true because no proxy route is configured (B4)', () => {
      expect(() =>
        configureMinder({ apiUrl: 'https://api.example.com', corsHelper: true })
      ).toThrow(/no `proxy` route was configured/);
    });

    it('does not default credentials to true for cors boolean-shorthand semantics once a proxy is configured', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect(config.cors?.credentials).toBeFalsy();
      expect((config as any).corsHelper?.credentials).toBeFalsy();
    });

    it('does not default credentials to true for corsHelper boolean-shorthand semantics once a proxy is configured', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect((config as any).corsHelper?.credentials).toBeFalsy();
      expect(config.cors?.credentials).toBeFalsy();
    });

    it('does not default credentials to true when corsHelper is enabled without specifying credentials', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, proxy: '/api/minder-proxy' },
      });

      expect((config as any).corsHelper?.credentials).toBeFalsy();
    });

    it('respects an explicit user credentials: true override via cors', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { credentials: true, proxy: '/api/minder-proxy' },
      });

      expect(config.cors?.credentials).toBe(true);
    });

    it('respects an explicit user credentials: true override via corsHelper', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, credentials: true, proxy: '/api/minder-proxy' },
      });

      expect((config as any).corsHelper?.credentials).toBe(true);
    });

    it('still respects explicit credentials: false', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { credentials: false, proxy: '/api/minder-proxy' },
      });

      expect(config.cors?.credentials).toBe(false);
    });

    it('defaults cors.enabled to false — B4 disabled auto-enable, a later ratified fix than this G-05 suite', () => {
      const config = configureMinder({ apiUrl: 'https://api.example.com' });

      // B4 (fix-2.2.0-blockers): the web platform's CORS/proxy helper used
      // to auto-enable by default, silently rewriting every request to
      // `/api/minder-proxy` for apps that never asked for it. It is now
      // opt-in only; the app must explicitly configure `corsHelper.enabled`
      // (or `cors.enabled`) with a `proxy` route.
      expect(config.cors?.enabled).toBe(false);
    });
  });
});
