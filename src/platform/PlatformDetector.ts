/**
 * Platform Detection System
 * Automatically detects the runtime platform and provides platform-specific utilities
 */

import { Platform } from '../constants/enums.js';

// Re-export Platform type for backward compatibility
export type { Platform };

// Type declarations for platform-specific globals
declare global {
  const expo: unknown | undefined;
  
  interface Window {
    __NEXT_DATA__?: unknown;
    __BUILD_MANIFEST__?: unknown;
    next?: unknown;
    expo?: unknown;
    ExpoModules?: unknown;
    Expo?: unknown;
    ReactNativeWebView?: unknown;
    electron?: unknown;
    process?: NodeJS.Process & { type?: string };
  }
  
  var __NEXT_DATA__: unknown | undefined;
}

export class PlatformDetector {
  private static cache: Platform | null = null;

  /**
   * Detects the current platform using multiple reliable indicators
   * Uses caching to avoid repeated detection logic
   */
  static detect(): Platform {
    if (this.cache) return this.cache;

    // Server-side detection (Node.js environment)
    if (typeof window === 'undefined') {
      this.cache = this.detectServerPlatform();
      return this.cache;
    }

    // Client-side detection with fallback chain
    this.cache = this.detectClientPlatform();
    return this.cache;
  }

  /**
   * Detect platform on server-side
   */
  private static detectServerPlatform(): Platform {
    // Next.js server detection
    if (process.env.NEXT_RUNTIME ||
        process.env.__NEXT_PROCESSED_ENV ||
        typeof __NEXT_DATA__ !== 'undefined') {
      return Platform.NEXT_JS;
    }
    
    // Default to Node.js for server-side
    return Platform.NODE;
  }

  /**
   * Detect platform on client-side using multiple indicators
   */
  private static detectClientPlatform(): Platform {
    // Electron detection (most specific first)
    if (this.isElectron()) {
      return Platform.ELECTRON;
    }

    // Expo detection
    if (this.isExpo()) {
      return Platform.EXPO;
    }

    // React Native detection
    if (this.isReactNative()) {
      return Platform.REACT_NATIVE;
    }

    // Next.js client-side detection
    if (this.isNextJs()) {
      return Platform.NEXT_JS;
    }

    // Default to web for browser environments
    return Platform.WEB;
  }

  /**
   * Check if running in Electron
   */
  private static isElectron(): boolean {
    const win = window as any;
    
    // Multiple indicators for Electron
    return !!(
      win.electron ||
      win.process?.type === 'renderer' ||
      navigator.userAgent.includes('Electron') ||
      (typeof process !== 'undefined' && process.versions?.electron)
    );
  }

  /**
   * Check if running in Expo
   */
  private static isExpo(): boolean {
    const win = window as any;
    
    // Multiple indicators for Expo
    return !!(
      win.expo ||
      win.ExpoModules ||
      win.Expo ||
      typeof expo !== 'undefined' ||
      // Check for Expo Router
      win.ExpoRouter ||
      // Check for Expo constants
      (win.Constants && win.Constants.expoVersion)
    );
  }

  /**
   * Check if running in React Native
   */
  private static isReactNative(): boolean {
    const win = window as any;
    
    // Multiple indicators for React Native
    return !!(
      win.ReactNativeWebView ||
      navigator.product === 'ReactNative' ||
      // Check for RN-specific globals
      win.__fbBatchedBridge ||
      // Check for RN dimensions
      (win.Dimensions && typeof win.Dimensions.get === 'function')
    );
  }

  /**
   * Check if running in Next.js
   */
  private static isNextJs(): boolean {
    const win = window as any;
    
    // Multiple indicators for Next.js
    return !!(
      win.__NEXT_DATA__ ||
      win.next ||
      win.__BUILD_MANIFEST ||
      document.getElementById('__next') ||
      // Check for Next.js router
      win.next?.router ||
      // Check for Next.js head
      win.next?.Head
    );
  }

  /**
   * Reset the cached platform
   * Useful for testing or when platform might change
   */
  static reset(): void {
    this.cache = null;
  }

  /**
   * Check if current platform matches the specified one
   */
  static is(platform: Platform): boolean {
    return this.detect() === platform;
  }

  /**
   * Check if running in a web browser (React or Next.js)
   */
  static isWeb(): boolean {
    const platform = this.detect();
    return platform === 'web' || platform === 'nextjs';
  }

  /**
   * Check if running on mobile (React Native or Expo)
   */
  static isMobile(): boolean {
    const platform = this.detect();
    return platform === 'react-native' || platform === 'expo';
  }

  /**
   * Check if running on desktop (Electron)
   */
  static isDesktop(): boolean {
    return this.detect() === 'electron';
  }

  /**
   * Check if running on server (Node.js or Next.js SSR)
   */
  static isServer(): boolean {
    return typeof window === 'undefined';
  }

  /**
   * Check if running on client
   */
  static isClient(): boolean {
    return typeof window !== 'undefined';
  }

  /**
   * Get platform information for debugging
   */
  static getInfo(): {
    platform: Platform;
    isWeb: boolean;
    isMobile: boolean;
    isDesktop: boolean;
    isServer: boolean;
    isClient: boolean;
    userAgent?: string;
    nodeVersion?: string;
  } {
    const platform = this.detect();
    
    return {
      platform,
      isWeb: this.isWeb(),
      isMobile: this.isMobile(),
      isDesktop: this.isDesktop(),
      isServer: this.isServer(),
      isClient: this.isClient(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      nodeVersion: typeof process !== 'undefined' ? process.version : undefined
    };
  }
}
