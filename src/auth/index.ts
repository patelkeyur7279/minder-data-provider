// Modular Auth exports
export { useAuth, useCurrentUser } from '../hooks/index.js';
export { AuthManager } from '../core/AuthManager.js';
export type { AuthConfig, SessionData } from '../core/types.js';

// Token Refresh
export {
  TokenRefreshManager,
  createTokenRefreshManager,
  type TokenRefreshConfig,
  type JWTPayload,
} from './TokenRefreshManager.js';