import React from 'react';
import { MinderConfig } from '../../src/core/types.js';
import { BaseModel } from '../../src/models/BaseModel.js';

// 🏗️ COMPLETE CONFIGURATION EXAMPLE
// This demonstrates all possible configuration options for maximum flexibility

// Define custom models for type safety and business logic
class UserModel extends BaseModel {
  public name!: string;
  public email!: string;
  public role: 'admin' | 'user' = 'user';
  
  // Transform raw API data to model instance
  public fromJSON(data: any): this {
    super.fromJSON(data);
    this.name = data.name || '';
    this.email = data.email || '';
    this.role = data.role || 'user';
    return this;
  }
  
  // Business logic validation
  public validate() {
    const errors: string[] = [];
    if (!this.name) errors.push('Name is required');
    if (!this.email) errors.push('Email is required');
    if (!this.email.includes('@')) errors.push('Invalid email format');
    return { isValid: errors.length === 0, errors };
  }
  
  // Business logic methods
  public getDisplayName(): string {
    return `${this.name} (${this.role})`;
  }
  
  public isAdmin(): boolean {
    return this.role === 'admin';
  }
}

// 📋 COMPREHENSIVE CONFIGURATION WITH ENVIRONMENTS
export const completeConfig: MinderConfig = {
  // Base API URL for all requests
  apiBaseUrl: 'https://jsonplaceholder.typicode.com',
  
  // 🌐 CORS Configuration with proxy support
  cors: {
    enabled: true,                       // Enable CORS handling
    proxy: '/api/minder-proxy',          // Proxy route for CORS-free requests
    credentials: true,                   // Include cookies in requests
    origin: [                           // Allowed origins
      'http://localhost:3000',
      'https://yourdomain.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Custom-Header']
  },
  
  // 🛣️ API ROUTES - Auto-generates hooks and Redux slices
  routes: {
    // Basic CRUD operations with model transformation
    users: {
      method: 'GET',
      url: '/users',
      model: UserModel,                   // Auto-transform response to UserModel instances
      optimistic: true,                   // Enable optimistic updates
      cache: true,                        // Enable caching
      timeout: 10000                      // Request timeout in ms
    },
    
    // Create operation with validation
    createUser: {
      method: 'POST',
      url: '/users',
      model: UserModel,
      optimistic: true,                   // UI updates immediately, rolls back on error
      headers: {                          // Custom headers for this route
        'Content-Type': 'application/json',
        'X-Action': 'create-user'
      }
    },
    
    // Update with URL parameters
    updateUser: {
      method: 'PUT',
      url: '/users/:id',                  // :id will be replaced with actual ID
      model: UserModel,
      optimistic: true
    },
    
    // Delete operation
    deleteUser: {
      method: 'DELETE',
      url: '/users/:id',
      optimistic: true
    },
    
    // File upload route
    uploadAvatar: {
      method: 'POST',
      url: '/users/:id/avatar',
      optimistic: false,                  // Don't use optimistic updates for uploads
      timeout: 60000                      // Longer timeout for file uploads
    }
  },
  
  // 🔐 AUTHENTICATION CONFIGURATION
  auth: {
    tokenKey: 'accessToken',              // Key for storing auth token
    storage: 'localStorage',              // Storage strategy: localStorage, sessionStorage, memory, cookie
    refreshUrl: '/auth/refresh',          // Optional: URL for token refresh
    onAuthError: () => {                  // Optional: Handle auth errors
      console.log('Authentication failed - redirecting to login');
    }
  },
  
  // 💾 ADVANCED CACHING CONFIGURATION
  cache: {
    staleTime: 5 * 60 * 1000,            // Data considered fresh for 5 minutes
    gcTime: 10 * 60 * 1000,              // Garbage collect after 10 minutes
    refetchOnWindowFocus: false,          // Don't refetch when window gains focus
    refetchOnReconnect: true              // Refetch when network reconnects
  },
  
  // 🔌 WEBSOCKET CONFIGURATION
  websocket: {
    url: 'wss://api.example.com/ws',      // WebSocket URL
    protocols: ['v1', 'v2'],              // Optional: WebSocket protocols
    reconnect: true,                      // Auto-reconnect on disconnect
    heartbeat: 30000                      // Send heartbeat every 30 seconds
  },
  
  // ⚡ PERFORMANCE OPTIMIZATIONS
  performance: {
    deduplication: true,                  // Prevent duplicate requests
    retries: 3,                          // Retry failed requests 3 times
    retryDelay: 1000,                    // Wait 1 second between retries
    timeout: 30000                       // Global timeout for all requests
  },
  
  // 🌍 ENVIRONMENT CONFIGURATIONS (Optional)
  environments: {
    development: {
      apiBaseUrl: 'https://jsonplaceholder.typicode.com',
      cors: {
        enabled: true,
        proxy: '/api/minder-proxy',
        credentials: true
      },
      debug: true
    },
    staging: {
      apiBaseUrl: 'https://staging-api.example.com',
      cors: {
        enabled: true,
        proxy: '/api/minder-proxy'
      },
      auth: {
        storage: 'sessionStorage'
      },
      debug: true
    },
    production: {
      apiBaseUrl: 'https://api.example.com',
      cors: {
        enabled: false  // Same domain in production
      },
      auth: {
        storage: 'cookie'
      },
      debug: false
    }
  },
  defaultEnvironment: 'development',
  autoDetectEnvironment: true
};

// 📖 CONFIGURATION EXPLANATION COMPONENT
export function ConfigurationExample() {
  return (
    <div className="configuration-example">
      <h2>🏗️ Complete Configuration</h2>
      
      <div className="config-section">
        <h3>🌐 CORS Configuration</h3>
        <p>Handles cross-origin requests with automatic proxy support</p>
        <ul>
          <li><strong>enabled:</strong> Enable/disable CORS handling</li>
          <li><strong>proxy:</strong> Next.js proxy route for CORS-free requests</li>
          <li><strong>credentials:</strong> Include cookies and auth headers</li>
          <li><strong>origin:</strong> Whitelist allowed domains</li>
        </ul>
      </div>
      
      <div className="config-section">
        <h3>🌍 Environment Configuration</h3>
        <p>Different settings per environment with auto-detection</p>
        <ul>
          <li><strong>environments:</strong> Override settings per environment</li>
          <li><strong>autoDetectEnvironment:</strong> Auto-detect based on URL/NODE_ENV</li>
          <li><strong>defaultEnvironment:</strong> Fallback environment</li>
        </ul>
      </div>
      
      <div className="config-section">
        <h3>🛣️ Route Configuration</h3>
        <p>Each route auto-generates React hooks and Redux slices</p>
        <ul>
          <li><strong>model:</strong> Auto-transform API responses to model instances</li>
          <li><strong>optimistic:</strong> Update UI immediately, rollback on error</li>
          <li><strong>cache:</strong> Enable intelligent caching</li>
          <li><strong>timeout:</strong> Per-route timeout settings</li>
        </ul>
      </div>
    </div>
  );
}