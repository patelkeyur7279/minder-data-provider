export class TelemetryTracker {
  private static instance: TelemetryTracker;

  private stats = {
    failedAuthAttempts: 0,
    rateLimitHits: 0,
    suspiciousRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private constructor() {}

  public static getInstance(): TelemetryTracker {
    if (!TelemetryTracker.instance) {
      TelemetryTracker.instance = new TelemetryTracker();
    }
    return TelemetryTracker.instance;
  }

  public recordAuthFailure() {
    this.stats.failedAuthAttempts++;
  }

  public recordRateLimitHit() {
    this.stats.rateLimitHits++;
  }

  public recordSuspiciousRequest() {
    this.stats.suspiciousRequests++;
  }

  public recordCacheHit() {
    this.stats.cacheHits++;
  }

  public recordCacheMiss() {
    this.stats.cacheMisses++;
  }

  public getFailedAuthAttempts(): number {
    return this.stats.failedAuthAttempts;
  }

  public getRateLimitHits(): number {
    return this.stats.rateLimitHits;
  }

  public getSuspiciousRequests(): number {
    return this.stats.suspiciousRequests;
  }

  public getCacheHitRate(): number {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    if (total === 0) return 0;
    return Math.round((this.stats.cacheHits / total) * 100);
  }

  public getBundleSize(): number {
    // Return approximate size of the framework bundle
    return 95000;
  }

  public getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
    }
    return 0;
  }
}

export const telemetry = TelemetryTracker.getInstance();
