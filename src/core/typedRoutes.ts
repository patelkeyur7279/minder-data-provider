/**
 * 🎯 QR-D1 — Opt-in TYPED ROUTES
 *
 * Adds compile-time response-type inference on top of the existing string-route
 * API WITHOUT changing `minder`/`useMinder` themselves — they remain fully
 * untyped escape hatches. This module is a thin, additive factory: every method
 * it returns DELEGATES to the real `minder()` / `useMinder()`. It never
 * re-implements fetching, caching, or hook state — it only resolves a route
 * NAME to a `{ url, method }` pair and carries the response type through the
 * type system via `ResponseOf<T>`.
 *
 * @example
 * const api = createTypedMinder({
 *   users: route<User[]>('/users'),
 *   user: route<User>('/users/:id', { method: HttpMethod.GET }),
 * });
 *
 * // data: User[] | null — no manual generic needed
 * const { data } = api.useMinder('users');
 *
 * // data: User | null
 * const { data } = await api.minder('user', undefined, { params: { id: '1' } });
 */

import { minder } from '../core/minder.js';
import type { MinderOptions, MinderResult } from '../core/minder.js';
import { useMinder } from '../hooks/useMinder.js';
import type { UseMinderOptions, UseMinderReturn } from '../hooks/useMinder.js';
import type { HttpMethod } from '../constants/enums.js';

// ============================================================================
// ROUTE DESCRIPTOR
// ============================================================================

/**
 * A typed route descriptor. `url`/`method` are the exact same values you'd
 * otherwise pass straight to `minder()`/`useMinder()` — `TResponse` is a
 * PHANTOM type parameter: it exists only so `ResponseOf<T>` can recover it at
 * compile time. It is never assigned, read, or serialized at runtime.
 */
export interface TypedRoute<TResponse> {
  url: string;
  method?: HttpMethod;
  /** Type-only marker; never set at runtime. */
  readonly __response?: TResponse;
}

/**
 * Declare a single typed route.
 *
 * @example
 * const usersRoute = route<User[]>('/users');
 * const userRoute = route<User>('/users/:id', { method: HttpMethod.GET });
 */
export function route<TResponse>(
  url: string,
  opts?: { method?: HttpMethod }
): TypedRoute<TResponse> {
  return { url, method: opts?.method };
}

/**
 * Extracts the response type carried by a `TypedRoute`. Falls back to
 * `unknown` for anything that isn't a `TypedRoute`.
 */
export type ResponseOf<T> = T extends TypedRoute<infer U> ? U : unknown;

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Build a typed `minder`/`useMinder` pair from a map of named routes.
 *
 * Each returned method looks up `routes[key]` for its `url` (and `method`, if
 * set) and DELEGATES to the real `minder()` / `useMinder()` — passing the
 * resolved url as the route string and merging the route's method into
 * options (an explicit `options.method` from the caller still wins, matching
 * how `minder()` itself prioritizes an explicit option over a registry/route
 * default). The only thing added here is compile-time inference of the
 * response type via `ResponseOf<R[K]>`.
 */
export function createTypedMinder<R extends Record<string, TypedRoute<any>>>(
  routes: R
): {
  minder: <K extends keyof R>(
    key: K,
    data?: unknown,
    options?: MinderOptions
  ) => Promise<MinderResult<ResponseOf<R[K]>>>;
  useMinder: <K extends keyof R>(
    key: K,
    options?: UseMinderOptions
  ) => UseMinderReturn<ResponseOf<R[K]>>;
} {
  const typedMinder = <K extends keyof R>(
    key: K,
    data?: unknown,
    options?: MinderOptions
  ): Promise<MinderResult<ResponseOf<R[K]>>> => {
    // Non-null: `key` is constrained to `keyof R`, so `routes[key]` is always
    // present — `noUncheckedIndexedAccess` can't see that through the generic.
    const entry = routes[key]!;
    // `entry.method` is a `constants/enums.ts` HttpMethod (7 members, incl.
    // HEAD/OPTIONS); `MinderOptions['method']` is the narrower 5-member union
    // `minder()` itself accepts. The cast only bridges that pre-existing gap
    // between the two `HttpMethod` types — it doesn't widen what callers of
    // `route()` can pass in (still checked against the full enum).
    const method = (options?.method ?? entry.method) as MinderOptions['method'];
    const mergedOptions: MinderOptions = entry.method
      ? { ...options, method }
      : (options ?? {});
    return minder<ResponseOf<R[K]>>(entry.url, data, mergedOptions);
  };

  // Named `useTypedMinder` (not `typedUseMinder`) so eslint-plugin-react-hooks
  // recognizes it as a hook wrapper (its `rules-of-hooks` check requires the
  // enclosing function name to start with `use`) — it calls the real
  // `useMinder()` internally, so it IS a hook and must follow the same rules.
  const useTypedMinder = <K extends keyof R>(
    key: K,
    options?: UseMinderOptions
  ): UseMinderReturn<ResponseOf<R[K]>> => {
    const entry = routes[key]!;
    const method = (options?.method ?? entry.method) as UseMinderOptions<ResponseOf<R[K]>>['method'];
    const mergedOptions: UseMinderOptions<ResponseOf<R[K]>> = entry.method
      ? { ...options, method }
      : (options ?? {});
    return useMinder<ResponseOf<R[K]>>(entry.url, mergedOptions);
  };

  return { minder: typedMinder, useMinder: useTypedMinder };
}
