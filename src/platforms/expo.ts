/**
 * Expo Platform Entry Point
 * Optimized for Expo apps with secure storage
 * Includes: React Native features + Expo-specific utilities
 */

// Everything from React Native
export * from './native.js';

// Expo-specific storage (encrypted)
export { 
  ExpoStorageAdapter 
} from '../platform/adapters/storage/index.js';

// Re-export for convenience
export type { 
  ExpoStorageAdapter as SecureStorageAdapter 
} from '../platform/adapters/storage/index.js';
