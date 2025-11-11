/**
 * Tests for Next.js dynamic import validation
 * Ensures proper error handling when dynamic is missing in Next.js apps
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { configureMinder } from '../src/config/index.js';
import { PlatformDetector } from '../src/platform/PlatformDetector.js';
import { Platform } from '../src/constants/enums.js';
import { MinderConfigError } from '../src/errors/MinderError.js';

describe('Next.js Dynamic Import Validation', () => {
  // Store original platform detection
  let originalDetect: typeof PlatformDetector.detect;

  beforeEach(() => {
    // Save original detect method
    originalDetect = PlatformDetector.detect;
    PlatformDetector.reset();
  });

  afterEach(() => {
    // Restore original detect method
    PlatformDetector.detect = originalDetect;
    PlatformDetector.reset();
  });

  it('should throw clear error when Next.js detected without dynamic', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' }
    };

    expect(() => configureMinder(config)).toThrow(MinderConfigError);
    
    try {
      configureMinder(config);
    } catch (error) {
      expect(error).toBeInstanceOf(MinderConfigError);
      const configError = error as MinderConfigError;
      
      // Verify error message
      expect(configError.message).toContain('Next.js detected');
      expect(configError.message).toContain('dynamic');
      
      // Verify error code
      expect(configError.code).toBe('NEXTJS_DYNAMIC_REQUIRED');
      
      // Verify suggestions are provided
      expect(configError.suggestions.length).toBeGreaterThan(0);
      
      // Check for helpful suggestions
      const suggestionMessages = configError.suggestions.map(s => s.message.toLowerCase());
      expect(suggestionMessages.some(msg => msg.includes('dynamic'))).toBe(true);
      expect(suggestionMessages.some(msg => msg.includes('import'))).toBe(true);
    }
  });

  it('should NOT throw error when Next.js detected WITH dynamic function', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    // Mock dynamic function (mimics next/dynamic)
    const mockDynamic = () => null;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: mockDynamic
    };

    // Should not throw
    expect(() => configureMinder(config)).not.toThrow();
    
    const result = configureMinder(config);
    expect(result).toBeDefined();
    expect(result.apiBaseUrl).toBe('https://api.example.com');
  });

  it('should NOT throw error for non-Next.js platforms without dynamic', () => {
    // Mock Web platform detection
    PlatformDetector.detect = () => Platform.WEB;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' }
      // No dynamic property - this is fine for Web
    };

    // Should not throw
    expect(() => configureMinder(config)).not.toThrow();
    
    const result = configureMinder(config);
    expect(result).toBeDefined();
  });

  it('should throw error when Next.js detected with empty dynamic object', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: {} // Empty object, not a function
    };

    expect(() => configureMinder(config)).toThrow(MinderConfigError);
  });

  it('should throw error when Next.js detected with null dynamic', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' },
      dynamic: null // Null value
    };

    expect(() => configureMinder(config)).toThrow(MinderConfigError);
  });

  it('error should include helpful documentation link', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' }
    };

    try {
      configureMinder(config);
      throw new Error('Should have thrown error');
    } catch (error) {
      const configError = error as MinderConfigError;
      
      // Check for documentation link in suggestions
      const hasDocLink = configError.suggestions.some(s => 
        s.link && s.link.includes('DYNAMIC_IMPORTS.md')
      );
      expect(hasDocLink).toBe(true);
    }
  });

  it('error should include example code in suggestions', () => {
    // Mock Next.js platform detection
    PlatformDetector.detect = () => Platform.NEXT_JS;

    const config = {
      apiUrl: 'https://api.example.com',
      routes: { users: '/users' }
    };

    try {
      configureMinder(config);
      throw new Error('Should have thrown error');
    } catch (error) {
      const configError = error as MinderConfigError;
      
      // Check for example code in suggestions
      const hasExample = configError.suggestions.some(s => 
        s.action && s.action.includes('import dynamic')
      );
      expect(hasExample).toBe(true);
      
      // Check for configuration example
      const hasConfigExample = configError.suggestions.some(s => 
        s.action && s.action.includes('createMinderConfig')
      );
      expect(hasConfigExample).toBe(true);
    }
  });
});
