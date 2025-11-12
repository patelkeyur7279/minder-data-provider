import type { AuthConfig } from './types.js';
import type { DebugManager } from '../debug/DebugManager.js';
import { StorageType, DebugLogType } from '../constants/enums.js';

export class AuthManager {
  private config: AuthConfig;
  private memoryStorage: Map<string, string> = new Map();
  private debugManager?: DebugManager;
  private enableLogs: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private AsyncStorage: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private SecureStore: any = null;

  constructor(config?: AuthConfig, debugManager?: DebugManager, enableLogs: boolean = false) {
    this.config = config || {
      tokenKey: 'accessToken',
      storage: StorageType.MEMORY,
    };
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
    
    // Initialize platform-specific storage
    if (this.config.storage === StorageType.ASYNC_STORAGE) {
      try {
         
        this.AsyncStorage = require('@react-native-async-storage/async-storage').default;
      } catch {
        console.warn('[AuthManager] AsyncStorage not available, falling back to memory storage');
        this.config.storage = StorageType.MEMORY;
      }
    } else if (this.config.storage === StorageType.SECURE_STORE) {
      try {
         
        this.SecureStore = require('expo-secure-store');
      } catch {
        console.warn('[AuthManager] AsyncStorage not available, falling back to memory storage');
        this.config.storage = StorageType.MEMORY;
      }
    }
  }

