/**
 * Platform Security Tests
 * 
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  WebSecurityManager,
  NativeSecurityManager,
  ElectronSecurityManager,
  SecurityManagerFactory,
} from '../src/platform/security';
import { PlatformDetector } from '../src/platform';

describe('Security: Input Sanitization', () => {
  let manager: WebSecurityManager;

  beforeEach(() => {
    manager = new WebSecurityManager({ sanitizeInput: true });
  });

  it('should remove script tags', () => {
    const result = manager.sanitizeInput('<script>alert("XSS")</script>Hello');
    expect(result.sanitized).not.toContain('<script>');
    expect(result.modified).toBe(true);
  });

  it('should remove dangerous object keys', () => {
    const result = manager.sanitizeInput({
      name: 'John',
      __proto__: { admin: true },
      constructor: {},
    });
    expect(result.sanitized.name).toBe('John');
    expect(result.removedKeys.length).toBeGreaterThan(0);
    expect(result.modified).toBe(true);
  });

  it('should sanitize nested objects', () => {
    const result = manager.sanitizeInput({
      user: { name: '<script>alert(1)</script>' },
    });
    expect(result.sanitized.user.name).not.toContain('<script>');
  });

  it('should handle arrays', () => {
    const result = manager.sanitizeInput(['<script>test</script>', 'safe']);
    expect(result.sanitized[0]).not.toContain('<script>');
    expect(result.sanitized[1]).toBe('safe');
  });
});

describe('Security: Output Encoding', () => {
  let manager: WebSecurityManager;

  beforeEach(() => {
    manager = new WebSecurityManager({ encodeOutput: true });
  });

  it('should encode HTML entities', () => {
    const output = manager.encodeOutput('<script>alert(1)</script>');
    expect(output).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  it('should encode quotes', () => {
    const output = manager.encodeOutput('"test"');
    expect(output).toContain('&quot;');
  });
});

describe('Security: CSRF Protection', () => {
  let manager: WebSecurityManager;

  beforeEach(async () => {
    manager = new WebSecurityManager({ csrfProtection: true });
    await manager.initialize();
  });

  it('should generate CSRF token', () => {
    const token = manager.generateCSRFToken();
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);
  });

  it('should validate correct CSRF token', () => {
    const token = 'test123';
    expect(manager.validateCSRFToken(token, token)).toBe(true);
  });

  it('should reject invalid CSRF token', () => {
    expect(manager.validateCSRFToken('wrong', 'correct')).toBe(false);
  });

  it('should reject POST without CSRF token', () => {
    const validation = manager.validateRequest({ method: 'POST', headers: {} });
    expect(validation.valid).toBe(false);
  });

  it('should allow POST with valid CSRF token', () => {
    const token = manager.getCSRFToken();
    const validation = manager.validateRequest({
      method: 'POST',
      headers: { 'X-CSRF-Token': token! },
    });
    expect(validation.valid).toBe(true);
  });

  it('should allow GET without CSRF token', () => {
    const validation = manager.validateRequest({ method: 'GET', headers: {} });
    expect(validation.valid).toBe(true);
  });
});

describe('Security: CSP', () => {
  let manager: WebSecurityManager;

  beforeEach(() => {
    manager = new WebSecurityManager({ csp: true });
  });

  it('should build CSP header', () => {
    const csp = manager.buildCSPHeader();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('script-src');
  });

  it('should use custom CSP directives', () => {
    const custom = new WebSecurityManager({
      cspDirectives: { 'default-src': ["'none'"] },
    });
    const csp = custom.buildCSPHeader();
    expect(csp).toContain("default-src 'none'");
  });
});

describe('Security: Origin Validation', () => {
  it('should allow any origin when list is empty', () => {
    const manager = new WebSecurityManager({ allowedOrigins: [] });
    expect(manager.validateOrigin('https://example.com')).toBe(true);
  });

  it('should allow exact match', () => {
    const manager = new WebSecurityManager({
      allowedOrigins: ['https://example.com'],
    });
    expect(manager.validateOrigin('https://example.com')).toBe(true);
    expect(manager.validateOrigin('https://evil.com')).toBe(false);
  });

  it('should support wildcard subdomains', () => {
    const manager = new WebSecurityManager({ allowedOrigins: ['*.example.com'] });
    expect(manager.validateOrigin('https://api.example.com')).toBe(true);
    expect(manager.validateOrigin('https://example.org')).toBe(false);
  });
});

describe('Security: Web Security Manager', () => {
  let manager: WebSecurityManager;

  beforeEach(async () => {
    manager = new WebSecurityManager({ xssProtection: true });
    await manager.initialize();
  });

  it('should provide security headers', () => {
    const headers = manager.getSecurityHeaders();
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should sanitize URLs', () => {
    expect(manager.sanitizeURL('https://example.com')).toBe('https://example.com');
    expect(manager.sanitizeURL('javascript:alert(1)')).toBe('/');
  });

  it('should sanitize HTML', () => {
    const html = '<div><script>alert(1)</script>Hello</div>';
    const sanitized = manager.sanitizeHTML(html);
    expect(sanitized).not.toContain('<script>');
  });
});

describe('Security: Native Security Manager', () => {
  let manager: NativeSecurityManager;

  beforeEach(async () => {
    manager = new NativeSecurityManager({ secureStorage: true });
    await manager.initialize();
  });

  it('should include platform identifier', () => {
    const headers = manager.getSecurityHeaders();
    expect(headers['X-Platform']).toBe('react-native');
  });

  it('should allow HTTPS URLs', () => {
    const validation = manager.validateRequest({ url: 'https://api.example.com' });
    expect(validation.valid).toBe(true);
  });

  it('should reject HTTP URLs', () => {
    const validation = manager.validateRequest({ url: 'http://example.com' });
    expect(validation.valid).toBe(false);
  });

  it('should allow localhost HTTP', () => {
    const validation = manager.validateRequest({ url: 'http://localhost:3000' });
    expect(validation.valid).toBe(true);
  });

  it('should encrypt and decrypt data', async () => {
    const encrypted = await manager.encryptData('secret', 'key');
    const decrypted = await manager.decryptData(encrypted, 'key');
    expect(decrypted).toBe('secret');
  });
});

describe('Security: Electron Security Manager', () => {
  let manager: ElectronSecurityManager;

  beforeEach(async () => {
    manager = new ElectronSecurityManager({ csp: true, sandboxing: true });
    await manager.initialize();
  });

  it('should include platform identifier', () => {
    const headers = manager.getSecurityHeaders();
    expect(headers['X-Platform']).toBe('electron');
  });

  it('should provide BrowserWindow options', () => {
    const options = manager.getRecommendedBrowserWindowOptions();
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.sandbox).toBe(true);
  });

  it('should validate IPC messages', () => {
    const validation = manager.validateIPCMessage('dialog:openFile', {});
    expect(validation.valid).toBe(true);
  });

  it('should sanitize file paths', () => {
    const sanitized = manager.sanitizeFilePath('test<>file.txt');
    expect(sanitized).not.toContain('<');
  });

  it('should remove path traversal', () => {
    const sanitized = manager.sanitizeFilePath('../../../etc/passwd');
    expect(sanitized).not.toContain('..');
  });
});

describe('Security: Security Manager Factory', () => {
  it('should create WebSecurityManager for web', () => {
    jest.spyOn(PlatformDetector, 'detect').mockReturnValue('web');
    const manager = SecurityManagerFactory.create();
    expect(manager).toBeInstanceOf(WebSecurityManager);
  });

  it('should create NativeSecurityManager for React Native', () => {
    jest.spyOn(PlatformDetector, 'detect').mockReturnValue('react-native');
    const manager = SecurityManagerFactory.create();
    expect(manager).toBeInstanceOf(NativeSecurityManager);
  });

  it('should create ElectronSecurityManager for Electron', () => {
    jest.spyOn(PlatformDetector, 'detect').mockReturnValue('electron');
    const manager = SecurityManagerFactory.create();
    expect(manager).toBeInstanceOf(ElectronSecurityManager);
  });

  it('should get available features for web', () => {
    jest.spyOn(PlatformDetector, 'detect').mockReturnValue('web');
    const features = SecurityManagerFactory.getAvailableFeatures();
    expect(features.xssProtection).toBe(true);
    expect(features.csrfProtection).toBe(true);
  });

  it('should get available features for native', () => {
    jest.spyOn(PlatformDetector, 'detect').mockReturnValue('react-native');
    const features = SecurityManagerFactory.getAvailableFeatures();
    expect(features.secureStorage).toBe(true);
    expect(features.certificatePinning).toBe(true);
  });
});
