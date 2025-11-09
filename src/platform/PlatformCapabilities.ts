/**
 * Platform Capabilities System
 * Defines what features are supported on each platform
 */

import { Platform, PlatformDetector } from './PlatformDetector.js';
import type {
  AuthCapabilities,
  CacheCapabilities,
  WebSocketCapabilities,
  CorsCapabilities,
  FileUploadCapabilities,
  OfflineCapabilities,
  PushNotificationCapabilities,
  SecurityCapabilities,
  DevToolsCapabilities,
  PlatformCapabilities,
} from './capabilities/types.js';

// Re-export types for backward compatibility
export type {
  AuthCapabilities,
  CacheCapabilities,
  WebSocketCapabilities,
  CorsCapabilities,
  FileUploadCapabilities,
  OfflineCapabilities,
  PushNotificationCapabilities,
  SecurityCapabilities,
  DevToolsCapabilities,
  PlatformCapabilities,
} from './capabilities/types.js';

/**
 * Platform Capability Detector
 * Returns the capabilities matrix for each platform
 */
export class PlatformCapabilityDetector {
  /**
   * Get capabilities for a specific platform
   */
  static getCapabilities(platform?: Platform): PlatformCapabilities {
    const detectedPlatform = platform || PlatformDetector.detect();
    
    switch (detectedPlatform) {
      case 'web':
        return this.getWebCapabilities();
      
      case 'nextjs':
        return this.getNextJsCapabilities();
      
      case 'react-native':
        return this.getReactNativeCapabilities();
      
      case 'expo':
        return this.getExpoCapabilities();
      
      case 'electron':
        return this.getElectronCapabilities();
      
      case 'node':
        return this.getNodeCapabilities();
      
      default:
        return this.getWebCapabilities(); // Fallback to web
    }
  }

