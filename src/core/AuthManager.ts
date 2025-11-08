import type { AuthConfig } from './types.js';
import type { DebugManager } from '../debug/DebugManager.js';

export class AuthManager {
  private config: AuthConfig;
  private memoryStorage: Map<string, string> = new Map();
  private debugManager?: DebugManager;
  private enableLogs: boolean;

  constructor(config?: AuthConfig, debugManager?: DebugManager, enableLogs: boolean = false) {
    this.config = config || {
      tokenKey: 'accessToken',
      storage: 'localStorage',
    };
    this.debugManager = debugManager;
    this.enableLogs = enableLogs;
  }

  setToken(token: string): void {
    this.setItem(this.config.tokenKey, token);
    
    if (this.debugManager && this.enableLogs) {
      this.debugManager.log('auth', '🔐 AUTH SET TOKEN', {
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
      this.debugManager.log('auth', `${emoji} AUTH GET TOKEN`, {
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
      this.debugManager.log('auth', '🔄 AUTH SET REFRESH TOKEN', {
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
      this.debugManager.log('auth', `${emoji} AUTH GET REFRESH TOKEN`, {
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
      this.debugManager.log('auth', '🗑️ AUTH CLEAR', {
        tokenKey: this.config.tokenKey,
        storage: this.config.storage,
      });
    }
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log('auth', '❌ AUTH CHECK: No token', {});
      }
      return false;
    }

    // Check if token is expired (if it's a JWT)
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      const now = Date.now() / 1000;
      const isValid = payload.exp ? payload.exp > now : true;
      
      if (this.debugManager && this.enableLogs) {
        const emoji = isValid ? '✅' : '⏰';
        const status = isValid ? 'VALID' : 'EXPIRED';
        this.debugManager.log('auth', `${emoji} AUTH CHECK: ${status}`, {
          exp: payload.exp,
          now,
          isValid,
        });
      }
      
      return isValid;
    } catch {
      // If not a JWT, assume it's valid
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log('auth', '✅ AUTH CHECK: Non-JWT token', {});
      }
      return true;
    }
  }

  private setItem(key: string, value: string): void {
    switch (this.config.storage) {
      case 'localStorage':
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, value);
        }
        break;
      case 'sessionStorage':
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(key, value);
        }
        break;
      case 'cookie':
        if (typeof document !== 'undefined') {
          document.cookie = `${key}=${value}; path=/; secure; samesite=strict`;
        }
        break;
      case 'memory':
      default:
        this.memoryStorage.set(key, value);
        break;
    }
  }

  private getItem(key: string): string | null {
    switch (this.config.storage) {
      case 'localStorage':
        if (typeof window !== 'undefined') {
          return localStorage.getItem(key);
        }
        break;
      case 'sessionStorage':
        if (typeof window !== 'undefined') {
          return sessionStorage.getItem(key);
        }
        break;
      case 'cookie':
        if (typeof document !== 'undefined') {
          const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
          return match ? match[2] || null : null;
        }
        break;
      case 'memory':
      default:
        return this.memoryStorage.get(key) || null;
    }
    return null;
  }

  private removeItem(key: string): void {
    switch (this.config.storage) {
      case 'localStorage':
        if (typeof window !== 'undefined') {
          localStorage.removeItem(key);
        }
        break;
      case 'sessionStorage':
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(key);
        }
        break;
      case 'cookie':
        if (typeof document !== 'undefined') {
          document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
        break;
      case 'memory':
      default:
        this.memoryStorage.delete(key);
        break;
    }
  }
}