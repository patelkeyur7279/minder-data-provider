// Live Statistics Types for Demo App

export interface LiveStatistics {
  // Rendering Metrics
  rendering: {
    mode: 'SSR' | 'CSR' | 'SSG' | 'ISR';
    ssr: number;
    csr: number;
    ssg: number;
    isr: number;
    lastRenderTime: number;
    currentPage: string;
  };

  // Performance Metrics
  performance: {
    apiLatency: number;        // Average API response time (ms)
    cacheHitRate: number;      // Cache hit percentage
    bundleSize: number;        // Current bundle size (KB)
    loadTime: number;          // Page load time (ms)
    ttfb: number;              // Time to first byte (ms)
    fcp: number;               // First contentful paint (ms)
    lcp: number;               // Largest contentful paint (ms)
    cls: number;               // Cumulative layout shift
    fid: number;               // First input delay (ms)
    p50: number;               // 50th percentile
    p95: number;               // 95th percentile
    p99: number;               // 99th percentile
  };

  // Cache Statistics
  cache: {
    hits: number;
    misses: number;
    size: number;              // Cache size (bytes)
    entries: number;           // Number of cached entries
    ttl: number;               // Average TTL (ms)
    strategy: 'stale-while-revalidate' | 'cache-first' | 'network-first';
    topKeys: Array<{
      key: string;
      hits: number;
      size: number;
      lastAccess: string;
    }>;
    evictions: number;
  };

  // Network Activity
  network: {
    activeRequests: number;
    totalRequests: number;
    successRequests: number;
    errorRequests: number;
    cachedRequests: number;
    deduplicatedRequests: number;
    websocketConnections: number;
    bytesTransferred: number;
    requestTimeline: Array<{
      id: string;
      timestamp: number;
      url: string;
      method: string;
      status: number;
      duration: number;
      cached: boolean;
    }>;
  };

  // Feature Usage
  features: {
    offline: boolean;
    websocket: boolean;
    auth: boolean;
    upload: boolean;
    redux: boolean;
    ssr: boolean;
    devtools: boolean;
    plugins: string[];
  };

  // Platform Information
  platform: {
    type: 'web' | 'nextjs' | 'native' | 'expo' | 'electron' | 'node';
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    device: 'mobile' | 'tablet' | 'desktop';
    screen: { width: number; height: number };
    orientation: 'portrait' | 'landscape';
    connection: {
      type: string;
      effectiveType: string;
      downlink: number;
      rtt: number;
      saveData: boolean;
    };
  };

  // Real-time Updates
  realtime: {
    lastUpdate: string;
    updateCount: number;
    subscriptions: number;
    rooms: string[];
    events: Array<{
      type: string;
      timestamp: string;
      data: any;
    }>;
  };

  // Error Tracking
  errors: {
    total: number;
    network: number;
    validation: number;
    server: number;
    client: number;
    recent: Array<{
      message: string;
      stack?: string;
      timestamp: string;
      type: string;
    }>;
  };

  // Memory & Resources
  resources: {
    memory: {
      used: number;
      total: number;
      limit: number;
    };
    cpu: {
      usage: number;
    };
    storage: {
      used: number;
      available: number;
    };
  };
}

export interface StatisticsUpdate {
  timestamp: string;
  metric: keyof LiveStatistics;
  value: any;
}

export interface PerformanceEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: number;
  cached: boolean;
}

export interface CacheEntry {
  key: string;
  size: number;
  hits: number;
  ttl: number;
  lastAccess: string;
}