  /**
   * Web (React CSR) capabilities
   */
  private static getWebCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt', 'oauth']
      },
      cache: {
        memory: true,
        persistent: true,
        storageType: 'sessionStorage' // Web storage (changed from localStorage for security)
      },
      ssr: false,
      ssg: false,
      isr: false,
      websockets: {
        native: true,
        polyfillNeeded: false
      },
      cors: {
        proxyNeeded: true, // CORS issues in browser
        apiRoutesAvailable: false
      },
      fileUpload: {
        supported: true,
        method: 'FormData'
      },
      offline: {
        supported: true,
        backgroundSync: true, // Via Service Workers
        queueManagement: true
      },
      pushNotifications: {
        supported: true,
        type: 'web'
      },
      security: {
        xssProtection: true,
        csrfProtection: true,
        secureStorage: false,
        certificatePinning: false,
        csp: true
      },
      devTools: {
        supported: true,
        type: 'browser'
      }
    };
  }

  /**
   * Next.js capabilities (Full SSR/SSG support)
   */
  private static getNextJsCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt', 'oauth']
      },
      cache: {
        memory: true,
        persistent: true,
        storageType: 'sessionStorage' // Web storage (changed from localStorage for security)
      },
      ssr: true, // ✨ Full SSR support
      ssg: true, // ✨ Full SSG support
      isr: true, // ✨ Incremental Static Regeneration
      websockets: {
        native: true,
        polyfillNeeded: false
      },
      cors: {
        proxyNeeded: false, // Use Next.js API routes instead
        apiRoutesAvailable: true
      },
      fileUpload: {
        supported: true,
        method: 'FormData'
      },
      offline: {
        supported: true,
        backgroundSync: true,
        queueManagement: true
      },
      pushNotifications: {
        supported: true,
        type: 'web'
      },
      security: {
        xssProtection: true,
        csrfProtection: true,
        secureStorage: false,
        certificatePinning: false,
        csp: true
      },
      devTools: {
        supported: true,
        type: 'browser'
      }
    };
  }

  /**
   * React Native capabilities (Native mobile)
   */
  private static getReactNativeCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt', 'oauth', 'biometric'] // ✨ Biometric auth
      },
      cache: {
        memory: true,
        persistent: true,
        storageType: 'AsyncStorage'
      },
      ssr: false,
      ssg: false,
      isr: false,
      websockets: {
        native: false,
        polyfillNeeded: true // Needs polyfill
      },
      cors: {
        proxyNeeded: false, // No CORS in native apps
        apiRoutesAvailable: false
      },
      fileUpload: {
        supported: true,
        method: 'Custom' // Uses react-native-document-picker
      },
      offline: {
        supported: true, // ✨ Native offline support
        backgroundSync: true,
        queueManagement: true
      },
      pushNotifications: {
        supported: true,
        type: 'native'
      },
      security: {
        xssProtection: false, // Limited XSS risk in native
        csrfProtection: false, // Different security model
        secureStorage: true, // ✨ React Native secure storage
        certificatePinning: true,
        csp: false
      },
      devTools: {
        supported: true,
        type: 'react-native-debugger'
      }
    };
  }

  /**
   * Expo capabilities (Managed React Native)
   */
  private static getExpoCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt', 'oauth', 'biometric']
      },
      cache: {
        memory: true,
        persistent: true,
        storageType: 'SecureStore' // ✨ Encrypted storage
      },
      ssr: false,
      ssg: false,
      isr: false,
      websockets: {
        native: true, // Expo has native WebSocket support
        polyfillNeeded: false
      },
      cors: {
        proxyNeeded: false,
        apiRoutesAvailable: false
      },
      fileUpload: {
        supported: true,
        method: 'DocumentPicker' // ✨ expo-document-picker
      },
      offline: {
        supported: true,
        backgroundSync: true,
        queueManagement: true
      },
      pushNotifications: {
        supported: true,
        type: 'expo' // ✨ Expo Push Notifications
      },
      security: {
        xssProtection: false,
        csrfProtection: false,
        secureStorage: true,
        certificatePinning: true,
        csp: false
      },
      devTools: {
        supported: true,
        type: 'expo-dev-tools'
      }
    };
  }

  /**
   * Electron capabilities (Desktop app)
   */
  private static getElectronCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt', 'oauth', 'keychain'] // ✨ OS keychain integration
      },
      cache: {
        memory: true,
        persistent: true,
        storageType: 'electron-store'
      },
      ssr: false, // Renderer process only
      ssg: false,
      isr: false,
      websockets: {
        native: true,
        polyfillNeeded: false
      },
      cors: {
        proxyNeeded: false, // No CORS in Electron
        apiRoutesAvailable: false
      },
      fileUpload: {
        supported: true,
        method: 'Dialog' // ✨ Native file dialogs
      },
      offline: {
        supported: true,
        backgroundSync: true,
        queueManagement: true
      },
      pushNotifications: {
        supported: true,
        type: 'native'
      },
      security: {
        xssProtection: true,
        csrfProtection: true,
        secureStorage: true,
        certificatePinning: false,
        csp: true
      },
      devTools: {
        supported: true,
        type: 'browser' // Uses Chromium DevTools
      }
    };
  }

  /**
   * Node.js capabilities (Server-side)
   */
  private static getNodeCapabilities(): PlatformCapabilities {
    return {
      crud: true,
      auth: {
        supported: true,
        types: ['jwt'] // Server-side auth
      },
      cache: {
        memory: true,
        persistent: false, // Usually use Redis/external cache
        storageType: null
      },
      ssr: true, // For Express, Fastify, etc.
      ssg: true, // Can generate static data
      isr: false,
      websockets: {
        native: true,
        polyfillNeeded: false
      },
      cors: {
        proxyNeeded: false,
        apiRoutesAvailable: false
      },
      fileUpload: {
        supported: false, // Server handles uploads differently
        method: null
      },
      offline: {
        supported: false,
        backgroundSync: false,
        queueManagement: false
      },
      pushNotifications: {
        supported: false, // Server sends, doesn't receive
        type: null
      },
      security: {
        xssProtection: true,
        csrfProtection: true,
        secureStorage: false,
        certificatePinning: false,
        csp: true
      },
      devTools: {
        supported: true,
        type: 'cli'
      }
    };
  }

  /**
   * Get current platform capabilities
   */
  static getCurrentCapabilities(): PlatformCapabilities {
    return this.getCapabilities();
  }

  /**
   * Check if a specific feature is supported on current platform
   */
  static isFeatureSupported(feature: keyof PlatformCapabilities): boolean {
    const capabilities = this.getCurrentCapabilities();
    const value = capabilities[feature];
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'object' && value !== null && 'supported' in value) {
      return value.supported;
    }
    
    return true; // CRUD is always supported
  }

  /**
   * Get a summary of capabilities for debugging
   */
  static getCapabilitiesSummary(): {
    platform: Platform;
    supportedFeatures: string[];
    unsupportedFeatures: string[];
  } {
    const platform = PlatformDetector.detect();
    const capabilities = this.getCurrentCapabilities();
    
    const supportedFeatures: string[] = [];
    const unsupportedFeatures: string[] = [];
    
    // Check each feature
    if (capabilities.ssr) supportedFeatures.push('SSR');
    else unsupportedFeatures.push('SSR');
    
    if (capabilities.ssg) supportedFeatures.push('SSG');
    else unsupportedFeatures.push('SSG');
    
    if (capabilities.isr) supportedFeatures.push('ISR');
    else unsupportedFeatures.push('ISR');
    
    if (capabilities.cache.persistent) supportedFeatures.push('Persistent Cache');
    else unsupportedFeatures.push('Persistent Cache');
    
    if (capabilities.websockets.native) supportedFeatures.push('WebSockets');
    else if (capabilities.websockets.polyfillNeeded) supportedFeatures.push('WebSockets (polyfill)');
    
    if (capabilities.offline.supported) supportedFeatures.push('Offline Support');
    else unsupportedFeatures.push('Offline Support');
    
    if (capabilities.pushNotifications.supported) supportedFeatures.push('Push Notifications');
    else unsupportedFeatures.push('Push Notifications');
    
    if (capabilities.security.xssProtection) supportedFeatures.push('XSS Protection');
    if (capabilities.security.csrfProtection) supportedFeatures.push('CSRF Protection');
    if (capabilities.security.secureStorage) supportedFeatures.push('Secure Storage');
    if (capabilities.security.certificatePinning) supportedFeatures.push('Certificate Pinning');
    
    return {
      platform,
      supportedFeatures,
      unsupportedFeatures
    };
  }
}
