/**
 * Comprehensive Tests for DebugManager
 * Tests the debugging and performance monitoring utilities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DebugManager, type DebugLogEntry } from '../src/debug/DebugManager';

describe('DebugManager', () => {
  let debugManager: DebugManager;
  let consoleDebugSpy: any;

  beforeEach(() => {
    // Spy on console.debug
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    // Clean up global
    if (typeof window !== 'undefined') {
      delete (window as any).__MINDER_DEBUG__;
    }
  });

  describe('constructor', () => {
    it('should create instance with debugging disabled by default', () => {
      debugManager = new DebugManager();
      
      expect(debugManager).toBeDefined();
      expect(debugManager.getLogs()).toEqual([]);
    });

    it('should create instance with debugging enabled', () => {
      debugManager = new DebugManager(true);
      
      expect(debugManager).toBeDefined();
    });

    it('should attach to window when enabled in browser environment', () => {
      // Mock window object
      global.window = {} as any;
      
      debugManager = new DebugManager(true);
      
      expect((global.window as any).__MINDER_DEBUG__).toBe(debugManager);
      
      // Cleanup
      delete (global as any).window;
    });

    it('should not attach to window when disabled', () => {
      global.window = {} as any;
      
      debugManager = new DebugManager(false);
      
      expect((global.window as any).__MINDER_DEBUG__).toBeUndefined();
      
      delete (global as any).window;
    });

    it('should handle missing window in Node.js environment', () => {
      const originalWindow = global.window;
      delete (global as any).window;
      
      expect(() => {
        debugManager = new DebugManager(true);
      }).not.toThrow();
      
      if (originalWindow) {
        global.window = originalWindow;
      }
    });
  });

  describe('log', () => {
    it('should log API events when enabled', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'GET /users', { status: 200 });
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].type).toBe('api');
      expect(logs[0].message).toBe('GET /users');
      expect(logs[0].data).toEqual({ status: 200 });
      expect(logs[0].timestamp).toBeDefined();
    });

    it('should log cache events', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('cache', 'Cache hit', { key: 'users:1' });
      
      const logs = debugManager.getLogs();
      expect(logs[0].type).toBe('cache');
      expect(logs[0].message).toBe('Cache hit');
    });

    it('should log auth events', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('auth', 'Token refreshed');
      
      const logs = debugManager.getLogs();
      expect(logs[0].type).toBe('auth');
    });

    it('should log websocket events', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('websocket', 'Connection established');
      
      const logs = debugManager.getLogs();
      expect(logs[0].type).toBe('websocket');
    });

    it('should not log when disabled', () => {
      debugManager = new DebugManager(false);
      
      debugManager.log('api', 'Test message');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(0);
    });

    it('should include stack trace in log entries', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'Test');
      
      const logs = debugManager.getLogs();
      expect(logs[0].stack).toBeDefined();
      expect(typeof logs[0].stack).toBe('string');
    });

    it('should handle log without data parameter', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'Simple message');
      
      const logs = debugManager.getLogs();
      expect(logs[0].data).toBeUndefined();
    });

    it('should accumulate multiple log entries', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'First');
      debugManager.log('cache', 'Second');
      debugManager.log('auth', 'Third');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].message).toBe('First');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('Third');
    });

    it('should include timestamp in logs', () => {
      debugManager = new DebugManager(true);
      
      const before = Date.now();
      debugManager.log('api', 'Test');
      const after = Date.now();
      
      const logs = debugManager.getLogs();
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(logs[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('startTimer / endTimer', () => {
    it('should measure performance when enabled', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test-operation');
      debugManager.endTimer('test-operation');
      
      // Timer should be removed after ending
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.find(([key]) => key === 'test-operation')).toBeUndefined();
    });

    it('should not measure when disabled', () => {
      debugManager = new DebugManager(false);
      
      debugManager.startTimer('test-operation');
      debugManager.endTimer('test-operation');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.length).toBe(0);
    });

    it('should handle multiple concurrent timers', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('operation-1');
      debugManager.startTimer('operation-2');
      debugManager.startTimer('operation-3');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.length).toBe(3);
    });

    it('should handle ending timer that was never started', () => {
      debugManager = new DebugManager(true);
      
      expect(() => {
        debugManager.endTimer('non-existent');
      }).not.toThrow();
    });

    it('should clean up timer after ending', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test');
      expect(debugManager.getPerformanceMetrics().length).toBe(1);
      
      debugManager.endTimer('test');
      expect(debugManager.getPerformanceMetrics().length).toBe(0);
    });

    it('should handle ending same timer twice', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test');
      debugManager.endTimer('test');
      debugManager.endTimer('test'); // Second call should be safe
      
      expect(debugManager.getPerformanceMetrics().length).toBe(0);
    });

    it('should measure timing accurately', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0][0]).toBe('test');
      expect(typeof metrics[0][1]).toBe('number');
      expect(metrics[0][1]).toBeGreaterThan(0);
    });

    it('should fallback to Date.now() when performance is unavailable', () => {
      const originalPerformance = global.performance;
      delete (global as any).performance;
      
      debugManager = new DebugManager(true);
      
      const before = Date.now();
      debugManager.startTimer('test');
      const after = Date.now();
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics[0][1]).toBeGreaterThanOrEqual(before);
      expect(metrics[0][1]).toBeLessThanOrEqual(after);
      
      if (originalPerformance) {
        global.performance = originalPerformance;
      }
    });
  });

  describe('getLogs', () => {
    it('should return empty array initially', () => {
      debugManager = new DebugManager(true);
      
      const logs = debugManager.getLogs();
      expect(logs).toEqual([]);
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should return all accumulated logs', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'Log 1');
      debugManager.log('cache', 'Log 2');
      debugManager.log('auth', 'Log 3');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(3);
    });

    it('should return logs in chronological order', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'First');
      debugManager.log('cache', 'Second');
      debugManager.log('auth', 'Third');
      
      const logs = debugManager.getLogs();
      expect(logs[0].message).toBe('First');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('Third');
      expect(logs[0].timestamp).toBeLessThanOrEqual(logs[1].timestamp);
      expect(logs[1].timestamp).toBeLessThanOrEqual(logs[2].timestamp);
    });
  });

  describe('clearLogs', () => {
    it('should remove all logs', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'Test 1');
      debugManager.log('cache', 'Test 2');
      
      expect(debugManager.getLogs().length).toBe(2);
      
      debugManager.clearLogs();
      
      expect(debugManager.getLogs().length).toBe(0);
      expect(debugManager.getLogs()).toEqual([]);
    });

    it('should work when no logs exist', () => {
      debugManager = new DebugManager(true);
      
      expect(() => debugManager.clearLogs()).not.toThrow();
      expect(debugManager.getLogs()).toEqual([]);
    });

    it('should allow logging after clearing', () => {
      debugManager = new DebugManager(true);
      
      debugManager.log('api', 'Before clear');
      debugManager.clearLogs();
      debugManager.log('api', 'After clear');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('After clear');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return empty array initially', () => {
      debugManager = new DebugManager(true);
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics).toEqual([]);
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should return active timers', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('timer-1');
      debugManager.startTimer('timer-2');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.length).toBe(2);
      expect(metrics.some(([key]) => key === 'timer-1')).toBe(true);
      expect(metrics.some(([key]) => key === 'timer-2')).toBe(true);
    });

    it('should return timer values', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics[0][0]).toBe('test');
      expect(typeof metrics[0][1]).toBe('number');
      expect(metrics[0][1]).toBeGreaterThan(0);
    });

    it('should not include ended timers', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('test-1');
      debugManager.startTimer('test-2');
      debugManager.endTimer('test-1');
      
      const metrics = debugManager.getPerformanceMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0][0]).toBe('test-2');
    });
  });

  describe('integration scenarios', () => {
    it('should support full debugging workflow', () => {
      debugManager = new DebugManager(true);
      
      // Start operation
      debugManager.startTimer('api-request');
      debugManager.log('api', 'Starting request', { url: '/users' });
      
      // Simulate some work
      debugManager.log('cache', 'Cache miss');
      
      // End operation
      debugManager.log('api', 'Request completed', { status: 200 });
      debugManager.endTimer('api-request');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].type).toBe('api');
      expect(logs[1].type).toBe('cache');
      expect(logs[2].type).toBe('api');
    });

    it('should support multiple concurrent operations', () => {
      debugManager = new DebugManager(true);
      
      debugManager.startTimer('operation-1');
      debugManager.log('api', 'Op 1 start');
      
      debugManager.startTimer('operation-2');
      debugManager.log('api', 'Op 2 start');
      
      debugManager.endTimer('operation-1');
      debugManager.log('api', 'Op 1 end');
      
      debugManager.endTimer('operation-2');
      debugManager.log('api', 'Op 2 end');
      
      const logs = debugManager.getLogs();
      expect(logs.length).toBe(4);
    });

    it('should support periodic log clearing', () => {
      debugManager = new DebugManager(true);
      
      // Batch 1
      debugManager.log('api', 'Request 1');
      debugManager.log('api', 'Request 2');
      expect(debugManager.getLogs().length).toBe(2);
      
      // Clear
      debugManager.clearLogs();
      
      // Batch 2
      debugManager.log('api', 'Request 3');
      expect(debugManager.getLogs().length).toBe(1);
    });

    it('should handle disabled mode correctly', () => {
      debugManager = new DebugManager(false);
      
      debugManager.startTimer('test');
      debugManager.log('api', 'Test message');
      debugManager.endTimer('test');
      
      expect(debugManager.getLogs()).toEqual([]);
      expect(debugManager.getPerformanceMetrics()).toEqual([]);
    });
  });
});
