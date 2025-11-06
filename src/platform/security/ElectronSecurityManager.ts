/**
 * ElectronSecurityManager - Electron desktop security implementation
 * 
 * Implements CSP, sandboxing, context isolation, and desktop-specific security.
 * 
 * @module ElectronSecurityManager
 */

import { Logger, LogLevel } from '../../utils/Logger.js';
import {
  SecurityManager,
  SecurityConfig,
  SecurityValidation,
} from './SecurityManager.js';

const logger = new Logger('ElectronSecurityManager', { level: LogLevel.WARN });

/**
 * Electron Security Manager
 */
export class ElectronSecurityManager extends SecurityManager {
  private initialized = false;
  private isRenderer = false;

  constructor(config: SecurityConfig = {}) {
    super(config);
    this.detectEnvironment();
  }

  /**
   * Detect if running in renderer or main process
   */
  private detectEnvironment(): void {
    this.isRenderer = typeof window !== 'undefined' && (window as any).process?.type === 'renderer';
  }

  /**
   * Initialize Electron security features
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Set up CSP
    if (this.config.csp && this.isRenderer) {
      this.setupCSP();
    }

    // Validate security settings
    this.validateSecuritySettings();

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
    headers['X-Platform'] = 'electron';

    // CSP
    if (this.config.csp) {
      headers['Content-Security-Policy'] = this.buildCSPHeader();
    }

    // Security headers
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-Frame-Options'] = 'DENY';

    return headers;
  }

  /**
   * Validate request security
   */
  validateRequest(request: {
    url?: string;
    protocol?: string;
    headers?: Record<string, string>;
    body?: any;
  }): SecurityValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate URL protocol
    if (request.url || request.protocol) {
      const protocol = request.protocol || new URL(request.url!).protocol;
      const allowed = ['https:', 'http:', 'file:', 'app:'];
      
      if (!allowed.includes(protocol)) {
        errors.push(`Protocol ${protocol} is not allowed`);
      }

      // Warn about HTTP (not HTTPS)
      if (protocol === 'http:' && !request.url?.includes('localhost')) {
        warnings.push('Using HTTP instead of HTTPS');
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
   * Set up Content Security Policy
   */
  private setupCSP(): void {
    if (typeof document !== 'undefined') {
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = this.getElectronCSP();
      
      const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (existing) {
        existing.replaceWith(meta);
      } else {
        document.head.appendChild(meta);
      }
    }
  }

  /**
   * Get Electron-specific CSP
   */
  private getElectronCSP(): string {
    const directives: Record<string, string[]> = {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'https:'],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      ...this.config.cspDirectives,
    };

    return Object.entries(directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
  }

  /**
   * Validate Electron security settings
   */
  private validateSecuritySettings(): void {
    if (!this.isRenderer) {
      return;
    }

    const warnings: string[] = [];

    // Check context isolation
    try {
      const { contextIsolation } = (window as any).process.contextIsolation || {};
      if (this.config.contextIsolation && !contextIsolation) {
        warnings.push('Context isolation is recommended but not enabled');
      }
    } catch {
      // Context isolation info not available
    }

    // Check node integration
    try {
      const nodeIntegration = (window as any).process.versions?.electron;
      if (nodeIntegration && this.config.sandboxing) {
        warnings.push('Node integration should be disabled when sandboxing is enabled');
      }
    } catch {
      // Node integration info not available
    }

    if (warnings.length > 0) {
      logger.warn('Electron Security Warnings:', warnings);
    }
  }

  /**
   * Get recommended Electron BrowserWindow options
   */
  getRecommendedBrowserWindowOptions(): Record<string, unknown> {
    return {
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: this.config.contextIsolation,
        sandbox: this.config.sandboxing,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableRemoteModule: false,
        worldSafeExecuteJavaScript: true,
      },
    };
  }

  /**
   * Validate IPC message
   */
  validateIPCMessage(channel: string, ...args: any[]): SecurityValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate channel name
    const allowedChannels = [
      'dialog:openFile',
      'dialog:saveFile',
      'app:getPath',
      'window:minimize',
      'window:maximize',
      'window:close',
    ];

    if (!allowedChannels.includes(channel)) {
      warnings.push(`IPC channel '${channel}' is not in the allowed list`);
    }

    // Sanitize arguments
    if (this.config.sanitizeInput) {
      args.forEach((arg, index) => {
        if (typeof arg === 'object') {
          const result = this.sanitizeInput(arg);
          if (result.modified) {
            warnings.push(`Argument ${index} was sanitized`);
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize file path
   */
  sanitizeFilePath(filePath: string): string {
    // Remove potentially dangerous characters
    let sanitized = filePath.replace(/[<>:"|?*]/g, '');

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    sanitized = sanitized.replace(/\/\//g, '/');

    return sanitized;
  }

  /**
   * Validate file path
   */
  validateFilePath(filePath: string, allowedPaths: string[] = []): boolean {
    const sanitized = this.sanitizeFilePath(filePath);

    // Check if path is within allowed paths
    if (allowedPaths.length > 0) {
      return allowedPaths.some(allowed => sanitized.startsWith(allowed));
    }

    return true;
  }

  /**
   * Check if running in main process
   */
  isMainProcess(): boolean {
    return typeof process !== 'undefined' && (process as any).type === 'browser';
  }

  /**
   * Check if running in renderer process
   */
  isRendererProcess(): boolean {
    return this.isRenderer;
  }
}

/**
 * Create Electron security manager
 */
export function createElectronSecurity(config: SecurityConfig = {}): ElectronSecurityManager {
  return new ElectronSecurityManager(config);
}
