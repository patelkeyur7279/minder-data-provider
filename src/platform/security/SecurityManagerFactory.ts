/**
 * SecurityManagerFactory - Factory for creating platform-specific security managers
 * 
 * Automatically selects the appropriate security manager based on the platform.
 * 
 * @module SecurityManagerFactory
 */

import { PlatformDetector } from '../PlatformDetector.js';
import type { SecurityManager, SecurityConfig } from './SecurityManager.js';
import { WebSecurityManager } from './WebSecurityManager.js';
import { NativeSecurityManager } from './NativeSecurityManager.js';
import { ElectronSecurityManager } from './ElectronSecurityManager.js';

/**
 * Security Manager Factory
 */
export class SecurityManagerFactory {
  /**
   * Create a security manager for the current platform
   */
  static create(config: SecurityConfig = {}): SecurityManager {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'expo':
      case 'react-native':
        return new NativeSecurityManager(config);
      
      case 'electron':
        return new ElectronSecurityManager(config);
      
      case 'web':
      case 'nextjs':
      case 'node':
      default:
        return new WebSecurityManager(config);
    }
  }

  /**
   * Create a security manager for a specific platform
   */
  static createForPlatform(
    platformName: string,
    config: SecurityConfig = {}
  ): SecurityManager {
    switch (platformName) {
      case 'expo':
      case 'react-native':
        return new NativeSecurityManager(config);
      
      case 'electron':
        return new ElectronSecurityManager(config);
      
      case 'web':
      case 'nextjs':
      case 'node':
        return new WebSecurityManager(config);
      
      default:
        throw new Error(`Unsupported platform: ${platformName}`);
    }
  }

  /**
   * Get security features available for the current platform
   */
  static getAvailableFeatures(): {
    xssProtection: boolean;
    csrfProtection: boolean;
    corsProtection: boolean;
    csp: boolean;
    secureStorage: boolean;
    certificatePinning: boolean;
    sandboxing: boolean;
    contextIsolation: boolean;
  } {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'expo':
      case 'react-native':
        return {
          xssProtection: true,
          csrfProtection: false,
          corsProtection: false,
          csp: false,
          secureStorage: true,
          certificatePinning: true,
          sandboxing: false,
          contextIsolation: false,
        };
      
      case 'electron':
        return {
          xssProtection: true,
          csrfProtection: false,
          corsProtection: true,
          csp: true,
          secureStorage: true,
          certificatePinning: false,
          sandboxing: true,
          contextIsolation: true,
        };
      
      case 'web':
      case 'nextjs':
        return {
          xssProtection: true,
          csrfProtection: true,
          corsProtection: true,
          csp: true,
          secureStorage: false,
          certificatePinning: false,
          sandboxing: false,
          contextIsolation: false,
        };
      
      default:
        return {
          xssProtection: false,
          csrfProtection: false,
          corsProtection: false,
          csp: false,
          secureStorage: false,
          certificatePinning: false,
          sandboxing: false,
          contextIsolation: false,
        };
    }
  }
}

/**
 * Create a security manager for the current platform
 */
export function createSecurityManager(config: SecurityConfig = {}): SecurityManager {
  return SecurityManagerFactory.create(config);
}
