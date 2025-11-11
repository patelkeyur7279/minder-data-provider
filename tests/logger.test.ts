/**
 * @jest-environment node
 */

import { Logger, LogLevel, createLogger } from '../src/utils/Logger';
import { defaultLogger } from '../src/logger/index';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    (process.env as any).NODE_ENV = originalEnv;
  });

  describe('Constructor and Configuration', () => {
    it('should create logger with default config', () => {
      const logger = new Logger('Test');
      const config = logger.getConfig();
      
      expect(config.prefix).toBe('[Minder]');
      expect(config.timestamps).toBe(true);
    });

    it('should create logger with custom config', () => {
      const logger = new Logger('Test', {
        level: LogLevel.ERROR,
        prefix: '[Custom]',
        timestamps: false,
        enableInProduction: true
      });
      
      const config = logger.getConfig();
      expect(config.level).toBe(LogLevel.ERROR);
      expect(config.prefix).toBe('[Custom]');
      expect(config.timestamps).toBe(false);
      expect(config.enableInProduction).toBe(true);
    });

    it('should set default log level based on environment', () => {
      (process.env as any).NODE_ENV = 'development';
      const devLogger = new Logger('Dev');
      expect(devLogger.getConfig().level).toBe(LogLevel.DEBUG);

      (process.env as any).NODE_ENV = 'production';
      const prodLogger = new Logger('Prod');
      expect(prodLogger.getConfig().level).toBe(LogLevel.ERROR);

      (process.env as any).NODE_ENV = 'test';
      const testLogger = new Logger('Test');
      expect(testLogger.getConfig().level).toBe(LogLevel.WARN);
    });

    it('should update config with setConfig', () => {
      const logger = new Logger('Test');
      logger.setConfig({ level: LogLevel.WARN });
      
      expect(logger.getConfig().level).toBe(LogLevel.WARN);
    });
  });

  describe('Log Levels', () => {
    it('should log debug messages when level is DEBUG', () => {
      const logger = new Logger('Test', { level: LogLevel.DEBUG });
      logger.debug('Debug message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('DEBUG');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Test');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Debug message');
    });

    it('should log info messages when level is INFO or lower', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      logger.info('Info message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('INFO');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Info message');
    });

    it('should log warn messages when level is WARN or lower', () => {
      const logger = new Logger('Test', { level: LogLevel.WARN });
      logger.warn('Warning message');
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARN');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Warning message');
    });

    it('should log error messages when level is ERROR or lower', () => {
      const logger = new Logger('Test', { level: LogLevel.ERROR });
      logger.error('Error message');
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error message');
    });

    it('should not log when level is SILENT', () => {
      const logger = new Logger('Test', { level: LogLevel.SILENT });
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      const logger = new Logger('Test', { level: LogLevel.WARN });
      
      logger.debug('Debug'); // Should not log
      logger.info('Info');   // Should not log
      logger.warn('Warn');   // Should log
      logger.error('Error'); // Should log
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Additional Data', () => {
    it('should log additional data with debug', () => {
      const logger = new Logger('Test', { level: LogLevel.DEBUG });
      const data = { userId: 123, action: 'login' };
      
      logger.debug('User action', data);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][1]).toEqual(data);
    });

    it('should log multiple additional arguments', () => {
      const logger = new Logger('Test', { level: LogLevel.DEBUG });
      
      logger.info('Message', 'arg1', 'arg2', 123);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][1]).toBe('arg1');
      expect(consoleLogSpy.mock.calls[0][2]).toBe('arg2');
      expect(consoleLogSpy.mock.calls[0][3]).toBe(123);
    });

    it('should log error objects', () => {
      const logger = new Logger('Test', { level: LogLevel.ERROR });
      const error = new Error('Test error');
      
      logger.error('An error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe(error);
    });
  });

  describe('Environment Behavior', () => {
    it('should only log errors in production by default', () => {
      (process.env as any).NODE_ENV = 'production';
      const logger = new Logger('Test', { enableInProduction: true, level: LogLevel.ERROR });
      
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      
      // Only ERROR should log when level=ERROR
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log in production when enableInProduction is true', () => {
      (process.env as any).NODE_ENV = 'production';
      const logger = new Logger('Test', { 
        enableInProduction: true,
        level: LogLevel.DEBUG 
      });
      
      logger.debug('Debug message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log in development by default', () => {
      (process.env as any).NODE_ENV = 'development';
      const logger = new Logger('Test');
      
      logger.debug('Debug message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Message Formatting', () => {
    it('should include prefix in messages', () => {
      const logger = new Logger('Test', { prefix: '[MyApp]', level: LogLevel.INFO });
      logger.info('Message');
      
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[MyApp]');
    });

    it('should include context in messages', () => {
      const logger = new Logger('UserService', { level: LogLevel.INFO });
      logger.info('Message');
      
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[UserService]');
    });

    it('should include timestamps when enabled', () => {
      const logger = new Logger('Test', { timestamps: true, level: LogLevel.INFO });
      logger.info('Message');
      
      const message = consoleLogSpy.mock.calls[0][0];
      // Check for ISO timestamp format
      expect(message).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should not include timestamps when disabled', () => {
      const logger = new Logger('Test', { timestamps: false, level: LogLevel.INFO });
      logger.info('Message');
      
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should format messages without prefix when empty', () => {
      const logger = new Logger('Test', { prefix: '', level: LogLevel.INFO, colors: false });
      logger.info('Message');
      
      const message = consoleLogSpy.mock.calls[0][0];
      // When prefix is empty, it should still show timestamp
      expect(message).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(message).toContain('[INFO]');
      expect(message).toContain('[Test]');
      expect(message).toContain('Message');
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with nested context', () => {
      const parent = new Logger('Parent', { level: LogLevel.INFO });
      const child = parent.child('Child');
      
      child.info('Message');
      
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[Parent:Child]');
    });

    it('should inherit parent config', () => {
      const parent = new Logger('Parent', { level: LogLevel.ERROR });
      const child = parent.child('Child');
      
      expect(child.getConfig().level).toBe(LogLevel.ERROR);
    });

    it('should create deeply nested child loggers', () => {
      const parent = new Logger('App', { level: LogLevel.INFO });
      const child = parent.child('Module');
      const grandchild = child.child('Component');
      
      grandchild.info('Message');
      
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[App:Module:Component]');
    });
  });

  describe('Helper Functions', () => {
    it('should create logger with createLogger', () => {
      const logger = createLogger('Helper', { level: LogLevel.INFO });
      logger.info('Message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[Helper]');
    });

    it('should use default logger', () => {
      // Set log level to INFO for default logger
      defaultLogger.setConfig({ level: LogLevel.INFO });
      defaultLogger.info('Message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('[Minder]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      logger.info('');
      
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle undefined data', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      logger.info('Message', undefined);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][1]).toBeUndefined();
    });

    it('should handle null data', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      logger.info('Message', null);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][1]).toBeNull();
    });

    it('should handle circular references in data', () => {
      const logger = new Logger('Test');
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      // Should not throw
      expect(() => logger.info('Message', circular)).not.toThrow();
    });

    it('should handle very long messages', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      const longMessage = 'A'.repeat(10000);
      
      expect(() => logger.info(longMessage)).not.toThrow();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle special characters in messages', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      logger.info('Special chars: 🎉 \n\t\r 中文');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('🎉');
    });
  });

  describe('Performance', () => {
    it('should not format messages when logging is disabled', () => {
      const logger = new Logger('Test', { level: LogLevel.SILENT });
      const formatSpy = jest.spyOn(Date.prototype, 'toISOString');
      
      logger.debug('Message');
      logger.info('Message');
      logger.warn('Message');
      logger.error('Message');
      
      // toISOString should not be called when logging is disabled
      expect(formatSpy).not.toHaveBeenCalled();
      formatSpy.mockRestore();
    });

    it('should handle rapid logging', () => {
      const logger = new Logger('Test', { level: LogLevel.INFO });
      
      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1000);
    });
  });
});
