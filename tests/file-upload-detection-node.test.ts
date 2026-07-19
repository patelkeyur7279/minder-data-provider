/**
 * @jest-environment node
 *
 * Regression guard for the "FileList is not defined" crash (found by the OSS-05
 * benchmark). `isFileUpload` referenced the browser-only globals `File`/`FileList`
 * bare; in Node/SSR/edge those are undefined, so `data instanceof FileList` threw
 * `ReferenceError: FileList is not defined` for ANY minder() call with a body
 * (every POST/PUT/PATCH) — completely breaking server-side writes. The repo's
 * default jsdom test environment provides these globals, which is why it was
 * never caught; this file runs in the `node` environment (no FileList) so it
 * reproduces the real server condition.
 */
import { describe, it, expect } from '@jest/globals';
import { isFileUpload, isEdgeRuntime } from '../src/core/minder/utils';

describe('isFileUpload in a Node environment (no FileList global)', () => {
  it('FileList is genuinely undefined here (so this test exercises the real Node condition)', () => {
    expect(typeof (globalThis as Record<string, unknown>).FileList).toBe('undefined');
  });

  it('does not throw for a plain body object (the POST/PUT/PATCH case)', () => {
    expect(() => isFileUpload({ name: 'x', age: 3 })).not.toThrow();
    expect(isFileUpload({ name: 'x' })).toBe(false);
  });

  it('handles primitives and falsy data without throwing', () => {
    for (const v of [undefined, null, 0, '', 'str', 42, true, [1, 2, 3]]) {
      expect(() => isFileUpload(v)).not.toThrow();
    }
  });

  it('still detects a Blob when that global exists (Node 18+ provides Blob)', () => {
    if (typeof Blob !== 'undefined') {
      expect(isFileUpload(new Blob(['x']))).toBe(true);
    }
  });
});

describe('isEdgeRuntime — transport auto-selection (QR-E1)', () => {
  it('is true only for edge: global fetch, not Node, not a classic browser', () => {
    expect(isEdgeRuntime({ fetch: () => undefined })).toBe(true);
    expect(isEdgeRuntime({ fetch: () => undefined, XMLHttpRequest: undefined })).toBe(true);
  });
  it('is false in Node (process.versions.node present)', () => {
    expect(isEdgeRuntime({ fetch: () => undefined, process: { versions: { node: '22.0.0' } } })).toBe(false);
  });
  it('is false in a classic browser (XMLHttpRequest present)', () => {
    expect(isEdgeRuntime({ fetch: () => undefined, XMLHttpRequest: class {} })).toBe(false);
  });
  it('is false when there is no global fetch', () => {
    expect(isEdgeRuntime({})).toBe(false);
    expect(isEdgeRuntime({ fetch: undefined })).toBe(false);
  });
  it('the real runtime here is NOT edge -> axios default is preserved', () => {
    // This test file runs in the `node` env (process.versions.node present).
    expect(isEdgeRuntime()).toBe(false);
  });
});
