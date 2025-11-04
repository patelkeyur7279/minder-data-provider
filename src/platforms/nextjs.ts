/**
 * Next.js Platform Entry Point
 * Optimized for Next.js with SSR/SSG support
 * Includes: Web features + SSR helpers + API route support
 */

// Everything from web
export * from './web.js';

// SSR-specific features
export * from '../ssr/index.js';

// Server-side utilities
export { createSSRConfig, prefetchData, withSSR } from '../ssr/index.js';
