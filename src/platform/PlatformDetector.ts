/**
 * Platform Detection System
 * Automatically detects the runtime platform and provides platform-specific utilities
 */

export type Platform = 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node';

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
   * Detects the current platform
   * Uses caching to avoid repeated detection logic
   */
  static detect(): Platform {
    if (this.cache) return this.cache;

    // Server-side detection (Node.js environment)
    if (typeof window === 'undefined') {
      // Check if Next.js
      if (
        process.env.NEXT_RUNTIME ||
        process.env.__NEXT_PROCESSED_ENV ||
        typeof __NEXT_DATA__ !== 'undefined'
      ) {
        this.cache = 'nextjs';
        return 'nextjs';
      }
      
      // Default to Node.js for server-side
      this.cache = 'node';
      return 'node';
    }

    // Client-side detection
    const win = window as any;

    // Electron detection
    if (
      win.electron ||
      win.process?.type === 'renderer' ||
      navigator.userAgent.includes('Electron')
    ) {
      this.cache = 'electron';
      return 'electron';
    }

    // Expo detection
    if (
      win.expo ||
      win.ExpoModules ||
      win.Expo ||
      typeof expo !== 'undefined'
    ) {
      this.cache = 'expo';
      return 'expo';
    }

    // React Native detection
    if (
      win.ReactNativeWebView ||
      navigator.product === 'ReactNative'
    ) {
      this.cache = 'react-native';
      return 'react-native';
    }

    // Next.js client-side detection
    if (
      win.__NEXT_DATA__ ||
      win.next ||
      win.__BUILD_MANIFEST ||
      document.getElementById('__next')
    ) {
      this.cache = 'nextjs';
      return 'nextjs';
    }

    // Default to web for browser environments
    this.cache = 'web';
    return 'web';
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
