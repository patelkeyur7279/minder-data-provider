/**
 * `minder-data-provider/devtools-rq`
 *
 * OPT-IN entry point for `@tanstack/react-query-devtools` (B5,
 * fix-2.2.0-blockers).
 *
 * Prior releases auto-wired `<ReactQueryDevtools>` from inside the shared
 * provider chunk reachable by every entry point (root, `/core`, `/hook`, and
 * every platform entry). Because `@tanstack/react-query-devtools` is only an
 * OPTIONAL peer dependency, that `import("@tanstack/react-query-devtools")`
 * call — even dynamic, even behind a runtime `NODE_ENV` check — was resolved
 * STATICALLY by esbuild and Metro at bundle time, so every consumer who had
 * not installed the devtools package failed to bundle at all. That
 * auto-wiring has been removed from `LazyDependencyLoader.loadDevTools()`
 * and `MinderDataProvider` (see the inline B5 notes at those call sites).
 *
 * This module is the replacement: importing it is the consumer's explicit,
 * deliberate opt-in. It is never imported by any other entry point in this
 * package, so a consumer who never imports `minder-data-provider/devtools-rq`
 * never needs `@tanstack/react-query-devtools` installed at all — install it
 * yourself (`npm i -D @tanstack/react-query-devtools`) only if you actually
 * use this entry.
 *
 * @example Mount it directly — equivalent to the auto-mount `MinderDataProvider` used to do
 * ```tsx
 * import { ReactQueryDevtools } from 'minder-data-provider/devtools-rq';
 *
 * function App() {
 *   return (
 *     <MinderDataProvider config={config}>
 *       <YourApp />
 *       {process.env.NODE_ENV !== 'production' && (
 *         <ReactQueryDevtools initialIsOpen={false} />
 *       )}
 *     </MinderDataProvider>
 *   );
 * }
 * ```
 *
 * @example Load it lazily — equivalent to the old `LazyDependencyLoader.loadDevTools()`
 * ```ts
 * import { loadReactQueryDevtools } from 'minder-data-provider/devtools-rq';
 *
 * if (process.env.NODE_ENV !== 'production') {
 *   const DevtoolsComponent = await loadReactQueryDevtools();
 *   // mount DevtoolsComponent yourself, e.g. via a portal
 * }
 * ```
 */
import type { ComponentProps } from 'react';
import type { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export { ReactQueryDevtools, ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
export type { DevtoolsPanelOptions } from '@tanstack/react-query-devtools';

/**
 * The devtools package does not export its own `ReactQueryDevtools` props
 * type from its root entry, so it is re-derived here for anyone who wants
 * it (e.g. to type a wrapper component).
 */
export type ReactQueryDevtoolsProps = ComponentProps<typeof ReactQueryDevtools>;

/**
 * Dynamically import `@tanstack/react-query-devtools` and resolve its
 * `ReactQueryDevtools` component. Only ever called from code that imported
 * *this* module in the first place, so — unlike the removed internal
 * loader — the `import()` below can never be reached by a consumer who
 * hasn't opted in, and never needs to be resolved unless this function is
 * actually called.
 *
 * Deliberately left without an explicit return-type annotation: annotating
 * it against the statically-imported `ReactQueryDevtoolsProps` type above
 * forces the TS compiler to structurally compare two separately-resolved
 * copies of `@tanstack/query-core`'s `QueryClient` (one via this file's
 * static `import type`, one via the dynamic `import()` below) and fails
 * with a private-field identity mismatch — a dual-package-hazard artifact
 * of `@tanstack/react-query-devtools`'s dual ESM/CJS `exports` map, not a
 * real type error. Left inferred, both resolve through the same dynamic
 * `import()` and agree.
 */
export async function loadReactQueryDevtools() {
  const mod = await import('@tanstack/react-query-devtools');
  return mod.ReactQueryDevtools;
}
