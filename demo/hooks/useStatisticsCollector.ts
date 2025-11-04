// Statistics Collector Hook
// Tracks all metrics in real-time

import { useEffect, useRef, useState, useCallback } from 'react';
import { LiveStatistics } from '../types/statistics';
import io, { Socket } from 'socket.io-client';

const initialStats: LiveStatistics = {
  rendering: {
    mode: 'CSR',
    ssr: 0,
    csr: 1,
    ssg: 0,
    isr: 0,
    lastRenderTime: Date.now(),
    currentPage: '/'
  },
  performance: {
    apiLatency: 0,
    cacheHitRate: 0,
    bundleSize: 0,
    loadTime: 0,
    ttfb: 0,
    fcp: 0,
    lcp: 0,
    cls: 0,
    fid: 0,
    p50: 0,
    p95: 0,
    p99: 0
  },
  cache: {
    hits: 0,
    misses: 0,
    size: 0,
    entries: 0,
    ttl: 0,
    strategy: 'stale-while-revalidate',
    topKeys: [],
    evictions: 0
  },
  network: {
    activeRequests: 0,
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    cachedRequests: 0,
    deduplicatedRequests: 0,
    websocketConnections: 0,
    bytesTransferred: 0,
    requestTimeline: []
  },
  features: {
    offline: false,
    websocket: false,
    auth: false,
    upload: false,
    redux: false,
    ssr: false,
    devtools: false,
    plugins: []
  },
  platform: {
    type: 'web',
    browser: '',
    browserVersion: '',
    os: '',
    osVersion: '',
    device: 'desktop',
    screen: { width: 0, height: 0 },
    orientation: 'landscape',
    connection: {
      type: '',
      effectiveType: '',
      downlink: 0,
      rtt: 0,
      saveData: false
    }
  },
  realtime: {
    lastUpdate: new Date().toISOString(),
    updateCount: 0,
    subscriptions: 0,
    rooms: [],
    events: []
  },
  errors: {
    total: 0,
    network: 0,
    validation: 0,
    server: 0,
    client: 0,
    recent: []
  },
  resources: {
    memory: {
      used: 0,
      total: 0,
      limit: 0
    },
    cpu: {
      usage: 0
    },
    storage: {
      used: 0,
      available: 0
    }
  }
};

