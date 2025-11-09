/**
 * Type definitions for Platform Capabilities
 */

/**
 * Authentication capabilities per platform
 */
export interface AuthCapabilities {
  supported: boolean;
  types: ('jwt' | 'oauth' | 'biometric' | 'keychain')[];
}

/**
 * Cache capabilities per platform
 */
export interface CacheCapabilities {
  memory: true; // Always supported
  persistent: boolean;
  storageType: 'sessionStorage' | 'AsyncStorage' | 'SecureStore' | 'electron-store' | null;
}

/**
 * WebSocket capabilities per platform
 */
export interface WebSocketCapabilities {
  native: boolean;
  polyfillNeeded: boolean;
}

/**
 * CORS capabilities per platform
 */
export interface CorsCapabilities {
  proxyNeeded: boolean;
  apiRoutesAvailable: boolean;
}

/**
 * File upload capabilities per platform
 */
export interface FileUploadCapabilities {
  supported: boolean;
  method: 'FormData' | 'DocumentPicker' | 'Dialog' | 'Custom' | null;
}

/**
 * Offline capabilities per platform
 */
export interface OfflineCapabilities {
  supported: boolean;
  backgroundSync: boolean;
  queueManagement: boolean;
}

/**
 * Push notification capabilities per platform
 */
export interface PushNotificationCapabilities {
  supported: boolean;
  type: 'web' | 'native' | 'expo' | null;
}

/**
 * Security capabilities per platform
 */
export interface SecurityCapabilities {
  xssProtection: boolean;
  csrfProtection: boolean;
  secureStorage: boolean;
  certificatePinning: boolean;
  csp: boolean; // Content Security Policy
}

/**
 * DevTools capabilities per platform
 */
export interface DevToolsCapabilities {
  supported: boolean;
  type: 'browser' | 'react-native-debugger' | 'expo-dev-tools' | 'cli' | null;
}

/**
 * Complete platform capabilities interface
 */
export interface PlatformCapabilities {
  // Core features (always available)
  crud: true;
  
  // Authentication
  auth: AuthCapabilities;
  
  // Caching
  cache: CacheCapabilities;
  
  // Rendering modes
  ssr: boolean; // Server-Side Rendering
  ssg: boolean; // Static Site Generation
  isr: boolean; // Incremental Static Regeneration
  
  // Network features
  websockets: WebSocketCapabilities;
  cors: CorsCapabilities;
  
  // File operations
  fileUpload: FileUploadCapabilities;
  
  // Mobile-specific features
  offline: OfflineCapabilities;
  pushNotifications: PushNotificationCapabilities;
  
  // Security features
  security: SecurityCapabilities;
  
  // Development tools
  devTools: DevToolsCapabilities;
}
