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

    it('does not default credentials to true for boolean shorthand cors: true', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: true,
      });

      expect(config.cors?.credentials).toBeFalsy();
      expect((config as any).corsHelper?.credentials).toBeFalsy();
    });

    it('does not default credentials to true for boolean shorthand corsHelper: true', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: true,
      });

      expect((config as any).corsHelper?.credentials).toBeFalsy();
      expect(config.cors?.credentials).toBeFalsy();
    });

    it('does not default credentials to true when corsHelper is enabled without specifying credentials', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true },
      });

      expect((config as any).corsHelper?.credentials).toBeFalsy();
    });

    it('respects an explicit user credentials: true override via cors', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { credentials: true },
      });

      expect(config.cors?.credentials).toBe(true);
    });

    it('respects an explicit user credentials: true override via corsHelper', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        corsHelper: { enabled: true, credentials: true },
      });

      expect((config as any).corsHelper?.credentials).toBe(true);
    });

    it('still respects explicit credentials: false', () => {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        cors: { credentials: false },
      });

      expect(config.cors?.credentials).toBe(false);
    });

    it('leaves cors.enabled untouched — only credentials/retries are in scope', () => {
      const config = configureMinder({ apiUrl: 'https://api.example.com' });

      // The web platform's CORS-error-handling machinery (proxy fallback,
      // friendly error messages) may stay enabled by default; this fix only
      // concerns the credentials flag and the retries count.
      expect(config.cors?.enabled).toBe(true);
    });
  });
});
