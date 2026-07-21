/**
 * @jest-environment node
 *
 * MDPD-32 — Unguarded `document` access in PlatformDetector.isNextJs()
 *
 * React Native's setUpGlobals sets `global.window = global` so `window` exists
 * but `document` never does. When RN detection does not short-circuit first,
 * detection reaches isNextJs(), which dereferences a bare `document` and throws
 * `ReferenceError: document is not defined`.
 *
 * A node test environment (no window, no document by default) lets us install
 * RN-like globals faithfully: window present, document absent.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlatformDetector } from '../src/platform/index';

describe('MDPD-32: PlatformDetector.isNextJs() document guard', () => {
  beforeEach(() => {
    PlatformDetector.reset();
    // React Native sets global.window = global
    (global as any).window = global;
  });

  afterEach(() => {
    delete (global as any).window;
    PlatformDetector.reset();
  });

  it('does not throw when window exists but document is undefined (RN-like globals)', () => {
    // No document is defined in the node environment — this mirrors React Native.
    // Electron/Expo/RN detectors do not match, so detection reaches isNextJs().
    expect(typeof (global as any).document).toBe('undefined');

    expect(() => PlatformDetector.detect()).not.toThrow();
    // With no Next.js markers, it resolves to a web platform.
    expect(PlatformDetector.detect()).toBe('web');
  });
});
