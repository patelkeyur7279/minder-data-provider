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
jest.mock('../src/core/MinderDataProvider', () => ({
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
