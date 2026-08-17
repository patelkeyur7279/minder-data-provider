/**
 * Task 3.1 — Standard Schema response validation.
 *
 * Tests the pure `validateResponse` helper in isolation (no zod/valibot
 * dependency — fake validators matching the Standard Schema `~standard`
 * interface, per the design doc §7 test plan).
 */
import { describe, it, expect } from '@jest/globals';
import { validateResponse } from '../responseValidation';
import type { StandardSchemaV1 } from '../../types/standard-schema';

/** A minimal, spec-compliant SYNC validator: requires a numeric `id`. */
const okSchema: StandardSchemaV1<any, { id: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (v: any) =>
      v?.id != null
        ? { value: { id: Number(v.id) } }
        : { issues: [{ message: 'id required', path: ['id'] }] },
  },
};

/** Same contract, but ASYNC — delegates to okSchema's sync validate. */
const asyncSchema: StandardSchemaV1<any, { id: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: async (v: any) => okSchema['~standard'].validate(v),
  },
};

/** Spec-NON-compliant: throws instead of returning `{ issues }`. */
const throwingSchema: StandardSchemaV1<any, { id: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: () => {
      throw new Error('validator exploded');
    },
  },
};

describe('validateResponse', () => {
  it('returns ok:true with the (possibly transformed) value on a valid sync validator', async () => {
    const result = await validateResponse({ id: '42' }, okSchema);
    expect(result).toEqual({ ok: true, value: { id: 42 } });
  });

  it('returns ok:false with issues on an invalid sync validator', async () => {
    const result = await validateResponse({ name: 'no id' }, okSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ message: 'id required', path: ['id'] }]);
    }
  });

  it('awaits an async validator on the success branch', async () => {
    const result = await validateResponse({ id: 7 }, asyncSchema);
    expect(result).toEqual({ ok: true, value: { id: 7 } });
  });

  it('awaits an async validator on the failure branch', async () => {
    const result = await validateResponse({}, asyncSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ message: 'id required', path: ['id'] }]);
    }
  });

  it('fail-closed: a validator that throws is treated as a failure, never a pass', async () => {
    const result = await validateResponse({ id: 1 }, throwingSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([{ message: 'validator exploded' }]);
    }
  });
});
