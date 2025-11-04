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
    expect(pkg.peerDependencies['@tanstack/react-query']).toBeDefined();
  });
});
