/**
 * Next.js Platform Entry Point
 * Optimized for Next.js with SSR/SSG support
 * Includes: Web features + SSR helpers + API route support
 */

// Everything from web
export * from './web.js';

// Capability contract hooks (provider foundation, task F-03) — already re-exported transitively
// via `export * from './web.js'` above; restated explicitly per the cross-task export contract.
export { useAuth, useCheckout, useStorage, useLive } from '../hooks/contracts.js';
export { registerCapabilityProvider } from '../contracts/registry.js';
export { registerMockProvider, getProviderConfig } from '../contracts/mockRegistry.js';

// SSR-specific features
export * from '../ssr/index.js';

// Server-side utilities
export { createSSRConfig, prefetchData, withSSR } from '../ssr/index.js';

// Enums (also re-exported directly - see platforms/web.ts). Uses a concrete
// value binding so esbuild eagerly runs the lazily-wrapped enum init thunk
// under `splitting` + `sideEffects:false`. See src/index.ts for the full
// rationale and tests/dist-entry-exports.test.ts for the regression guard.
import { HttpMethod as _HttpMethod } from '../constants/enums.js';
export const HttpMethod = _HttpMethod;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- legal TS value+type merge; the pair is what keeps the enum eagerly initialized
export type HttpMethod = _HttpMethod;
