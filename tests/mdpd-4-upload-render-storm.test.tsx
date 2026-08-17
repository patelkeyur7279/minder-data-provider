/**
 * @jest-environment jsdom
 *
 * MDPD-4 (perf audit A4) — the upload progress path caused a re-render storm:
 * useMediaUpload committed React state on EVERY progress event, so a single
 * upload emitting ~50 progress ticks forced ~50 re-renders of the consumer.
 *
 * Fix: throttle progress state commits (trailing-edge, injectable interval) and
 * always commit the final/terminal (100%) value. Object/callback identities stay
 * stable so consumer effects don't cascade.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Capture the onProgress callback useMediaUpload hands to apiClient.uploadFile so
// the test can drive progress events one-at-a-time across separate act() flushes
// (React auto-batches synchronous updates within a single tick, so separate
// act() boundaries are what expose a genuine per-event render storm).
let capturedOnProgress: ((p: { loaded: number; total: number; percentage: number }) => void) | null =
  null;
const mockUploadFile = jest.fn((_route: string, _file: any, onProgress: any) => {
  capturedOnProgress = onProgress;
  return new Promise(() => {}); // stays pending; progress is driven manually
});

// Stable context value (React context returns a stable reference in real usage),
// so apiClient identity does not churn across renders.
const stableContext = { apiClient: { uploadFile: mockUploadFile } };
jest.mock('../src/core/MinderContext', () => ({
  useMinderContext: () => stableContext,
}));

import { useMediaUpload } from '../src/hooks/index';

describe('MDPD-4: upload progress does not cause a re-render storm', () => {
  let renderCount = 0;
  let hookApi: ReturnType<typeof useMediaUpload> | null = null;

  function Consumer() {
    renderCount++;
    hookApi = useMediaUpload('avatar', { throttleMs: 100 });
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    renderCount = 0;
    hookApi = null;
    capturedOnProgress = null;
    mockUploadFile.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('stays bounded (<= 12 renders) across ~50 progress events and commits the final value', () => {
    render(<Consumer />);
    const rendersAfterMount = renderCount; // 1

    // Kick off the upload (registers capturedOnProgress).
    act(() => {
      void hookApi!.uploadFile(new File(['x'], 'avatar.png', { type: 'image/png' }));
    });
    expect(capturedOnProgress).toBeInstanceOf(Function);

    const uploadFileRef = hookApi!.uploadFile; // must stay identity-stable

    // Emit 50 progress events across separate act() flushes; advance the throttle
    // interval every 10 events so a handful of trailing commits land.
    for (let i = 1; i <= 50; i++) {
      const percentage = i * 2; // 2..100
      act(() => {
        capturedOnProgress!({ loaded: i, total: 50, percentage });
      });
      if (i % 10 === 0) {
        act(() => {
          jest.advanceTimersByTime(100);
        });
      }
    }
    // Flush any remaining trailing timer.
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const renders = renderCount - rendersAfterMount;
    expect(renders).toBeLessThanOrEqual(12);

    // The terminal 100% value must always commit (never dropped by throttling).
    expect(hookApi!.progress.percentage).toBe(100);
    expect(hookApi!.isUploading).toBe(false);

    // Callback identity is stable across all the progress-driven renders.
    expect(hookApi!.uploadFile).toBe(uploadFileRef);
  });
});

// ============================================================================
// MDPD fix 3 — throttle reset on new upload + overlapping-upload serialization.
// Uses REAL timers (the reset path is synchronous; serialization is promise-based).
// ============================================================================
describe('MDPD-3: useMediaUpload resets progress + serializes overlapping uploads', () => {
  let hookApi2: ReturnType<typeof useMediaUpload> | null = null;

  function Consumer2() {
    hookApi2 = useMediaUpload('avatar', { throttleMs: 100 });
    return null;
  }

  beforeEach(() => {
    hookApi2 = null;
    mockUploadFile.mockReset();
  });

  it('a second upload starts from fresh progress (no stale 100% from the first)', async () => {
    let onProgressA: ((p: any) => void) | null = null;
    let resolveA: ((v: any) => void) | null = null;
    // First upload: capture its progress cb, stay pending until we resolve it.
    mockUploadFile.mockImplementationOnce((_r: string, _f: any, onP: any) => {
      onProgressA = onP;
      return new Promise((res) => {
        resolveA = res;
      });
    });

    render(<Consumer2 />);

    await act(async () => {
      void hookApi2!.uploadFile(new File(['a'], 'a.png', { type: 'image/png' }));
    });
    // Drive the first upload to a terminal 100% (commits immediately).
    act(() => {
      onProgressA!({ loaded: 100, total: 100, percentage: 100 });
    });
    expect(hookApi2!.progress.percentage).toBe(100);

    // Finish the first upload so the serialization chain clears.
    await act(async () => {
      resolveA!({ url: 'a' });
    });

    // Second upload: pending, no progress events yet.
    mockUploadFile.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      void hookApi2!.uploadFile(new File(['b'], 'b.png', { type: 'image/png' }));
    });

    // The stale 100% must be gone — reset() ran at the start of the 2nd upload.
    expect(hookApi2!.progress.percentage).toBe(0);
    expect(hookApi2!.isUploading).toBe(false);
  });

  it('overlapping uploadFile calls are serialized: the 2nd dispatches only after the 1st settles', async () => {
    const dispatched: string[] = [];
    let resolveA: ((v: any) => void) | null = null;

    mockUploadFile.mockImplementation((_r: string, file: any) => {
      dispatched.push(file.name);
      if (file.name === 'a') {
        return new Promise((res) => {
          resolveA = res;
        });
      }
      return Promise.resolve({ url: file.name });
    });

    render(<Consumer2 />);

    // Fire two uploads back-to-back while the first is still in flight.
    let pB: Promise<unknown> | undefined;
    await act(async () => {
      void hookApi2!.uploadFile(new File(['a'], 'a', { type: 'image/png' }));
      pB = hookApi2!.uploadFile(new File(['b'], 'b', { type: 'image/png' }));
    });

    // Only the first has been dispatched to apiClient; the second is queued.
    expect(dispatched).toEqual(['a']);

    // Settle the first — the second now dispatches behind it.
    await act(async () => {
      resolveA!({ url: 'a' });
      await pB;
    });
    expect(dispatched).toEqual(['a', 'b']);
  });
});
