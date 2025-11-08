/**
 * Platform Detection and Capabilities Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlatformDetector, PlatformCapabilityDetector } from '../src/platform/index';

describe('PlatformDetector', () => {
  beforeEach(() => {
    PlatformDetector.reset();
  });

  afterEach(() => {
    PlatformDetector.reset();
  });

  describe('detect()', () => {
    it('should detect platform in current environment', () => {
      const platform = PlatformDetector.detect();
      // Jest with JSDOM provides window, so it detects as 'web'
      expect(['web', 'node']).toContain(platform);
    });

    it('should cache platform detection result', () => {
      const first = PlatformDetector.detect();
      const second = PlatformDetector.detect();
      expect(first).toBe(second);
    });

    it('should reset cache when reset() is called', () => {
      PlatformDetector.detect();
      PlatformDetector.reset();
      expect((PlatformDetector as any).cache).toBeNull();
    });
  });

  describe('is()', () => {
    it('should correctly identify platform', () => {
      const platform = PlatformDetector.detect();
      expect(PlatformDetector.is(platform)).toBe(true);
      
      // Test with a different platform
      const otherPlatform = platform === 'web' ? 'node' : 'web';
      expect(PlatformDetector.is(otherPlatform as any)).toBe(false);
    });
  });

  describe('isWeb()', () => {
    it('should correctly identify web environments', () => {
      const isWeb = PlatformDetector.isWeb();
      const platform = PlatformDetector.detect();
      expect(isWeb).toBe(platform === 'web' || platform === 'nextjs');
    });
  });

  describe('isMobile()', () => {
    it('should return false when not on mobile', () => {
      const platform = PlatformDetector.detect();
      const isMobile = PlatformDetector.isMobile();
      expect(isMobile).toBe(platform === 'react-native' || platform === 'expo');
    });
  });

  describe('isDesktop()', () => {
    it('should return false when not on Electron', () => {
      const platform = PlatformDetector.detect();
      const isDesktop = PlatformDetector.isDesktop();
      expect(isDesktop).toBe(platform === 'electron');
    });
  });

  describe('isServer()', () => {
    it('should detect server-side rendering correctly', () => {
      const isServer = PlatformDetector.isServer();
      expect(typeof isServer).toBe('boolean');
      expect(isServer).toBe(typeof window === 'undefined');
    });
  });

  describe('isClient()', () => {
    it('should detect client-side rendering correctly', () => {
      const isClient = PlatformDetector.isClient();
      expect(typeof isClient).toBe('boolean');
      expect(isClient).toBe(typeof window !== 'undefined');
    });
  });

  describe('getInfo()', () => {
    it('should return platform information', () => {
      const info = PlatformDetector.getInfo();
      
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('isWeb');
      expect(info).toHaveProperty('isMobile');
      expect(info).toHaveProperty('isDesktop');
      expect(info).toHaveProperty('isServer');
      expect(info).toHaveProperty('isClient');
      expect(info.nodeVersion).toBeDefined(); // Always have Node version in tests
    });

    it('should provide consistent environment detection', () => {
      const info = PlatformDetector.getInfo();
      
      // Server and client should be opposites
      expect(info.isServer).toBe(!info.isClient);
      
      // Platform should match detection results
      expect(info.platform).toBe(PlatformDetector.detect());
    });
  });
});

describe('PlatformCapabilityDetector', () => {
  beforeEach(() => {
    PlatformDetector.reset();
  });

  describe('getCapabilities()', () => {
    it('should return capabilities for web platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('web');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.auth.supported).toBe(true);
      expect(capabilities.cache.persistent).toBe(true);
      expect(capabilities.cache.storageType).toBe('sessionStorage'); // Changed from localStorage for security
      expect(capabilities.ssr).toBe(false);
      expect(capabilities.ssg).toBe(false);
      expect(capabilities.cors.proxyNeeded).toBe(true);
    });

    it('should return capabilities for Next.js platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('nextjs');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.ssr).toBe(true);
      expect(capabilities.ssg).toBe(true);
      expect(capabilities.isr).toBe(true);
      expect(capabilities.cors.proxyNeeded).toBe(false);
      expect(capabilities.cors.apiRoutesAvailable).toBe(true);
    });

    it('should return capabilities for React Native platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('react-native');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.cache.storageType).toBe('AsyncStorage');
      expect(capabilities.auth.types).toContain('biometric');
      expect(capabilities.offline.supported).toBe(true);
      expect(capabilities.websockets.polyfillNeeded).toBe(true);
      expect(capabilities.cors.proxyNeeded).toBe(false);
    });

    it('should return capabilities for Expo platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('expo');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.cache.storageType).toBe('SecureStore');
      expect(capabilities.pushNotifications.type).toBe('expo');
      expect(capabilities.fileUpload.method).toBe('DocumentPicker');
      expect(capabilities.security.secureStorage).toBe(true);
    });

    it('should return capabilities for Electron platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('electron');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.cache.storageType).toBe('electron-store');
      expect(capabilities.auth.types).toContain('keychain');
      expect(capabilities.fileUpload.method).toBe('Dialog');
      expect(capabilities.security.csp).toBe(true);
    });

    it('should return capabilities for Node.js platform', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('node');
      
      expect(capabilities.crud).toBe(true);
      expect(capabilities.ssr).toBe(true);
      expect(capabilities.ssg).toBe(true);
      expect(capabilities.cache.persistent).toBe(false);
      expect(capabilities.offline.supported).toBe(false);
    });
  });

  describe('getCurrentCapabilities()', () => {
    it('should return capabilities for current platform', () => {
      const capabilities = PlatformCapabilityDetector.getCurrentCapabilities();
      
      expect(capabilities).toBeDefined();
      expect(capabilities.crud).toBe(true);
      expect(capabilities).toHaveProperty('auth');
      expect(capabilities).toHaveProperty('cache');
      expect(capabilities).toHaveProperty('websockets');
    });
  });

  describe('isFeatureSupported()', () => {
    it('should correctly identify supported features', () => {
      expect(PlatformCapabilityDetector.isFeatureSupported('crud')).toBe(true);
    });

    it('should correctly identify SSR support for Node.js', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('node');
      expect(capabilities.ssr).toBe(true);
    });

    it('should correctly identify SSR lack of support for web', () => {
      const capabilities = PlatformCapabilityDetector.getCapabilities('web');
      expect(capabilities.ssr).toBe(false);
    });
  });

  describe('getCapabilitiesSummary()', () => {
    it('should return capabilities summary', () => {
      const summary = PlatformCapabilityDetector.getCapabilitiesSummary();
      
      expect(summary).toHaveProperty('platform');
      expect(summary).toHaveProperty('supportedFeatures');
      expect(summary).toHaveProperty('unsupportedFeatures');
      expect(Array.isArray(summary.supportedFeatures)).toBe(true);
      expect(Array.isArray(summary.unsupportedFeatures)).toBe(true);
    });

    it('should list SSR in supported features for Next.js', () => {
      // Temporarily override platform detection
      const originalDetect = PlatformDetector.detect;
      PlatformDetector.detect = () => 'nextjs';
      
      const summary = PlatformCapabilityDetector.getCapabilitiesSummary();
      
      expect(summary.platform).toBe('nextjs');
      expect(summary.supportedFeatures).toContain('SSR');
      expect(summary.supportedFeatures).toContain('SSG');
      expect(summary.supportedFeatures).toContain('ISR');
      
      // Restore original
      PlatformDetector.detect = originalDetect;
      PlatformDetector.reset();
    });

    it('should list offline in supported features for React Native', () => {
      // Temporarily override platform detection
      const originalDetect = PlatformDetector.detect;
      PlatformDetector.detect = () => 'react-native';
      
      const summary = PlatformCapabilityDetector.getCapabilitiesSummary();
      
      expect(summary.platform).toBe('react-native');
      expect(summary.supportedFeatures).toContain('Offline Support');
      expect(summary.supportedFeatures).toContain('Secure Storage');
      expect(summary.supportedFeatures).toContain('Certificate Pinning');
      
      // Restore original
      PlatformDetector.detect = originalDetect;
      PlatformDetector.reset();
    });
  });

  describe('Platform-specific capabilities', () => {
    it('should show correct auth types for each platform', () => {
      const webCaps = PlatformCapabilityDetector.getCapabilities('web');
      expect(webCaps.auth.types).toEqual(['jwt', 'oauth']);

      const nativeCaps = PlatformCapabilityDetector.getCapabilities('react-native');
      expect(nativeCaps.auth.types).toEqual(['jwt', 'oauth', 'biometric']);

      const electronCaps = PlatformCapabilityDetector.getCapabilities('electron');
      expect(electronCaps.auth.types).toEqual(['jwt', 'oauth', 'keychain']);
    });

    it('should show correct storage types for each platform', () => {
      const webCaps = PlatformCapabilityDetector.getCapabilities('web');
      expect(webCaps.cache.storageType).toBe('sessionStorage'); // Changed from localStorage for security

      const nativeCaps = PlatformCapabilityDetector.getCapabilities('react-native');
      expect(nativeCaps.cache.storageType).toBe('AsyncStorage');

      const expoCaps = PlatformCapabilityDetector.getCapabilities('expo');
      expect(expoCaps.cache.storageType).toBe('SecureStore');

      const electronCaps = PlatformCapabilityDetector.getCapabilities('electron');
      expect(electronCaps.cache.storageType).toBe('electron-store');

      const nodeCaps = PlatformCapabilityDetector.getCapabilities('node');
      expect(nodeCaps.cache.storageType).toBeNull();
    });

    it('should show correct CORS requirements for each platform', () => {
      const webCaps = PlatformCapabilityDetector.getCapabilities('web');
      expect(webCaps.cors.proxyNeeded).toBe(true);
      expect(webCaps.cors.apiRoutesAvailable).toBe(false);

      const nextjsCaps = PlatformCapabilityDetector.getCapabilities('nextjs');
      expect(nextjsCaps.cors.proxyNeeded).toBe(false);
      expect(nextjsCaps.cors.apiRoutesAvailable).toBe(true);

      const nativeCaps = PlatformCapabilityDetector.getCapabilities('react-native');
      expect(nativeCaps.cors.proxyNeeded).toBe(false);
    });
  });
});
