/**
 * @jest-environment jsdom
 *
 * Phase 2: the `/hook` subpath must re-export the ONE canonical useMinder, not a
 * separate diverging copy.
 */
import { describe, it, expect } from '@jest/globals';
import { useMinder as hookEntry, MinderDataProvider, MinderError } from '../src/hook';
import hookDefault from '../src/hook';
import { useMinder as canonical } from '../src/hooks/useMinder';

describe('/hook entry is a shim of the canonical hook (Phase 2)', () => {
  it('re-exports the same useMinder reference (named + default)', () => {
    expect(hookEntry).toBe(canonical);
    expect(hookDefault).toBe(canonical);
  });

  it('still exports the provider and error helpers', () => {
    expect(typeof MinderDataProvider).toBe('function');
    expect(typeof MinderError).toBe('function');
  });
});
