/**
 * Logger utility for production-ready logging
 * 
 * @module Logger
 * @description Provides environment-aware logging with different log levels.
 * Silent in production unless explicitly enabled.
 * 
 * @example
 * ```typescript
 * import { Logger } from './utils/Logger';
 * 
 * const logger = new Logger('MyComponent');
 * logger.debug('Debug message', { data: 'value' });
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error message', error);
 * ```
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  /** Debug messages - most verbose */
  DEBUG = 'DEBUG',
  /** Informational messages */
  INFO = 'INFO',
  /** Warning messages */
  WARN = 'WARN',
  /** Error messages - highest severity */
  ERROR = 'ERROR',
  /** Silent - no logging */
  SILENT = 'SILENT'
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to display */
  level?: LogLevel;
  /** Enable logging in production */
  enableInProduction?: boolean;
  /** Custom prefix for all log messages */
  prefix?: string;
  /** Enable timestamps */
  timestamps?: boolean;
  /** Enable colored output (for development) */
  colors?: boolean;
}

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.SILENT]: 4
};

/**
 * ANSI color codes for terminal output
 */
const COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.SILENT]: ''  // No color for SILENT
} as const;

/**
 * ANSI reset code
 */
const RESET = '\x1b[0m';

/**
 * Production-ready Logger class
 * 
 * Features:
 * - Environment-aware (silent in production by default)
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Context support for better debugging
 * - TypeScript types
 * - Zero dependencies
 * 
 * @example
 * ```typescript
 * const logger = new Logger('APIClient', { level: LogLevel.DEBUG });
 * logger.debug('Making request', { url: '/api/users' });
 * logger.error('Request failed', new Error('Network error'));
 * ```
 */
export class Logger {
  private context: string;
  private config: Required<LoggerConfig>;

  /**
   * Create a new Logger instance
   * 
   * @param context - Context name (e.g., component name, module name)
   * @param config - Logger configuration options
   */
  constructor(context: string = 'App', config: LoggerConfig = {}) {
    this.context = context;
    this.config = {
      level: config.level ?? this.getDefaultLogLevel(),
      enableInProduction: config.enableInProduction ?? false,
      prefix: config.prefix ?? '[Minder]',
      timestamps: config.timestamps ?? true,
      colors: config.colors ?? this.shouldUseColors()
    };
  }

  /**
   * Get default log level based on environment
   */
  private getDefaultLogLevel(): LogLevel {
    if (typeof process !== 'undefined' && process.env) {
      const env = process.env.NODE_ENV;
      if (env === 'production') return LogLevel.ERROR;
      if (env === 'test') return LogLevel.WARN;
    }
    return LogLevel.DEBUG;
  }

  /**
   * Determine if we should use colored output
   */
  private shouldUseColors(): boolean {
    // Only use colors in Node.js environments (not browser)
    if (typeof process !== 'undefined' && process.stdout) {
      return process.stdout.isTTY ?? false;
    }
    return false;
  }

  /**
   * Check if logging is enabled for the current environment
   */
  private isEnabled(): boolean {
    // If explicitly enabled in production, always log
    if (this.config.enableInProduction) return true;
    
    // Check environment
    if (typeof process !== 'undefined' && process.env) {
      const env = process.env.NODE_ENV;
      // Disable in production only (allow in development, test, etc.)
      return env !== 'production';
    }
    
    // Default to enabled if we can't determine environment
    return true;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.isEnabled()) return false;
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  /**
   * Format a log message
   */
  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];
    
    // Add prefix (skip if empty)
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }
    
    // Add timestamp
    if (this.config.timestamps) {
      parts.push(new Date().toISOString());
    }
    
    // Add level
    const levelStr = this.config.colors 
      ? `${COLORS[level]}${level}${RESET}`
      : level;
    parts.push(`[${levelStr}]`);
    
    // Add context
    parts.push(`[${this.context}]`);
    
    // Add message
    parts.push(message);
    
    return parts.join(' ');
  }

  /**
   * Log a debug message
   * 
   * @param message - Debug message
   * @param data - Optional data to log
   * 
   * @example
   * ```typescript
   * logger.debug('User data loaded', { userId: 123 });
   * ```
   */
  debug(message: string, ...data: unknown[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const formattedMessage = this.formatMessage(LogLevel.DEBUG, message);
    if (data.length > 0) {
      console.log(formattedMessage, ...data);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Log an info message
   * 
   * @param message - Info message
   * @param data - Optional data to log
   * 
   * @example
   * ```typescript
   * logger.info('Server started', { port: 3000 });
   * ```
   */
  info(message: string, ...data: unknown[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const formattedMessage = this.formatMessage(LogLevel.INFO, message);
    if (data.length > 0) {
      console.log(formattedMessage, ...data);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Log a warning message
   * 
   * @param message - Warning message
   * @param data - Optional data to log
   * 
   * @example
   * ```typescript
   * logger.warn('Deprecated API usage', { api: 'oldMethod' });
   * ```
   */
  warn(message: string, ...data: unknown[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const formattedMessage = this.formatMessage(LogLevel.WARN, message);
    if (data.length > 0) {
      console.warn(formattedMessage, ...data);
    } else {
      console.warn(formattedMessage);
    }
  }

  /**
   * Log an error message
   * 
   * @param message - Error message
   * @param error - Error object or additional data
   * 
   * @example
   * ```typescript
   * logger.error('Failed to fetch data', new Error('Network error'));
   * ```
   */
  error(message: string, ...error: unknown[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const formattedMessage = this.formatMessage(LogLevel.ERROR, message);
    if (error.length > 0) {
      console.error(formattedMessage, ...error);
    } else {
      console.error(formattedMessage);
    }
  }

  /**
   * Create a child logger with a new context
   * 
   * @param context - New context name
   * @returns New Logger instance with same config but different context
   * 
   * @example
   * ```typescript
   * const parentLogger = new Logger('App');
   * const childLogger = parentLogger.child('Component');
   * childLogger.info('Child logger message');
   * ```
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.config);
  }

  /**
   * Update logger configuration
   * 
   * @param config - Partial configuration to update
   * 
   * @example
   * ```typescript
   * logger.setConfig({ level: LogLevel.ERROR });
   * ```
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config } as Required<LoggerConfig>;
  }

  /**
   * Get current configuration
   * 
   * @returns Current logger configuration
   */
  getConfig(): Readonly<Required<LoggerConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a logger instance
 * 
 * @param context - Context name
 * @param config - Logger configuration
 * @returns New Logger instance
 * 
 * @example
 * ```typescript
 * const logger = createLogger('MyModule');
 * logger.info('Module initialized');
 * ```
 */
export function createLogger(context: string, config?: LoggerConfig): Logger {
  return new Logger(context, config);
}

/**
 * Default logger instance for general use
 */
export const defaultLogger = new Logger('Minder');
