/**
 * @jest-environment node
 *
 * MDPD — Unguarded `process.env` access in
 * PlatformDetector.detectServerPlatform() (src/platform/PlatformDetector.ts).
 *
 * `detectServerPlatform()` bare-accessed `process.env.NEXT_RUNTIME` /
 * `process.env.__NEXT_PROCESSED_ENV`. Environments without `window` AND
 * without `process` (browser Web Workers, some edge runtimes) exist — a bare
 * `process.env` reference throws `ReferenceError: process is not defined`
 * there. The same file already guards correctly for this class of defect at
 * `isElectron()` (`typeof process !== 'undefined' && process.versions?.electron`);
 * this applies the same guard style to the server-detection path.
 *
 * A node test environment (no `window` by default) exercises
 * `detectServerPlatform()` directly; temporarily deleting `globalThis.process`
 * reproduces the process-less environment.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlatformDetector } from '../src/platform/PlatformDetector';

describe('PlatformDetector: process-less environment guard', () => {
  beforeEach(() => {
    PlatformDetector.reset();
  });

  afterEach(() => {
    PlatformDetector.reset();
  });

  it('does not throw when both window and process are absent', () => {
    expect(typeof (globalThis as any).window).toBe('undefined');

    const savedProcess = (globalThis as any).process;
    delete (globalThis as any).process;

    try {
      let platform: string | undefined;
      expect(() => {
        platform = PlatformDetector.detect();
      }).not.toThrow();
      // No `process`, no `__NEXT_DATA__` — falls through to the Node.js default.
      expect(platform).toBe('node');
    } finally {
      (globalThis as any).process = savedProcess;
    }
  });
});
