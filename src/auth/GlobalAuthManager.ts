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
 *
 * P3 (platform storage capability): persistence used to be gated on
 * `typeof window !== 'undefined'`, which is true on React Native (RN aliases
 * `window = global`) even though neither `localStorage` nor `sessionStorage`
 * exists there. That made every read/write throw a caught-and-swallowed
 * ReferenceError, so tokens silently never persisted on native. `storage`
 * capability is now feature-detected directly (bare `globalThis[kind]` +
 * a functional test-write, never a bare identifier reference that can throw),
 * and when no functional browser Storage exists, persistence falls back to
 * the platform-appropriate adapter this package already ships
 * (AsyncStorage on React Native, SecureStore on Expo, electron-store on
 * Electron, memory otherwise) via {@link StorageAdapterFactory}.
 */

import { parseJWT as decodeJwt, isTokenUsable } from '../utils/jwt.js';
import { minderStore, lazySingletonProxy } from '../core/singletons.js';
import { isUsableTokenValue } from '../core/AuthManager.js';
import { StorageAdapterFactory } from '../platform/adapters/storage/StorageAdapterFactory.js';
import type { StorageAdapter } from '../platform/adapters/storage/StorageAdapter.js';

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
  /** Lazily-created fallback adapter, only touched when no functional browser Storage exists. */
  private platformAdapter?: StorageAdapter;
  /**
   * Resolves once initial restoration (sync browser-storage or async
   * platform-adapter) has completed. Sync (browser Storage / memory) resolves
   * immediately; the platform-adapter fallback has no synchronous API, so on
   * React Native/Expo/Electron restoration finishes shortly after
   * construction rather than during it. Callers that need to guarantee a
   * restored token before reading (e.g. app boot on native) can `await` this.
   */
  public ready: Promise<void> = Promise.resolve();

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

  /**
   * Feature-detect whether the browser Storage API named by `kind` is
   * actually present AND functional — not just "does `window` exist".
   * React Native aliases `window = global` but defines neither
   * `localStorage` nor `sessionStorage` at all; some browsers also disable
   * storage (private browsing, locked-down settings) even though the global
   * exists. Reads via bare `globalThis[kind]` so a missing global is simply
   * `undefined`, never a ReferenceError, and confirms usability with the same
   * functional test-write `StorageAdapterFactory` uses for its web adapter.
   */
  private detectBrowserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
    try {
      const candidate = (globalThis as unknown as Record<string, Storage | undefined>)[kind];
      if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
        return null;
      }
      const probeKey = '__minder_gam_probe__';
      candidate.setItem(probeKey, '1');
      candidate.removeItem(probeKey);
      return candidate;
    } catch {
      return null;
    }
  }

  /**
   * Lazily create the platform-appropriate storage adapter (AsyncStorage on
   * React Native, SecureStore on Expo, electron-store on Electron, memory
   * otherwise) used when no functional browser Storage is available.
   * `createWithFallback` never throws — a failed native adapter degrades to
   * `MemoryStorageAdapter` rather than losing the token entirely.
   */
  private getPlatformAdapter(): StorageAdapter {
    if (!this.platformAdapter) {
      this.platformAdapter = StorageAdapterFactory.createWithFallback();
    }
    return this.platformAdapter;
  }

  private restoreFromStorage(): void {
    if (this.storage === 'memory') return;

    const webStorage = this.detectBrowserStorage(this.storage);
    if (webStorage) {
      try {
        this.token = webStorage.getItem(this.tokenKey);
        this.refreshToken = webStorage.getItem(this.refreshTokenKey);

        // Try to parse user from token
        if (this.token) {
          this.user = this.parseJWT(this.token);
        }
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to restore tokens:', error);
      }
      return;
    }

    // No functional browser Storage (e.g. React Native) — fall back to the
    // platform storage adapter instead of silently never persisting.
    this.ready = this.restoreFromPlatformAdapter();
  }

  private async restoreFromPlatformAdapter(): Promise<void> {
    try {
      const adapter = this.getPlatformAdapter();
      const [token, refreshToken] = await Promise.all([
        adapter.getItem(this.tokenKey),
        adapter.getItem(this.refreshTokenKey),
      ]);

      if (token) {
        this.token = token;
        this.user = this.parseJWT(token);
      }
      if (refreshToken) {
        this.refreshToken = refreshToken;
      }
    } catch (error) {
      console.error('[GlobalAuthManager] Failed to restore tokens from platform storage:', error);
    }
  }

  /**
   * Persist `value` under `key` using whichever backing store applies:
   * functional browser Storage when available, else the platform adapter,
   * else a no-op (`storage: 'memory'`).
   */
  private async persistItem(key: string, value: string): Promise<void> {
    if (this.storage === 'memory') return;

    const webStorage = this.detectBrowserStorage(this.storage);
    if (webStorage) {
      try {
        webStorage.setItem(key, value);
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to save token:', error);
      }
      return;
    }

    try {
      await this.getPlatformAdapter().setItem(key, value);
    } catch (error) {
      console.error('[GlobalAuthManager] Failed to save token to platform storage:', error);
    }
  }

  /** Remove `key` from whichever backing store applies. Mirrors {@link persistItem}. */
  private async removeStoredItem(key: string): Promise<void> {
    if (this.storage === 'memory') return;

    const webStorage = this.detectBrowserStorage(this.storage);
    if (webStorage) {
      try {
        webStorage.removeItem(key);
      } catch (error) {
        console.error('[GlobalAuthManager] Failed to clear auth:', error);
      }
      return;
    }

    try {
      await this.getPlatformAdapter().removeItem(key);
    } catch (error) {
      console.error('[GlobalAuthManager] Failed to clear auth from platform storage:', error);
    }
  }

  private parseJWT(token: string): any {
    return decodeJwt(token);
  }

  /**
   * N2 (fix-2.2.0-blockers): this method deliberately does NOT use the
   * `async` keyword, even though it returns a `Promise<void>`. An `async`
   * function auto-wraps every `throw` in its body into a REJECTED PROMISE —
   * so `throw new Error(...)` below would never reach the caller as a real
   * synchronous exception. README's Security Model promises `setToken()`
   * "throws instead of storing" a bad value; a caller doing
   * `try { authManager.setToken(bad) } catch { ... }` (the natural,
   * synchronous-looking call site — see `useAuthToken()` in
   * `src/hooks/index.ts`, which does not/cannot await this in its returned
   * `setToken` wrapper) never ran inside a promise chain, so the rejection
   * had no attached handler and surfaced as a process-level UNHANDLED
   * REJECTION instead of a catchable throw — the exact contract README
   * documents was broken. Validating BEFORE any `await`/async work, in a
   * plain (non-`async`) function body, makes the bad-value case throw for
   * real, synchronously, into the immediate caller — while the valid-value
   * path is unchanged: it still returns the `persistItem()` promise so
   * `await globalAuthManager.setToken(good)` keeps working exactly as
   * before. `persistItem()` itself never rejects (every internal storage
   * error is caught and logged, not re-thrown), so this returned promise on
   * the valid path never becomes an unhandled rejection either.
   */
  setToken(token: string): Promise<void> {
    if (!isUsableTokenValue(token)) {
      throw new Error(
        `[GlobalAuthManager] setToken() refused an invalid token value (${JSON.stringify(token)}). ` +
        'Passing undefined/null/an empty string would previously be stored and made isAuthenticated() ' +
        'return true — auth failing open (H1). Pass a real, non-empty token string, or call ' +
        'clearAuth() to log out.'
      );
    }

    this.token = token;
    this.user = this.parseJWT(token);

    return this.persistItem(this.tokenKey, token);
  }

  getToken(): string | null {
    return this.token;
  }

  async setRefreshToken(token: string): Promise<void> {
    this.refreshToken = token;

    await this.persistItem(this.refreshTokenKey, token);
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  async clearAuth(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    this.user = null;

    await Promise.all([
      this.removeStoredItem(this.tokenKey),
      this.removeStoredItem(this.refreshTokenKey),
    ]);
  }

  /**
   * Same fail-closed semantics as AuthManager.isAuthenticated() (this is the
   * no-provider fallback path in useMinder). No signature verification —
   * see isTokenUsable(). H1 read-side rejection: `isUsableTokenValue` rejects
   * the `"undefined"`/`"null"` JS-coercion sentinels and empty strings before
   * `isTokenUsable` ever sees them, so a token persisted before the H1 fix
   * (or written by another tab) also reads back as unauthenticated.
   */
  isAuthenticated(): boolean {
    return isUsableTokenValue(this.token) && isTokenUsable(this.token);
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
