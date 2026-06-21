/**
 * minder-data-provider/core — minimal entry point.
 *
 * The smallest possible public surface: the universal data function, the React
 * hook, the provider, configuration, and the core types/errors. Importing from
 * here lets bundlers tree-shake away every optional feature you don't use
 * (auth/cache/websocket/upload/devtools/plugins), keeping the data path tiny.
 *
 * Need a feature? Import it from its dedicated subpath (e.g.
 * `minder-data-provider/auth`, `/cache`, `/websocket`, `/upload`) or from the
 * full `minder-data-provider` entry.
 *
 * @example
 * import { useMinder, minder, configureMinder } from 'minder-data-provider/core';
 * const { data, loading } = useMinder('users');
 */

// Core universal function + React hook + provider
export { minder } from './core/minder.js';
export { useMinder } from './hooks/useMinder.js';
export { configureMinder } from './config/index.js';
export {
  MinderDataProvider,
  useMinderContext,
} from './core/MinderDataProvider.js';

// Core types
export type {
  MinderOptions,
  MinderResult,
  MinderError as MinderRequestError,
  UploadProgress,
} from './core/minder.js';

// Typed error classes for error handling
export {
  MinderError,
  MinderConfigError,
  MinderNetworkError,
  MinderValidationError,
  MinderAuthError,
  MinderTimeoutError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from './errors/index.js';