  setToken(token: string): void {
    this.setItem(this.config.tokenKey, token);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.AUTH, '🔐 AUTH SET TOKEN', {
        tokenKey: this.config.tokenKey,
        storage: this.config.storage,
        tokenLength: token.length,
      });
    }
  }

  getToken(): string | null {
    const token = this.getItem(this.config.tokenKey);
    
    if (this.debugManager && this.enableLogs) {
      const emoji = token ? '✅' : '❌';
      this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH GET TOKEN`, {
        tokenKey: this.config.tokenKey,
        hasToken: !!token,
        storage: this.config.storage,
      });
    }
    
    return token;
  }

  setRefreshToken(token: string): void {
    this.setItem(`${this.config.tokenKey}_refresh`, token);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.AUTH, '🔄 AUTH SET REFRESH TOKEN', {
        tokenKey: `${this.config.tokenKey}_refresh`,
        storage: this.config.storage,
        tokenLength: token.length,
      });
    }
  }

  getRefreshToken(): string | null {
    const token = this.getItem(`${this.config.tokenKey}_refresh`);
    
    if (this.debugManager && this.enableLogs) {
      const emoji = token ? '✅' : '❌';
      this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH GET REFRESH TOKEN`, {
        tokenKey: `${this.config.tokenKey}_refresh`,
        hasToken: !!token,
        storage: this.config.storage,
      });
    }
    
    return token;
  }

  clearAuth(): void {
    this.removeItem(this.config.tokenKey);
    this.removeItem(`${this.config.tokenKey}_refresh`);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log(DebugLogType.AUTH, '🗑️ AUTH CLEAR', {
        tokenKey: this.config.tokenKey,
        storage: this.config.storage,
      });
    }
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.AUTH, '❌ AUTH CHECK: No token', {});
      }
      return false;
    }

    // Check if token is expired (if it's a JWT)
    try {
      // Validate JWT has 3 parts (header.payload.signature)
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[1]) {
        // Not a valid JWT format, assume it's valid
        if (this.debugManager && this.enableLogs) {
          this.debugManager.log(DebugLogType.AUTH, '✅ AUTH CHECK: Non-JWT token', {});
        }
        return true;
      }

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const now = Date.now() / 1000;
      const isValid = payload.exp ? payload.exp > now : true;
      
      if (this.debugManager && this.enableLogs) {
        const emoji = isValid ? '✅' : '⏰';
        const status = isValid ? 'VALID' : 'EXPIRED';
        this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH CHECK: ${status}`, {
          exp: payload.exp,
          now,
          isValid,
        });
      }
      
      return isValid;
    } catch {
      // If parsing fails, assume it's valid
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.AUTH, '✅ AUTH CHECK: Non-JWT token', {});
      }
      return true;
    }
  }

  private setItem(key: string, value: string): void {
    switch (this.config.storage) {
      case StorageType.SESSION_STORAGE:
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(key, value);
        }
        break;
      case StorageType.COOKIE:
        if (typeof document !== 'undefined') {
          document.cookie = `${key}=${value}; path=/; secure; samesite=strict`;
        }
        break;
      case StorageType.ASYNC_STORAGE:
        if (this.AsyncStorage) {
          // Async but we don't await - fire and forget for backwards compatibility
          this.AsyncStorage.setItem(key, value).catch((err: Error) => {
            console.error('[AuthManager] AsyncStorage setItem failed:', err);
          });
        } else {
          this.memoryStorage.set(key, value);
        }
        break;
      case StorageType.SECURE_STORE:
        if (this.SecureStore) {
          // Async but we don't await - fire and forget for backwards compatibility
          this.SecureStore.setItemAsync(key, value).catch((err: Error) => {
            console.error('[AuthManager] SecureStore setItemAsync failed:', err);
          });
        } else {
          this.memoryStorage.set(key, value);
        }
        break;
      case StorageType.MEMORY:
      default:
        this.memoryStorage.set(key, value);
        break;
    }
  }

  private getItem(key: string): string | null {
    switch (this.config.storage) {
      case StorageType.SESSION_STORAGE:
        if (typeof window !== 'undefined') {
          return sessionStorage.getItem(key);
        }
        break;
      case StorageType.COOKIE:
        if (typeof document !== 'undefined') {
          const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
          return match ? match[2] || null : null;
        }
        break;
      case StorageType.ASYNC_STORAGE:
        // Note: AsyncStorage is async, so we can't return the value synchronously
        // Users should rely on the async nature of React Native's auth flow
        // For immediate access, use memory storage
        console.warn('[AuthManager] AsyncStorage is async - token may not be immediately available. Consider using memory storage for synchronous access.');
        return this.memoryStorage.get(key) || null;
      case StorageType.SECURE_STORE:
        // Note: SecureStore is async, so we can't return the value synchronously
        console.warn('[AuthManager] SecureStore is async - token may not be immediately available. Consider using memory storage for synchronous access.');
        return this.memoryStorage.get(key) || null;
      case StorageType.MEMORY:
      default:
        return this.memoryStorage.get(key) || null;
    }
    return null;
  }

  /**
   * Async version of getItem for AsyncStorage and SecureStore
   * Use this when you need to retrieve tokens from async storage
   */
  async getItemAsync(key: string): Promise<string | null> {
    switch (this.config.storage) {
      case StorageType.ASYNC_STORAGE:
        if (this.AsyncStorage) {
          try {
            return await this.AsyncStorage.getItem(key);
          } catch (err) {
            console.error('[AuthManager] AsyncStorage getItem failed:', err);
            return null;
          }
        }
        break;
      case StorageType.SECURE_STORE:
        if (this.SecureStore) {
          try {
            return await this.SecureStore.getItemAsync(key);
          } catch (err) {
            console.error('[AuthManager] SecureStore getItemAsync failed:', err);
            return null;
          }
        }
        break;
      default:
        // For sync storage, just return the sync value
        return this.getItem(key);
    }
    return null;
  }

  /**
   * Async version of getToken for React Native/Expo
   */
  async getTokenAsync(): Promise<string | null> {
    const token = await this.getItemAsync(this.config.tokenKey);
    
    if (this.debugManager && this.enableLogs) {
      const emoji = token ? '✅' : '❌';
      this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH GET TOKEN (ASYNC)`, {
        tokenKey: this.config.tokenKey,
        hasToken: !!token,
        storage: this.config.storage,
      });
    }
    
    return token;
  }

  /**
   * Async version of getRefreshToken for React Native/Expo
   */
  async getRefreshTokenAsync(): Promise<string | null> {
    const token = await this.getItemAsync(`${this.config.tokenKey}_refresh`);
    
    if (this.debugManager && this.enableLogs) {
      const emoji = token ? '✅' : '❌';
      this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH GET REFRESH TOKEN (ASYNC)`, {
        tokenKey: `${this.config.tokenKey}_refresh`,
        hasToken: !!token,
        storage: this.config.storage,
      });
    }
    
    return token;
  }

  private removeItem(key: string): void {
    switch (this.config.storage) {
      case StorageType.SESSION_STORAGE:
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(key);
        }
        break;
      case StorageType.COOKIE:
        if (typeof document !== 'undefined') {
          document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
        break;
      case StorageType.ASYNC_STORAGE:
        if (this.AsyncStorage) {
          this.AsyncStorage.removeItem(key).catch((err: Error) => {
            console.error('[AuthManager] AsyncStorage removeItem failed:', err);
          });
        } else {
          this.memoryStorage.delete(key);
        }
        break;
      case StorageType.SECURE_STORE:
        if (this.SecureStore) {
          this.SecureStore.deleteItemAsync(key).catch((err: Error) => {
            console.error('[AuthManager] SecureStore deleteItemAsync failed:', err);
          });
        } else {
          this.memoryStorage.delete(key);
        }
        break;
      case StorageType.MEMORY:
      default:
        this.memoryStorage.delete(key);
        break;
    }
  }
}