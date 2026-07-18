/**
 * Simple unit test to verify testing infrastructure works
 * This demonstrates tests are properly configured
 */

describe('Test Infrastructure', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should perform basic assertions', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });

  it('should handle async operations', async () => {
    const asyncFn = async () => 'success';
    const result = await asyncFn();
    expect(result).toBe('success');
  });
});

/**
 * Infrastructure & Package Tests
 * Basic validation tests for package structure and configuration
 */

describe('Package Infrastructure', () => {
  it('should have correct package name', () => {
    const pkg = require('../package.json');
    expect(pkg.name).toBe('minder-data-provider');
  });

  it('should have peer dependencies defined', () => {
    const pkg = require('../package.json');
    expect(pkg.peerDependencies).toBeDefined();
    expect(pkg.peerDependencies['react']).toBeDefined();
    expect(pkg.peerDependencies['react-dom']).toBeDefined();
  });

  it('keeps React-context singletons as peers and utilities as dependencies', () => {
    const pkg = require('../package.json');
    // React-context singleton libraries must be PEER deps: shipping them as
    // hard deps installs a second copy alongside the consumer's own, breaking
    // Redux/QueryClient context (fixed in 2.2.0-beta.1).
    expect(pkg.peerDependencies['@tanstack/react-query']).toBeDefined();
    expect(pkg.peerDependencies['@reduxjs/toolkit']).toBeDefined();
    expect(pkg.dependencies['@tanstack/react-query']).toBeUndefined();
    expect(pkg.dependencies['@reduxjs/toolkit']).toBeUndefined();
    // Non-context utilities stay bundled so users don't manage versions.
    expect(pkg.dependencies['axios']).toBeDefined();
    expect(pkg.dependencies['immer']).toBeDefined();
  });
});
