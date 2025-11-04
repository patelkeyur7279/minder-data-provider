/**
 * Token Refresh Manager - Usage Example
 * 
 * Demonstrates how to use TokenRefreshManager to automatically
 * refresh JWT tokens before expiration.
 */

import { createTokenRefreshManager, type TokenRefreshConfig } from 'minder-data-provider/auth';

// ============================================================================
// Example 1: Basic Usage with Custom Refresh Function
// ============================================================================

const tokenManager = createTokenRefreshManager({
  // Refresh when token has less than 5 minutes remaining (default)
  refreshThreshold: 5 * 60 * 1000,

  // Function to fetch new token
  refreshToken: async () => {
    const currentToken = localStorage.getItem('auth_token');
    
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    return data.token;
  },

  // Called when token is successfully refreshed
  onTokenRefreshed: (newToken) => {
    console.log('✅ Token refreshed successfully');
    localStorage.setItem('auth_token', newToken);
    
    // Update axios headers, etc.
    updateAuthHeaders(newToken);
  },

  // Called when refresh fails
  onRefreshError: (error) => {
    console.error('❌ Token refresh failed:', error);
    
    // Redirect to login
    window.location.href = '/login';
  },
});

// Start automatic refresh when user logs in
function onLogin(token: string) {
  localStorage.setItem('auth_token', token);
  tokenManager.startAutoRefresh(token);
}

// Stop refresh when user logs out
function onLogout() {
  tokenManager.stopAutoRefresh();
  localStorage.removeItem('auth_token');
}

// ============================================================================
// Example 2: Integration with React
// ============================================================================

import { useEffect } from 'react';

function useTokenAutoRefresh() {
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const manager = createTokenRefreshManager({
      refreshToken: async () => {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        return data.token;
      },
      onTokenRefreshed: (newToken) => {
        localStorage.setItem('auth_token', newToken);
      },
    });

    manager.startAutoRefresh(token);

    // Cleanup on unmount
    return () => manager.dispose();
  }, []);
}

// ============================================================================
// Example 3: Manual Refresh
// ============================================================================

async function forceRefreshToken() {
  const newToken = await tokenManager.refreshNow();
  console.log('Token manually refreshed:', newToken);
}

// ============================================================================
// Example 4: Token Validation
// ============================================================================

function checkTokenStatus() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const info = tokenManager.getTokenInfo(token);
  
  console.log('Token Info:', {
    valid: info.valid,
    expired: info.expired,
    needsRefresh: info.needsRefresh,
    expiresAt: info.expiresAt,
    timeUntilExpiration: `${(info.timeUntilExpiration! / 1000 / 60).toFixed(0)} minutes`,
    user: info.payload?.email,
  });

  if (info.expired) {
    console.error('Token is expired!');
    window.location.href = '/login';
  } else if (info.needsRefresh) {
    console.warn('Token needs refresh soon');
  }
}

// ============================================================================
// Example 5: Custom Refresh Threshold
// ============================================================================

const earlyRefresh = createTokenRefreshManager({
  // Refresh when 10 minutes remaining (instead of default 5)
  refreshThreshold: 10 * 60 * 1000,
  
  refreshToken: async () => {
    // ... refresh logic
    return 'new-token';
  },
});

// ============================================================================
// Example 6: Next.js App Router Integration
// ============================================================================

// app/providers.tsx
'use client';

import { useEffect } from 'react';
import { createTokenRefreshManager } from 'minder-data-provider/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('auth_token='))
      ?.split('=')[1];

    if (!token) return;

    const manager = createTokenRefreshManager({
      refreshToken: async () => {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json();
        return data.token;
      },
      onTokenRefreshed: async (newToken) => {
        // Update cookie via API route
        await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: newToken }),
        });
      },
    });

    manager.startAutoRefresh(token);

    return () => manager.dispose();
  }, []);

  return <>{children}</>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function updateAuthHeaders(token: string) {
  // Update axios instance
  // axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export {
  tokenManager,
  onLogin,
  onLogout,
  forceRefreshToken,
  checkTokenStatus,
};
