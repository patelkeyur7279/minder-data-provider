/**
 * @jest-environment node
 *
 * QR-R1 (M-Q0 Foundation reliability) — SSR/Node safety regression guard.
 *
 * The repo's default test env is jsdom, which supplies window/document/
 * localStorage — so a core module that touches a browser global WITHOUT a
 * `typeof` guard passes every test yet crashes a real server/SSR render. That
 * class already shipped once (the FileList server-write crash). This file runs
 * in the `node` environment (no window/document/localStorage) and constructs
 * the core managers an SSR render can reach, asserting they do NOT throw. If a
 * future edit removes a `typeof window` guard, a test here fails instead of a
 * user's server.
 *
 * Non-vacuity: the first test proves the browser globals really are absent here.
 */
import { describe, it, expect } from '@jest/globals';

describe('SSR/Node safety — core managers construct without browser globals', () => {
  it('the node environment genuinely lacks window/document/localStorage', () => {
    expect(typeof (globalThis as Record<string, unknown>).window).toBe('undefined');
    expect(typeof (globalThis as Record<string, unknown>).document).toBe('undefined');
    expect(typeof (globalThis as Record<string, unknown>).localStorage).toBe('undefined');
  });

  it('EnvironmentManager constructs + auto-detects env server-side (window branch guarded)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EnvironmentManager } = require('../src/core/EnvironmentManager');
    // autoDetectEnvironment:true forces detectEnvironment() into its window
    // branch, which must be skipped in Node via `typeof window` (else it throws
    // on window.location.hostname).
    let env: unknown;
    expect(() => {
      env = new EnvironmentManager({ autoDetectEnvironment: true, defaultEnvironment: 'production' });
    }).not.toThrow();
    expect(env).toBeTruthy();
  });

  it('OfflineManager constructs + destroys without window/navigator', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OfflineManager } = require('../src/core/OfflineManager');
    let mgr: { destroy?: () => void } | undefined;
    // Constructor guards navigator.onLine + addEventListener behind `typeof window`.
    expect(() => {
      mgr = new OfflineManager({ enabled: true });
    }).not.toThrow();
    // destroy() removes listeners — also guarded; must be a no-op server-side.
    expect(() => mgr?.destroy?.()).not.toThrow();
  });

  it('the core data path modules evaluate cleanly at import time in Node', () => {
    // Module-eval must not touch a browser global at the top level.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(() => require('../src/core/EnvironmentManager')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(() => require('../src/core/OfflineManager')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(() => require('../src/core/SmartConfig')).not.toThrow();
  });
});
