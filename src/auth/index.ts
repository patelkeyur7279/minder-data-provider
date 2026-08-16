// Modular Auth exports
// `useAuth` here is the capability-contract hook (session backed by a registered
// certified provider) — the SAME hook exported from the root, /web, /nextjs, and
// /electron entry points. It used to be a different, incompatible hook (the
// client-side token store); that hook is now exported under its honest name,
// `useAuthToken`. See CHANGELOG.md / docs/MIGRATION_GUIDE.md (2.2.0-beta.2 → 2.2.0).
export { useAuthToken, useCurrentUser } from '../hooks/index.js';
export { useAuth } from '../hooks/contracts.js';
export type { UseAuthReturn } from '../hooks/contracts.js';
export { AuthManager } from '../core/AuthManager.js';
export type { AuthConfig, SessionData } from '../core/types.js';

// Token Refresh
export {
  TokenRefreshManager,
  createTokenRefreshManager,
  type TokenRefreshConfig,
  type JWTPayload,
} from './TokenRefreshManager.js';

// 🔒 Secure Authentication (NEW)
export {
  SecureAuthManager,
  createSecureAuthManager,
  type SecureAuthConfig,
  type CSRFToken,
} from './SecureAuthManager.js';