export function useStatisticsCollector() {
  const [stats, setStats] = useState<LiveStatistics>(initialStats);
  const socketRef = useRef<Socket | null>(null);
  const metricsRef = useRef<any>({
    requests: [],
    latencies: []
  });

  // Detect rendering mode
  const detectRenderMode = useCallback((): 'SSR' | 'CSR' | 'SSG' | 'ISR' => {
    if (typeof window === 'undefined') {
      return 'SSR';
    }
    if ((window as any).__NEXT_DATA__?.props?.pageProps) {
      const props = (window as any).__NEXT_DATA__.props.pageProps;
      if (props.__N_SSG) return 'SSG';
      if (props.__N_SSP) return 'SSR';
    }
    return 'CSR';
  }, []);

  // Collect Core Web Vitals
  const collectWebVitals = () => {
    if (typeof window === 'undefined') return;

    // Dynamically import web-vitals to avoid SSR issues
    import('web-vitals').then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
      onCLS((metric: any) => {
        setStats((prev) => ({ ...prev, performance: { ...prev.performance, cls: metric.value } }));
      });

      // INP replaced FID in web-vitals v4
      onINP((metric: any) => {
        setStats((prev) => ({ ...prev, performance: { ...prev.performance, fid: metric.value } }));
      });

      onFCP((metric: any) => {
        setStats((prev) => ({ ...prev, performance: { ...prev.performance, fcp: metric.value } }));
      });

      onLCP((metric: any) => {
        setStats((prev) => ({ ...prev, performance: { ...prev.performance, lcp: metric.value } }));
      });

      onTTFB((metric: any) => {
        setStats((prev) => ({ ...prev, performance: { ...prev.performance, ttfb: metric.value } }));
      });
    }).catch(console.error);
  };

  // Detect platform
  const detectPlatform = useCallback(() => {
    if (typeof window === 'undefined') return;

    const nav = navigator as any;
    const mode = detectRenderMode();
    
    setStats(prev => ({
      ...prev,
      platform: {
        type: mode === 'SSR' || mode === 'SSG' ? 'nextjs' : 'web',
        browser: getBrowserName(),
        browserVersion: getBrowserVersion(),
        os: nav.platform || '',
        osVersion: getOSVersion(),
        device: getDeviceType(),
        screen: { 
          width: window.innerWidth, 
          height: window.innerHeight 
        },
        orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
        connection: {
          type: nav.connection?.type || '',
          effectiveType: nav.connection?.effectiveType || '',
          downlink: nav.connection?.downlink || 0,
          rtt: nav.connection?.rtt || 0,
          saveData: nav.connection?.saveData || false
        }
      }
    }));
  }, [detectRenderMode]);

  // Track API requests
  const trackRequest = useCallback((request: {
    url: string;
    method: string;
    status: number;
    duration: number;
    cached: boolean;
  }) => {
    metricsRef.current.requests.push(request);
    metricsRef.current.latencies.push(request.duration);
    
    // Keep last 100 requests
    if (metricsRef.current.requests.length > 100) {
      metricsRef.current.requests.shift();
      metricsRef.current.latencies.shift();
    }

    // Calculate percentiles
    const sorted = [...metricsRef.current.latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length || 0;

    setStats(prev => ({
      ...prev,
      network: {
        ...prev.network,
        totalRequests: prev.network.totalRequests + 1,
        successRequests: request.status >= 200 && request.status < 400 
          ? prev.network.successRequests + 1 
          : prev.network.successRequests,
        errorRequests: request.status >= 400 
          ? prev.network.errorRequests + 1 
          : prev.network.errorRequests,
        cachedRequests: request.cached 
          ? prev.network.cachedRequests + 1 
          : prev.network.cachedRequests,
        requestTimeline: [
          ...prev.network.requestTimeline.slice(-99),
          {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            url: request.url,
            method: request.method,
            status: request.status,
            duration: request.duration,
            cached: request.cached
          }
        ]
      },
      performance: {
        ...prev.performance,
        apiLatency: Math.round(avg),
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99)
      }
    }));
  }, []);

  // Track cache hits/misses
  const trackCache = useCallback((hit: boolean, key: string, size: number = 0) => {
    setStats(prev => {
      const newHits = hit ? prev.cache.hits + 1 : prev.cache.hits;
      const newMisses = hit ? prev.cache.misses : prev.cache.misses + 1;
      const total = newHits + newMisses;
      const hitRate = total > 0 ? (newHits / total) * 100 : 0;

      return {
        ...prev,
        cache: {
          ...prev.cache,
          hits: newHits,
          misses: newMisses,
          entries: prev.cache.entries + (hit ? 0 : 1)
        },
        performance: {
          ...prev.performance,
          cacheHitRate: Math.round(hitRate * 10) / 10
        }
      };
    });
  }, []);

  // Track errors
  const trackError = useCallback((error: Error, type: string = 'client') => {
    setStats(prev => ({
      ...prev,
      errors: {
        ...prev.errors,
        total: prev.errors.total + 1,
        [type]: (prev.errors[type as keyof typeof prev.errors] as number) + 1,
        recent: [
          {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            type
          },
          ...prev.errors.recent.slice(0, 9)
        ]
      }
    }));
  }, []);

  // Connect to WebSocket for live updates
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';
    
    socketRef.current = io(wsUrl, {
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      console.log('📊 Statistics WebSocket connected');
      setStats(prev => ({
        ...prev,
        network: {
          ...prev.network,
          websocketConnections: prev.network.websocketConnections + 1
        },
        features: {
          ...prev.features,
          websocket: true
        }
      }));
    });

    socketRef.current.on('stats:update', (data) => {
      // Update with server stats if needed
      console.log('📊 Server stats:', data);
    });

    socketRef.current.on('disconnect', () => {
      console.log('📊 Statistics WebSocket disconnected');
      setStats(prev => ({
        ...prev,
        features: {
          ...prev.features,
          websocket: false
        }
      }));
    });

    // Request stats every 5 seconds
    const interval = setInterval(() => {
      socketRef.current?.emit('stats:request');
    }, 5000);

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, []);

  // Initialize
  useEffect(() => {
    const mode = detectRenderMode();
    setStats(prev => ({
      ...prev,
      rendering: {
        ...prev.rendering,
        mode,
        [mode.toLowerCase()]: prev.rendering[mode.toLowerCase() as 'ssr' | 'csr' | 'ssg' | 'isr'] + 1
      }
    }));

    collectWebVitals();
    detectPlatform();

    // Track page load time
    if (typeof window !== 'undefined' && window.performance) {
      const loadTime = Math.round(performance.now());
      setStats(prev => ({
        ...prev,
        performance: {
          ...prev.performance,
          loadTime
        }
      }));
    }

    // Monitor memory (if available)
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      setStats(prev => ({
        ...prev,
        resources: {
          ...prev.resources,
          memory: {
            used: memory.usedJSHeapSize,
            total: memory.totalJSHeapSize,
            limit: memory.jsHeapSizeLimit
          }
        }
      }));
    }
  }, [detectRenderMode, collectWebVitals, detectPlatform]);

  // Manual update function
  const updateStats = useCallback((updates: Partial<LiveStatistics>) => {
    setStats(prev => ({
      ...prev,
      ...updates,
      realtime: {
        ...prev.realtime,
        lastUpdate: new Date().toISOString(),
        updateCount: prev.realtime.updateCount + 1
      }
    }));
  }, []);

  return { 
    stats, 
    updateStats,
    trackRequest,
    trackCache,
    trackError
  };
}

// Helper functions
function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function getBrowserVersion(): string {
  const ua = navigator.userAgent;
  const match = ua.match(/(Firefox|Chrome|Safari|Edge)\/(\d+)/);
  return match ? match[2] : '';
}

function getOSVersion(): string {
  const ua = navigator.userAgent;
  const match = ua.match(/\(([^)]+)\)/);
  return match ? match[1] : '';
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
