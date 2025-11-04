/**
 * Token Refresh Manager
 * 
 * Automatically refreshes JWT tokens before expiration to prevent
 * unexpected logouts and maintain seamless user experience.
 * 
 * @module auth/TokenRefreshManager
 */

/**
 * JWT Token Payload
 */
export interface JWTPayload {
  exp?: number; // Expiration timestamp (seconds since epoch)
  iat?: number; // Issued at timestamp
  sub?: string; // Subject (user ID)
  [key: string]: any;
}

/**
 * Token refresh configuration
 */
export interface TokenRefreshConfig {
  /**
   * Minimum time before expiration to trigger refresh (in milliseconds)
   * @default 300000 (5 minutes)
   */
  refreshThreshold?: number;

  /**
   * Function to refresh the token
   */
  refreshToken: () => Promise<string>;

  /**
   * Callback when token is refreshed successfully
   */
  onTokenRefreshed?: (newToken: string) => void;

  /**
   * Callback when token refresh fails
   */
  onRefreshError?: (error: Error) => void;

  /**
   * Enable automatic refresh
   * @default true
   */
  enabled?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Token Refresh Manager
 * 
 * Handles automatic token refresh before expiration.
 */
export class TokenRefreshManager {
  private config: Required<TokenRefreshConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private currentToken: string | null = null;
  private isRefreshing = false;

  constructor(config: TokenRefreshConfig) {
    this.config = {
      refreshThreshold: config.refreshThreshold ?? 5 * 60 * 1000, // 5 minutes
      refreshToken: config.refreshToken,
      onTokenRefreshed: config.onTokenRefreshed ?? (() => {}),
      onRefreshError: config.onRefreshError ?? (() => {}),
      enabled: config.enabled ?? true,
      debug: config.debug ?? false,
    };
  }

  /**
   * Parse JWT token and extract payload
   */
  private parseJWT(token: string): JWTPayload | null {
    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode base64url payload
      const payloadPart = parts[1];
      if (!payloadPart) {
        return null;
      }
      const decoded = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (error) {
      if (this.config.debug) {
        console.error('[TokenRefreshManager] Failed to parse JWT:', error);
      }
      return null;
    }
  }

  /**
   * Get token expiration time in milliseconds
   */
  private getExpirationTime(token: string): number | null {
    const payload = this.parseJWT(token);
    if (!payload || !payload.exp) {
      return null;
    }

    // Convert seconds to milliseconds
    return payload.exp * 1000;
  }

  /**
   * Calculate time until token expiration
   */
  private getTimeUntilExpiration(token: string): number | null {
    const expirationTime = this.getExpirationTime(token);
    if (!expirationTime) {
      return null;
    }

    return expirationTime - Date.now();
  }

  /**
   * Check if token is expired
   */
  public isTokenExpired(token: string): boolean {
    const timeUntilExpiration = this.getTimeUntilExpiration(token);
    return timeUntilExpiration !== null && timeUntilExpiration <= 0;
  }

  /**
   * Check if token needs refresh
   */
  public needsRefresh(token: string): boolean {
    const timeUntilExpiration = this.getTimeUntilExpiration(token);
    return timeUntilExpiration !== null && timeUntilExpiration <= this.config.refreshThreshold;
  }

  /**
   * Schedule token refresh
   */
  private scheduleRefresh(token: string): void {
    // Clear existing timer
    this.stopAutoRefresh();

    if (!this.config.enabled) {
      return;
    }

    const timeUntilExpiration = this.getTimeUntilExpiration(token);
    if (timeUntilExpiration === null) {
      if (this.config.debug) {
        console.warn('[TokenRefreshManager] Cannot schedule refresh: invalid token expiration');
      }
      return;
    }

    // Calculate when to refresh (before expiration by threshold amount)
    const refreshIn = Math.max(0, timeUntilExpiration - this.config.refreshThreshold);

    if (this.config.debug) {
      console.log(
        `[TokenRefreshManager] Scheduling refresh in ${(refreshIn / 1000).toFixed(0)}s ` +
        `(${(timeUntilExpiration / 1000).toFixed(0)}s until expiration)`
      );
    }

    this.refreshTimer = setTimeout(() => {
      this.performRefresh();
    }, refreshIn);
  }

  /**
   * Perform token refresh
   */
  private async performRefresh(): Promise<void> {
    if (this.isRefreshing) {
      if (this.config.debug) {
        console.log('[TokenRefreshManager] Refresh already in progress, skipping');
      }
      return;
    }

    this.isRefreshing = true;

    try {
      if (this.config.debug) {
        console.log('[TokenRefreshManager] Refreshing token...');
      }
      const newToken = await this.config.refreshToken();

      // Validate new token
      if (!newToken || typeof newToken !== 'string') {
        throw new Error('Invalid token received from refresh function');
      }

      if (this.isTokenExpired(newToken)) {
        throw new Error('Received token is already expired');
      }

      this.currentToken = newToken;
      this.config.onTokenRefreshed(newToken);

      if (this.config.debug) {
        console.log('[TokenRefreshManager] Token refreshed successfully');
      }

      // Schedule next refresh
      this.scheduleRefresh(newToken);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.debug) {
        console.error('[TokenRefreshManager] Token refresh failed:', err);
      }
      this.config.onRefreshError(err);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Start automatic token refresh
   */
  public startAutoRefresh(token: string): void {
    if (!token) {
      if (this.config.debug) {
        console.warn('[TokenRefreshManager] Cannot start auto-refresh: no token provided');
      }
      return;
    }

    // Validate token
    if (this.isTokenExpired(token)) {
      if (this.config.debug) {
        console.error('[TokenRefreshManager] Cannot start auto-refresh: token is already expired');
      }
      return;
    }

    this.currentToken = token;
    this.scheduleRefresh(token);
    if (this.config.debug) {
      console.log('[TokenRefreshManager] Auto-refresh started');
    }
  }

  /**
   * Stop automatic token refresh
   */
  public stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      if (this.config.debug) {
        console.log('[TokenRefreshManager] Auto-refresh stopped');
      }
    }
  }

  /**
   * Manually trigger token refresh
   */
  public async refreshNow(): Promise<string | null> {
    await this.performRefresh();
    return this.currentToken;
  }

  /**
   * Get token information
   */
  public getTokenInfo(token: string): {
    valid: boolean;
    expired: boolean;
    needsRefresh: boolean;
    expiresAt: Date | null;
    timeUntilExpiration: number | null;
    payload: JWTPayload | null;
  } {
    const payload = this.parseJWT(token);
    const expirationTime = this.getExpirationTime(token);
    const timeUntilExpiration = this.getTimeUntilExpiration(token);

    return {
      valid: payload !== null,
      expired: this.isTokenExpired(token),
      needsRefresh: this.needsRefresh(token),
      expiresAt: expirationTime ? new Date(expirationTime) : null,
      timeUntilExpiration,
      payload,
    };
  }

  /**
   * Update refresh configuration
   */
  public updateConfig(config: Partial<TokenRefreshConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    } as Required<TokenRefreshConfig>;

    // Reschedule if token exists
    if (this.currentToken) {
      this.scheduleRefresh(this.currentToken);
    }
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.stopAutoRefresh();
    this.currentToken = null;
    this.isRefreshing = false;
  }
}

/**
 * Create token refresh manager
 */
export function createTokenRefreshManager(config: TokenRefreshConfig): TokenRefreshManager {
  return new TokenRefreshManager(config);
}
