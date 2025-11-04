export class DebugManager {
  private enabled: boolean = false;
  private logs: any[] = [];
  private performance: Map<string, number> = new Map();

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
    if (enabled && typeof window !== 'undefined') {
      (window as any).__MINDER_DEBUG__ = this;
    }
  }

  log(type: 'api' | 'cache' | 'auth' | 'websocket', message: string, data?: any) {
    if (!this.enabled) return;
    
    const logEntry = {
      type,
      message,
      data,
      timestamp: Date.now(),
      stack: new Error().stack
    };
    
    this.logs.push(logEntry);
    console.group(`🔍 Minder Debug [${type.toUpperCase()}]`);
    console.log(message, data);
    console.groupEnd();
  }

  startTimer(key: string) {
    if (!this.enabled) return;
    const now = typeof performance !== 'undefined' && performance.now 
      ? performance.now() 
      : Date.now();
    this.performance.set(key, now);
  }

  endTimer(key: string) {
    if (!this.enabled) return;
    const start = this.performance.get(key);
    if (start) {
      const now = typeof performance !== 'undefined' && performance.now 
        ? performance.now() 
        : Date.now();
      const duration = now - start;
      console.log(`⏱️ ${key}: ${duration.toFixed(2)}ms`);
      this.performance.delete(key);
    }
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  getPerformanceMetrics() {
    return Array.from(this.performance.entries());
  }
}