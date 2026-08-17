/**
 * Global Auth Manager - Works Without MinderDataProvider
 * 
 * Provides authentication functionality that works everywhere:
 * - With MinderDataProvider (enhanced features)
 * - Without MinderDataProvider (standalone mode)
 * 
 * Features:
 * - Token storage (localStorage, sessionStorage, memory)
 * - Auto token restoration on page load
 * - JWT parsing and validation
 * - Refresh token support
 */

import { parseJWT as decodeJwt, isTokenUsable } from '../utils/jwt.js';
import { minderStore, lazySingletonProxy } from '../core/singletons.js';

interface GlobalAuthConfig {
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  tokenKey?: string;
  refreshTokenKey?: string;
}

class GlobalAuthManager {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private user: any = null;
  private storage: 'localStorage' | 'sessionStorage' | 'memory' = 'localStorage';
  private tokenKey = 'minder_auth_token';
  private refreshTokenKey = 'minder_refresh_token';

  constructor(config?: GlobalAuthConfig) {
    if (config?.storage) {
      this.storage = config.storage;
    }
    if (config?.tokenKey) {
      this.tokenKey = config.tokenKey;
    }
    if (config?.refreshTokenKey) {
      this.refreshTokenKey = config.refreshTokenKey;
    }

    // Try to restore tokens from storage on initialization
    this.restoreFromStorage();
  }

  private restoreFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      if (this.storage === 'localStorage') {
        this.token = localStorage.getItem(this.tokenKey);
        this.refreshToken = localStorage.getItem(this.refreshTokenKey);
      } else if (this.storage === 'sessionStorage') {
        this.token = sessionStorage.getItem(this.tokenKey);
        this.refreshToken = sessionStorage.getItem(this.refreshTokenKey);
      }

      // Try to parse user from token
      if (this.token) {
        this.user = this.parseJWT(this.token);
      }
    } catch (error) {
      console.error('[GlobalAuthManager] Failed to restore tokens:', error);
    }
  }

  private parseJWT(token: string): any {
    return decodeJwt(token);
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
    this.user = this.parseJWT(token);

    if (typeof window !== 'undefined' && this.storage !== 'memory') {
      try {
        if (this.storage === 'localStorage') {
          localStorage.setItem(this.tokenKey, token);
        } else if (this.storage === 'sessionStorage') {
          sessionStorage.setItem(this.tokenKey, token);
        }
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to save token:', error);
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async setRefreshToken(token: string): Promise<void> {
    this.refreshToken = token;

    if (typeof window !== 'undefined' && this.storage !== 'memory') {
      try {
        if (this.storage === 'localStorage') {
          localStorage.setItem(this.refreshTokenKey, token);
        } else if (this.storage === 'sessionStorage') {
          sessionStorage.setItem(this.refreshTokenKey, token);
        }
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to save refresh token:', error);
      }
    }
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  async clearAuth(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    this.user = null;

    if (typeof window !== 'undefined' && this.storage !== 'memory') {
      try {
        if (this.storage === 'localStorage') {
          localStorage.removeItem(this.tokenKey);
          localStorage.removeItem(this.refreshTokenKey);
        } else if (this.storage === 'sessionStorage') {
          sessionStorage.removeItem(this.tokenKey);
          sessionStorage.removeItem(this.refreshTokenKey);
        }
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to clear auth:', error);
      }
    }
  }

  /**
   * Same fail-closed semantics as AuthManager.isAuthenticated() (this is the
   * no-provider fallback path in useMinder). No signature verification —
   * see isTokenUsable().
   */
  isAuthenticated(): boolean {
    return isTokenUsable(this.token);
  }

  getCurrentUser(): any {
    return this.user;
  }

  isTokenExpired(): boolean {
    if (!this.token) return true;

    const user = this.user || this.parseJWT(this.token);
    if (!user || !user.exp) return false;

    // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
    return Date.now() >= user.exp * 1000;
  }

  getTokenExpiryTime(): number | null {
    if (!this.token) return null;

    const user = this.user || this.parseJWT(this.token);
    if (!user || !user.exp) return null;

    return user.exp * 1000; // Convert to milliseconds
  }
}

// Global singleton instance (A5). Backed by the process-wide singleton store
// (../core/singletons.ts) so its identity survives however a consumer's bundler
// splits/duplicates chunks — one auth manager, one restored-token state, shared
// across every entry. Exported through `lazySingletonProxy` so the binding keeps
// its object API (`globalAuthManager.getToken()`, etc. — P1, zero public-API
// change) while DEFERRING `new GlobalAuthManager()` from import time to the first
// property access (A5, Spec 1.3c). `/*#__PURE__*/` lets a tree-shaker drop it for
// consumers that never reference it.
//
// P2 — security invariants UNTOUCHED. Client auth = presence + expiry only, and
// corrupt JWTs fail closed via isTokenExpired/isTokenUsable; those live in the
// class methods, which the proxy forwards to verbatim. The only behavioural delta
// is TIMING: constructor work (incl. restoreFromStorage) now runs on first access
// instead of at import. This is safe — the first method call constructs-then-runs,
// so any consumer that reads the manager still observes the restored token before
// acting; no auth decision is made against an unconstructed manager. The exported
// value binding and its `GlobalAuthManager` type are unchanged (P1).
function globalAuthManagerSingleton(): GlobalAuthManager {
  const s = minderStore();
  return (s.globalAuthManager ??= new GlobalAuthManager());
}
export const globalAuthManager = /*#__PURE__*/ lazySingletonProxy(globalAuthManagerSingleton);

// Export class for custom instances
export { GlobalAuthManager };
