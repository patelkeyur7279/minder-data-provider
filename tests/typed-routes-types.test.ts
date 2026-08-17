/**
 * QR-D1 — compile-time type test. This file is checked by `npm run
 * type-check` (see tsconfig.json's `include`, which lists this file
 * explicitly alongside `src/**\/*`) AND by ts-jest when the suite runs — both
 * paths type-check it, so a bad inference or a missing `@ts-expect-error`
 * fails the build either way. The assertions live at module scope so tsc
 * evaluates them; the lone `it()` below just keeps jest happy (jest requires
 * at least one test per file) — none of the `assert*` functions declared
 * below are ever CALLED, only type-checked, so there's no "hook outside a
 * component" runtime violation.
 */
import { describe, it, expect } from '@jest/globals';
import { route, createTypedMinder } from '../src/core/typedRoutes';
import { useMinder } from '../src/hooks/useMinder';

// ----------------------------------------------------------------------------
// Local compile-time equality helper (no external deps) — the standard
// "type-challenges" Equal/Expect idiom: `Expect<Equal<A, B>>` is only valid
// when A and B are exactly the same type, so a wrong inference fails tsc with
// "Type 'false' does not satisfy the constraint 'true'".
// ----------------------------------------------------------------------------
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

interface User {
  id: number;
  name: string;
}

// ----------------------------------------------------------------------------
// (a) createTypedMinder({ users: route<{id:number}[]>('/users') }).useMinder('users')
//     returns `.data` typed as `{id:number}[] | null`.
// ----------------------------------------------------------------------------
function assertUseMinderInfersResponseType() {
  const api = createTypedMinder({
    users: route<{ id: number }[]>('/users'),
  });

  const result = api.useMinder('users');
  type _dataIsInferred = Expect<Equal<typeof result.data, { id: number }[] | null>>;
}

// Same check with a named interface response, to prove it isn't special-cased
// to array/object literal shapes.
function assertUseMinderInfersNamedInterface() {
  const api = createTypedMinder({
    user: route<User>('/users/:id'),
  });

  const result = api.useMinder('user');
  type _dataIsInferred = Expect<Equal<typeof result.data, User | null>>;
}

// Bonus: `minder()` (the async function form) infers the same way through
// `Promise<MinderResult<...>>`.
async function assertMinderInfersResponseType() {
  const api = createTypedMinder({
    users: route<{ id: number }[]>('/users'),
  });

  const result = await api.minder('users');
  type _dataIsInferred = Expect<Equal<typeof result.data, { id: number }[] | null>>;
}

// ----------------------------------------------------------------------------
// (b) A wrong key is a compile-time error.
// ----------------------------------------------------------------------------
function assertWrongKeyIsTypeError() {
  const api = createTypedMinder({
    users: route<{ id: number }[]>('/users'),
  });

  // @ts-expect-error - "nope" is not a key of the routes map passed to createTypedMinder
  api.useMinder('nope');
}

// ----------------------------------------------------------------------------
// (c) The existing untyped `useMinder('/anything')` string call still
// compiles unchanged — createTypedMinder is additive, not a replacement.
// ----------------------------------------------------------------------------
function assertExistingStringApiStillCompiles() {
  const result = useMinder('/anything');
  // Untyped call: `data` stays `any`, exactly as before this feature existed.
  type _dataIsAny = typeof result.data;
  const _value: _dataIsAny = 'still any' as any;
  void _value;
}

describe('typed routes — compile-time inference (validated by tsc, not runtime)', () => {
  it('is a placeholder so jest has a runnable test in this file', () => {
    expect(true).toBe(true);
  });
});
