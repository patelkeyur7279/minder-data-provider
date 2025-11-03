import type { AuthConfig } from './types.js';

export class AuthManager {
  private config: AuthConfig;
  private memoryStorage: Map<string, string> = new Map();

  constructor(config?: AuthConfig) {
    this.config = config || {
      tokenKey: 'accessToken',
      storage: 'localStorage',
    };
  }

  setToken(token: string): void {
    this.setItem(this.config.tokenKey, token);
  }

  getToken(): string | null {
    return this.getItem(this.config.tokenKey);
  }

  setRefreshToken(token: string): void {
    this.setItem(`${this.config.tokenKey}_refresh`, token);
  }

  getRefreshToken(): string | null {
    return this.getItem(`${this.config.tokenKey}_refresh`);
  }

  clearAuth(): void {
    this.removeItem(this.config.tokenKey);
    this.removeItem(`${this.config.tokenKey}_refresh`);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired (if it's a JWT)
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      const now = Date.now() / 1000;
      return payload.exp ? payload.exp > now : true;
    } catch {
      // If not a JWT, assume it's valid
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