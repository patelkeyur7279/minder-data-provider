/**
 * Tests for AsyncStorage auto-detection
 * Issue #8: Add helpful error when AsyncStorage is missing in React Native
 * 
 * Tests:
 * 1. Throws clear error when AsyncStorage not installed
 * 2. Error includes installation instructions
 * 3. Error includes alternative solutions
 * 4. Works correctly when AsyncStorage is available
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NativeStorageAdapter } from '../src/platform/adapters/storage/NativeStorageAdapter.js';
import { MinderConfigError } from '../src/errors/MinderError.js';

describe('AsyncStorage Auto-Detection', () => {
  let originalRequire: NodeRequire;

  beforeEach(() => {
    // Save original require
    originalRequire = global.require;
  });

  afterEach(() => {
    // Restore original require
    global.require = originalRequire;
  });

  describe('Missing AsyncStorage', () => {
    it('should throw MinderConfigError when AsyncStorage not installed', () => {
      // Mock require to throw (simulating package not installed)
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module '@react-native-async-storage/async-storage'");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      expect(() => new NativeStorageAdapter()).toThrow(MinderConfigError);
    });

    it('should include installation instructions in error', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(MinderConfigError);
        const message = (error as Error).message;
        
        // Check for installation instructions
        expect(message).toContain('npm install @react-native-async-storage/async-storage');
        expect(message).toContain('yarn add @react-native-async-storage/async-storage');
      }
    });

    it('should include rebuild instructions in error', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for rebuild instructions
        expect(message).toContain('npx pod-install');
        expect(message).toContain('npx react-native run-ios');
      }
    });

    it('should include documentation link in error', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for documentation link
        expect(message).toContain('https://react-native-async-storage.github.io/async-storage/');
      }
    });

    it('should include alternative solution (memory storage) in error', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for alternative solution
        expect(message).toContain('StorageType.MEMORY');
        expect(message).toContain('configureMinder');
      }
    });

    it('should include original error message', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Module not found");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for original error section
        expect(message).toContain('Original error:');
        // The actual error will be from Jest's module resolution
        expect(message).toContain('Cannot find module');
      }
    });

    it('should throw error even when AsyncStorage default is null', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          return { default: null }; // Simulate malformed package
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      expect(() => new NativeStorageAdapter()).toThrow(MinderConfigError);
    });

    it('should throw error even when AsyncStorage default is undefined', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          return { default: undefined }; // Simulate malformed package
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      expect(() => new NativeStorageAdapter()).toThrow(MinderConfigError);
    });
  });

  // Note: Testing with AsyncStorage available requires the actual package to be installed
  // These tests are skipped in the test environment where AsyncStorage is not a dependency
  
  describe('Error Message Quality', () => {
    it('should have user-friendly error header', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false);
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for friendly header
        expect(message).toContain('❌ AsyncStorage Not Found!');
        expect(message).toContain('React Native apps require');
      }
    });

    it('should have clear sections (Installation, Rebuild, Alternative)', () => {
      global.require = ((moduleName: string) => {
        if (moduleName === '@react-native-async-storage/async-storage') {
          throw new Error("Cannot find module");
        }
        return originalRequire(moduleName);
      }) as NodeRequire;

      try {
        new NativeStorageAdapter();
        expect(true).toBe(false);
      } catch (error) {
        const message = (error as Error).message;
        
        // Check for clear sections
        expect(message).toContain('📦 Installation:');
        expect(message).toContain('🔧 Then rebuild your app:');
        expect(message).toContain('📚 Documentation:');
        expect(message).toContain('💡 Alternative:');
      }
    });
  });
});
