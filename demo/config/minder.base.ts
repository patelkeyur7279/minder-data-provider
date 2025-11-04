import type { MinderConfig } from 'minder-data-provider';
import { BaseModel } from 'minder-data-provider';
import dynamic from 'next/dynamic';

// 🎯 Custom Models
export class UserModel extends BaseModel {
  id!: number;
  name!: string;
  email!: string;
  createdAt!: Date;

  // Add business logic/validation
  validate() {
    const errors: string[] = [];
    
    if (typeof this.id !== 'number') {
      errors.push('ID must be a number');
    }
    if (typeof this.name !== 'string' || this.name.length === 0) {
      errors.push('Name is required and must be a string');
    }
    if (typeof this.email !== 'string' || !this.email.includes('@')) {
      errors.push('Email must be a valid email address');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// 🔧 Base Configuration
export const baseConfig: Partial<MinderConfig> = {
  // Required for Next.js dynamic imports
  dynamic,

  // Core Features
  cors: {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization'],
  },

  // Route Definitions
  routes: {
    users: {
      method: 'GET',
      url: '/users',
      model: UserModel,
      cache: true,
      optimistic: true,
    },
    posts: {
      method: 'GET',
      url: '/posts',
      cache: true,
      optimistic: true,
    },
  },

  // Performance Settings
  performance: {
    deduplication: true,
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
    compression: true,
    bundleAnalysis: false,
    lazyLoading: true,
  },

  // Cache Settings
  cache: {
    type: 'hybrid',
    maxSize: 1000,
    refetchOnReconnect: true,
  },

  // Security Settings
  security: {
    encryption: true,
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 100,
      window: 60000, // 1 minute
    },
  },

  // SSR Configuration
  ssr: {
    enabled: true,
    hydrate: true,
  },
};