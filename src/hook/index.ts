/**
 * 🎣 minder-data-provider/hook — re-export of the canonical hook.
 *
 * @deprecated This entry point previously shipped a SEPARATE, reduced copy of
 * `useMinder` that diverged from the main implementation (and never received its
 * fixes). It now re-exports the single canonical `useMinder` so the `/hook`
 * subpath stays consistent and gets every reliability/feature update.
 *
 * Prefer importing from `minder-data-provider` (full) or
 * `minder-data-provider/core` (minimal).
 *
 * @example
 * import { MinderDataProvider, useMinder } from 'minder-data-provider/hook';
 *
 * function App() {
 *   return (
 *     <MinderDataProvider config={{ apiBaseUrl: '/api', routes: {} }}>
 *       <MyComponent />
 *     </MinderDataProvider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const { data, loading } = useMinder('users');
 *   // ...
 * }
 */

// Canonical hook + its public types (single source of truth).
export { useMinder } from '../hooks/useMinder.js';
export type { UseMinderOptions, UseMinderReturn } from '../hooks/useMinder.js';

// Provider/context needed for the hook to work.
export { MinderDataProvider, useMinderContext } from '../core/MinderDataProvider.js';

// Error helpers (unchanged public surface).
export {
  MinderError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from '../errors/index.js';

// Default export preserved for backward compatibility.
export { useMinder as default } from '../hooks/useMinder.js';
