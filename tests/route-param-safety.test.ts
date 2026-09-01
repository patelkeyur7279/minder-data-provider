/**
 * fix-route-param-dot-segment-detector (RELEASE BLOCKER): unit-level coverage
 * of the positive-definition redesign in `routeParamSafety.ts`. An architect
 * probe found the prior blacklist (`ROUTE_PARAM_HOSTILE_PATTERN`'s literal
 * `'..'` alternation) refused `'..'` but not a bare `'.'` segment or any of
 * its percent-encodings (`%2e`, `%2E`, `%252e`, ...) — `/users/.` normalizes
 * to `/users/` exactly the way `/users/..` normalizes past `/users`
 * entirely. The fix replaces the growing blacklist with two positive rules
 * (see `routeParamSafety.ts`'s header comment): no URL-structural character,
 * raw or decoded, and the fully decoded value is not a bare dot-segment.
 *
 * End-to-end proof that hostile values never reach a real wire — the
 * MANDATORY methodology for this fix — lives in the wire suite
 * (tests/wire/standalone-params-hostile.mjs's 'sph-dot-*' cases and
 * tests/wire/crud-id-hostile-inputs.mjs's 'f5-*' cases); this file isolates
 * the pure detector unit itself for fast, exhaustive coverage of every
 * value enumerated in the fix's own acceptance criteria, plus values beyond
 * that list that exercise the POSITIVE definition rather than a literal.
 */
import { describe, it, expect } from '@jest/globals';
import {
  validateRouteParamValue,
  decodeRouteParamBounded,
  ALL_DOTS_PATTERN,
  ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN,
} from '../src/core/apiClient/routeParamSafety';

describe('validateRouteParamValue — positive definition of a safe path segment', () => {
  describe('dot-segment gap (the blocking defect) — every encoding refused via ONE rule, not a growing blacklist', () => {
    const hostileDotValues: Array<[string, string]> = [
      ['.', 'bare single dot'],
      ['..', 'bare double dot (already covered pre-fix)'],
      ['...', 'triple dot — nothing-but-dots of any length'],
      ['%2e', 'single-encoded dot (lowercase)'],
      ['%2E', 'single-encoded dot (uppercase hex)'],
      ['%2e%2e', 'single-encoded double dot'],
      ['%252e', 'double-encoded dot'],
      ['%252e%252e', 'double-encoded double dot'],
      ['.%2e', 'mixed raw + encoded dot -> ".."'],
      ['%2e.', 'mixed encoded + raw dot -> ".."'],
    ];

    it.each(hostileDotValues)('refuses %j (%s)', (value) => {
      const result = validateRouteParamValue(value);
      expect(result.ok).toBe(false);
    });

    it('the decoded value for every hostile dot case really is nothing-but-dots (proves the rule, not a coincidence)', () => {
      for (const [value] of hostileDotValues) {
        const { decoded, malformed } = decodeRouteParamBounded(value);
        expect(malformed).toBe(false);
        expect(ALL_DOTS_PATTERN.test(decoded)).toBe(true);
      }
    });
  });

  describe('path-structural characters — raw and slash-combination traversal', () => {
    const hostileStructuralValues: Array<[string, string]> = [
      ['./.', 'dot-slash-dot — refused via the raw "/" character, not the dot rule'],
      ['..%2f', 'raw ".." + encoded slash -> decodes to "../"'],
      ['%2f..', 'encoded slash + raw ".." -> decodes to "/.."'],
      ['/', 'bare path separator'],
      ['\\', 'bare backslash'],
      ['5#', 'raw fragment delimiter'],
      ['5?a=1', 'raw query delimiter'],
      ['5\r\nX-Evil: 1', 'raw CRLF — request-line/header injection'],
      ['5%0d%0aX-Evil:1', 'percent-encoded CRLF'],
      ['5\x00evil', 'raw NUL byte'],
      ['5 evil', 'embedded raw space'],
    ];

    it.each(hostileStructuralValues)('refuses %j (%s)', (value) => {
      const result = validateRouteParamValue(value);
      expect(result.ok).toBe(false);
    });
  });

  describe('already-covered non-dot hostile shapes stay refused (no regression)', () => {
    it.each<[unknown, string]>([
      ['', 'empty string'],
      ['   ', 'whitespace-only'],
      [null, 'null'],
      [undefined, 'undefined'],
      [{}, 'plain object'],
      [['a', 'b'], 'array'],
      [Infinity, 'Infinity'],
      [NaN, 'NaN'],
      ['%c0%ae%c0%ae', 'malformed overlong UTF-8 percent-escape'],
      ['5%', 'bare trailing percent'],
    ])('refuses %j (%s)', (value) => {
      expect(validateRouteParamValue(value).ok).toBe(false);
    });
  });

  describe('POSITIVE CONTROLS — a guard that refuses valid input is its own defect', () => {
    it.each<[unknown, string]>([
      [0, 'the number zero'],
      ['007', 'a leading-zero string'],
      ['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'a UUID'],
      ['507f1f77bcf86cd799439011', 'a 24-hex ObjectId'],
      ['42', 'a plain numeric id (used against a nested route in the wire suite)'],
    ])('accepts %j (%s)', (value) => {
      const result = validateRouteParamValue(value);
      expect(result.ok).toBe(true);
    });

    it('accepts a bigint (10n)', () => {
      expect(validateRouteParamValue(10n).ok).toBe(true);
    });

    it('does NOT refuse a value that merely CONTAINS two dots without being wholly dots (precision of the positive rule over a substring blacklist)', () => {
      // A prior blacklist (`/\.\./`) matched ANY substring containing '..',
      // including ordinary identifiers like this one that never let a value
      // escape its segment (dot-segment normalization only applies when an
      // ENTIRE segment is '.'/'..'/'...', never to a substring inside a
      // longer segment). Refusing it would be an over-tightened guard.
      expect(validateRouteParamValue('abc..xyz').ok).toBe(true);
      expect(validateRouteParamValue('v1..2').ok).toBe(true);
      expect(validateRouteParamValue('file.name.ext').ok).toBe(true);
    });
  });
});

describe('ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN / ALL_DOTS_PATTERN — the two positive-definition primitives directly', () => {
  it('ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN matches every URL-structural character', () => {
    for (const ch of ['/', '\\', '?', '#', '\x00', '\x1f', ' ', '\x7f']) {
      expect(ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN.test(ch)).toBe(true);
    }
  });

  it('ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN does not flag an ordinary identifier', () => {
    expect(ROUTE_PARAM_STRUCTURAL_CHAR_PATTERN.test('user-42_v1.2')).toBe(false);
  });

  it('ALL_DOTS_PATTERN matches dot-only strings of any length and nothing else', () => {
    expect(ALL_DOTS_PATTERN.test('.')).toBe(true);
    expect(ALL_DOTS_PATTERN.test('..')).toBe(true);
    expect(ALL_DOTS_PATTERN.test('.....')).toBe(true);
    expect(ALL_DOTS_PATTERN.test('')).toBe(false);
    expect(ALL_DOTS_PATTERN.test('.a')).toBe(false);
    expect(ALL_DOTS_PATTERN.test('a.')).toBe(false);
  });
});
