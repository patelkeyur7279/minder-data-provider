/**
 * Framework-agnostic observers (Phase 6, increment 2).
 *
 * Thin wrappers over @tanstack/query-core's QueryObserver / MutationObserver that
 * expose the `subscribe` / `getSnapshot` contract React's `useSyncExternalStore`
 * (and the equivalent Vue/Svelte/Solid primitives) consume. This is the seam that
 * lets a future `useMinder` shed its direct `useQuery`/`useMutation` dependency
 * and lets non-React bindings drive the same engine.
 *
 * CRITICAL CONTRACT: `getSnapshot()` returns query-core's `getCurrentResult()`,
 * which is referentially STABLE between notifications. `useSyncExternalStore`
 * requires this — returning a fresh object each call causes an infinite render
 * loop. The accompanying tests lock this invariant in.
 *
 * Additive and currently unconsumed by design: increment 4 wires `useMinder`
 * onto these; nothing here changes existing behavior.
 */
import {
  QueryClient,
  QueryObserver,
  MutationObserver,
  notifyManager,
  type QueryKey,
  type QueryObserverResult,
  type QueryObserverOptions,
  type MutationObserverResult,
  type MutationObserverOptions,
} from '@tanstack/query-core';

/**
 * Minimal external-store shape consumed by `useSyncExternalStore` and friends.
 */
export interface MinderStore<TSnapshot> {
  subscribe(onStoreChange: () => void): () => void;
  getSnapshot(): TSnapshot;
  getServerSnapshot(): TSnapshot;
}

/**
 * Observe a single query. `getSnapshot()` is referentially stable between
 * notifications (see CRITICAL CONTRACT above).
 */
export class MinderQueryObserver<TData = unknown, TError = Error>
  implements MinderStore<QueryObserverResult<TData, TError>>
{
  private readonly observer: QueryObserver<TData, TError, TData, TData, QueryKey>;

  constructor(
    client: QueryClient,
    options: QueryObserverOptions<TData, TError, TData, TData, QueryKey>
  ) {
    this.observer = new QueryObserver(client, options);
  }

  subscribe = (onStoreChange: () => void): (() => void) => {
    // batchCalls coalesces synchronous notifications (matches react-query).
    return this.observer.subscribe(notifyManager.batchCalls(onStoreChange));
  };

  getSnapshot = (): QueryObserverResult<TData, TError> => this.observer.getCurrentResult();

  getServerSnapshot = (): QueryObserverResult<TData, TError> => this.observer.getCurrentResult();

  setOptions(options: QueryObserverOptions<TData, TError, TData, TData, QueryKey>): void {
    this.observer.setOptions(options);
  }

  refetch(): Promise<QueryObserverResult<TData, TError>> {
    return this.observer.refetch();
  }

  /** Release the underlying observer (unsubscribes any internal listeners). */
  destroy(): void {
    this.observer.destroy();
  }
}

/**
 * Observe a mutation. `mutate()`/`reset()` drive it; `getSnapshot()` is stable.
 */
export class MinderMutationObserver<TData = unknown, TError = Error, TVariables = void>
  implements MinderStore<MutationObserverResult<TData, TError, TVariables, unknown>>
{
  private readonly observer: MutationObserver<TData, TError, TVariables, unknown>;

  constructor(
    client: QueryClient,
    options: MutationObserverOptions<TData, TError, TVariables, unknown>
  ) {
    this.observer = new MutationObserver(client, options);
  }

  subscribe = (onStoreChange: () => void): (() => void) => {
    return this.observer.subscribe(notifyManager.batchCalls(onStoreChange));
  };

  getSnapshot = (): MutationObserverResult<TData, TError, TVariables, unknown> =>
    this.observer.getCurrentResult();

  getServerSnapshot = (): MutationObserverResult<TData, TError, TVariables, unknown> =>
    this.observer.getCurrentResult();

  mutate(variables: TVariables): Promise<TData> {
    return this.observer.mutate(variables);
  }

  reset(): void {
    this.observer.reset();
  }
}
