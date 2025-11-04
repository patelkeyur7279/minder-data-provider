/**
 * Jest Setup File
 * Runs before all tests
 */

// Add custom matchers from jest-dom
require('@testing-library/jest-dom');

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress console methods in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: jest.fn(), // Keep error visible for debugging
};

// Setup global test utilities
global.beforeEach(() => {
  jest.clearAllMocks();
});
