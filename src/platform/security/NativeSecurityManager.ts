/**
 * NativeSecurityManager - React Native and Expo security implementation
 * 
 * Implements secure storage, certificate pinning, and mobile-specific security.
 * 
 * @module NativeSecurityManager
 */

import {
  SecurityManager,
  SecurityConfig,
  SecurityValidation,
} from './SecurityManager.js';

/**
 * Native Security Manager
 */
export class NativeSecurityManager extends SecurityManager {
  private secureStorage: any = null;
  private initialized = false;

  constructor(config: SecurityConfig = {}) {
    super(config);
  }

  /**
   * Initialize native security features
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize secure storage
    if (this.config.secureStorage) {
      await this.initializeSecureStorage();
    }

    // Set up certificate pinning
    if (this.config.certificatePinning) {
      await this.setupCertificatePinning();
    }

    this.initialized = true;
  }

  /**
   * Get security headers for HTTP requests
   */
  getSecurityHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.customHeaders,
    };

    // Add platform identifier
    headers['X-Platform'] = 'react-native';

    // Add security version
    headers['X-Security-Version'] = '1.0';

    return headers;
  }

  /**
   * Validate request security
   */
  validateRequest(request: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }): SecurityValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate URL scheme
    if (request.url) {
      const url = request.url.toLowerCase();
      if (!url.startsWith('https://') && !url.startsWith('http://localhost')) {
        errors.push('Only HTTPS connections are allowed (except localhost)');
      }
    }

    // Validate certificate pinning if enabled
    if (this.config.certificatePinning && request.url) {
      if (!this.validateCertificatePinning(request.url)) {
        warnings.push('Certificate pinning validation pending');
      }
    }

    // Sanitize body
    if (this.config.sanitizeInput && request.body) {
      const result = this.sanitizeInput(request.body);
      if (result.removedKeys.length > 0) {
        warnings.push(`Removed dangerous keys: ${result.removedKeys.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Initialize secure storage
   */
  private async initializeSecureStorage(): Promise<void> {
    try {
      // Try Expo SecureStore first
      const loadExpoSecureStore = new Function('return import("expo-secure-store")');
      this.secureStorage = await loadExpoSecureStore();
    } catch {
      try {
        // Fallback to react-native-keychain
        const loadKeychain = new Function('return import("react-native-keychain")');
        this.secureStorage = await loadKeychain();
      } catch {
        console.warn('No secure storage library available');
      }
    }
  }

  /**
   * Store sensitive data securely
   */
  async secureStoreData(key: string, value: string): Promise<boolean> {
    if (!this.config.secureStorage || !this.secureStorage) {
      // Fallback to regular storage (not recommended)
      return false;
    }

    try {
      // Expo SecureStore
      if (this.secureStorage.setItemAsync) {
        await this.secureStorage.setItemAsync(key, value);
        return true;
      }

      // react-native-keychain
      if (this.secureStorage.setGenericPassword) {
        await this.secureStorage.setGenericPassword(key, value);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Secure storage error:', error);
      return false;
    }
  }

  /**
   * Retrieve sensitive data securely
   */
  async secureRetrieve(key: string): Promise<string | null> {
    if (!this.config.secureStorage || !this.secureStorage) {
      return null;
    }

    try {
      // Expo SecureStore
      if (this.secureStorage.getItemAsync) {
        return await this.secureStorage.getItemAsync(key);
      }

      // react-native-keychain
      if (this.secureStorage.getGenericPassword) {
        const credentials = await this.secureStorage.getGenericPassword();
        return credentials ? credentials.password : null;
      }

      return null;
    } catch (error) {
      console.error('Secure retrieval error:', error);
      return null;
    }
  }

  /**
   * Delete sensitive data securely
   */
  async secureDelete(key: string): Promise<boolean> {
    if (!this.config.secureStorage || !this.secureStorage) {
      return false;
    }

    try {
      // Expo SecureStore
      if (this.secureStorage.deleteItemAsync) {
        await this.secureStorage.deleteItemAsync(key);
        return true;
      }

      // react-native-keychain
      if (this.secureStorage.resetGenericPassword) {
        await this.secureStorage.resetGenericPassword();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Secure deletion error:', error);
      return false;
    }
  }

  /**
   * Set up certificate pinning
   */
  private async setupCertificatePinning(): Promise<void> {
    // Certificate pinning is typically configured at the native level
    // This method can be extended to validate the configuration
    if (this.config.pinnedCertificates.length === 0) {
      console.warn('Certificate pinning enabled but no certificates provided');
    }
  }

  /**
   * Validate certificate pinning
   */
  private validateCertificatePinning(url: string): boolean {
    if (!this.config.certificatePinning) {
      return true;
    }

    // Certificate validation happens at the network layer
    // This is a placeholder for certificate hash validation
    return this.config.pinnedCertificates.length > 0;
  }

  /**
   * Encrypt sensitive data before storage
   */
  async encryptData(data: string, key?: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        // Use Web Crypto API if available
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);

        // Generate a key if not provided
        const cryptoKey = key
          ? await this.deriveKey(key)
          : await crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt']
            );

        // Generate IV
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey as CryptoKey,
          dataBuffer
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Convert to base64
        return btoa(String.fromCharCode(...combined));
      } catch (error) {
        console.error('Encryption error:', error);
      }
    }

    // Fallback: Base64 encoding (not secure, just obfuscation)
    return btoa(data);
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedData: string, key?: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle && key) {
      try {
        // Decode from base64
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        // Derive key
        const cryptoKey = await this.deriveKey(key);

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          encrypted
        );

        // Convert back to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
      } catch (error) {
        console.error('Decryption error:', error);
      }
    }

    // Fallback: Base64 decoding
    return atob(encryptedData);
  }

  /**
   * Derive encryption key from password
   */
  private async deriveKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('minder-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Check if device is rooted/jailbroken (placeholder)
   */
  async isDeviceCompromised(): Promise<boolean> {
    // This would require native module integration
    // Placeholder implementation
    return false;
  }

  /**
   * Check if app is running in debug mode
   */
  isDebugMode(): boolean {
    // Check if __DEV__ is defined (React Native)
    if (typeof (globalThis as any).__DEV__ !== 'undefined') {
      return (globalThis as any).__DEV__;
    }
    // Fallback
    return process.env.NODE_ENV === 'development';
  }
}

/**
 * Create Native security manager
 */
export function createNativeSecurity(config: SecurityConfig = {}): NativeSecurityManager {
  return new NativeSecurityManager(config);
}
