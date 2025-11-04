/**
 * Example 5: Caching & Performance
 * 
 * Learn how to optimize data fetching with caching:
 * - Cache TTL (Time-To-Live)
 * - Manual cache invalidation
 * - Optimistic updates
 * - Background refetching
 * 
 * WHY: Caching improves performance by reducing unnecessary
 * network requests and providing instant data to users.
 */

import React, { useState } from 'react';
import { useMinder } from '../../src';

/**
 * CONCEPT: Caching Strategy
 * 
 * FRESH → Data is recent, use cache
 * STALE → Data is old, refetch in background
 * INVALID → Data is wrong, refetch immediately
 */

interface CacheDemo {
  id: number;
  title: string;
  fetchedAt: string;
}

export function CachingExample() {
  const [cacheTime, setCacheTime] = useState(5 * 60 * 1000); // 5 minutes default
  const [showStats, setShowStats] = useState(true);

  /**
   * EXAMPLE 1: Basic Caching
   * 
   * WHY cache?
   * - Reduce server load
   * - Faster response time
   * - Work offline (cached data)
   * - Save bandwidth
   */
  const basicCache = useMinder<CacheDemo[]>('/posts', {
    params: { _limit: 5 },
  });

  /**
   * EXAMPLE 2: Custom Cache Time
   * 
   * Different data needs different cache times:
   * - User profile: 10-30 minutes (changes rarely)
   * - News feed: 1-5 minutes (changes frequently)
   * - Stock prices: 10-30 seconds (real-time)
   * - Static content: 1+ hours (rarely changes)
   */
  const customCache = useMinder<CacheDemo[]>('/posts', {
    params: { _limit: 3 },
    cacheTTL: cacheTime,
  });

  /**
   * EXAMPLE 3: Manual Refetch
   * 
   * WHY manual refetch?
   * - User clicks "Refresh" button
   * - After mutation (create/update/delete)
   * - Periodic polling
   * - On window focus
   */
  const manualCache = useMinder<CacheDemo[]>('/posts', {
    params: { _limit: 4 },
  });

  /**
   * EXAMPLE 4: Optimistic Update
   * 
   * WHY optimistic?
   * - Instant UI feedback
   * - Better UX (feels faster)
   * - Rollback if server fails
   */
  const optimisticCache = useMinder<CacheDemo[]>('/posts', {
    params: { _limit: 3 },
  });

  /**
   * Helper: Get cache age
   */
  const getCacheAge = (timestamp?: number): string => {
    if (!timestamp) return 'Unknown';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="example-card">
      <h2>⚡ Caching & Performance</h2>
      <p className="explanation">
        Learn how to use caching to make your app faster and more efficient.
      </p>

      {/* Cache Stats Toggle */}
      <div className="stats-toggle">
        <label>
          <input
            type="checkbox"
            checked={showStats}
            onChange={(e) => setShowStats(e.target.checked)}
          />
          Show Cache Statistics
        </label>
      </div>

      {/* Example 1: Basic Caching */}
      <div className="example-section">
        <h3>1️⃣ Basic Caching (Default 5min TTL)</h3>
        <p>Data is cached automatically. Refetch only when stale.</p>
        
        {showStats && (
          <div className="cache-stats">
            <div className="stat">
              <span className="stat-label">Status:</span>
              <span className="stat-value">
                {basicCache.loading ? '⏳ Loading' : 
                 basicCache.isFetching ? '🔄 Refreshing' : 
                 '✅ Cached'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Items:</span>
              <span className="stat-value">{basicCache.data?.length || 0}</span>
            </div>
          </div>
        )}

        <div className="data-preview">
          {basicCache.loading ? (
            <div className="loading">⏳ Loading...</div>
          ) : basicCache.data ? (
            <div className="items-list">
              {basicCache.data.slice(0, 3).map((item) => (
                <div key={item.id} className="item-card">
                  <strong>#{item.id}</strong> {item.title}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No data</div>
          )}
        </div>

        <button
          onClick={() => basicCache.refetch()}
          className="btn-refresh"
          disabled={basicCache.isFetching}
        >
          {basicCache.isFetching ? '🔄 Refreshing...' : '🔄 Force Refresh'}
        </button>
      </div>

      {/* Example 2: Custom Cache Time */}
      <div className="example-section">
        <h3>2️⃣ Custom Cache Time (Configurable TTL)</h3>
        
        <div className="cache-config">
          <label>
            Cache Duration:
            <select
              value={cacheTime}
              onChange={(e) => setCacheTime(Number(e.target.value))}
            >
              <option value={10000}>10 seconds (demo)</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
              <option value={300000}>5 minutes</option>
              <option value={600000}>10 minutes</option>
              <option value={1800000}>30 minutes</option>
              <option value={3600000}>1 hour</option>
            </select>
          </label>
          <p className="hint">
            Adjust based on how often your data changes
          </p>
        </div>

        {showStats && (
          <div className="cache-stats">
            <div className="stat">
              <span className="stat-label">TTL:</span>
              <span className="stat-value">{cacheTime / 1000}s</span>
            </div>
            <div className="stat">
              <span className="stat-label">Is Stale:</span>
              <span className="stat-value">
                {customCache.isStale ? '⚠️ Yes' : '✅ No'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Example 3: Manual Cache Control */}
      <div className="example-section">
        <h3>3️⃣ Manual Cache Control</h3>
        
        <div className="manual-controls">
          <button
            onClick={() => manualCache.refetch()}
            className="btn-primary"
            disabled={manualCache.isFetching}
          >
            🔄 Refetch Data
          </button>
          
          <button
            onClick={() => manualCache.invalidate()}
            className="btn-secondary"
          >
            🗑️ Invalidate Cache
          </button>
        </div>

        <div className="explanation-box">
          <p><strong>Refetch:</strong> Gets fresh data, keeps cache until new data arrives</p>
          <p><strong>Invalidate:</strong> Marks cache as stale, triggers automatic refetch</p>
        </div>
      </div>

      {/* How Caching Works */}
      <div className="caching-guide">
        <h3>🔍 How Caching Works</h3>

        <div className="cache-lifecycle">
          <div className="lifecycle-step">
            <h4>1️⃣ First Request</h4>
            <pre>{`const { data } = useMinder('/posts');
// → Fetches from server
// → Stores in cache
// → Returns data`}</pre>
          </div>

          <div className="lifecycle-step">
            <h4>2️⃣ Subsequent Requests (Fresh)</h4>
            <pre>{`const { data } = useMinder('/posts');
// → Checks cache
// → Data is fresh (within TTL)
// → Returns cached data instantly
// → No network request!`}</pre>
          </div>

          <div className="lifecycle-step">
            <h4>3️⃣ Subsequent Requests (Stale)</h4>
            <pre>{`const { data } = useMinder('/posts');
// → Returns stale cached data (instant)
// → Fetches fresh data in background
// → Updates cache when response arrives
// → Re-renders component with new data`}</pre>
          </div>

          <div className="lifecycle-step">
            <h4>4️⃣ Manual Refetch</h4>
            <pre>{`refetch();
// → Shows loading state
// → Fetches from server
// → Updates cache
// → Returns new data`}</pre>
          </div>

          <div className="lifecycle-step">
            <h4>5️⃣ Cache Invalidation</h4>
            <pre>{`invalidate();
// → Marks cache as invalid
// → Triggers refetch automatically
// → Updates all components using this data`}</pre>
          </div>
        </div>
      </div>

      {/* Best Practices */}
      <div className="best-practices">
        <h3>💡 Caching Best Practices</h3>

        <div className="practice">
          <h4>Choose the Right TTL</h4>
          <ul>
            <li><strong>Static data:</strong> 1+ hours (rarely changes)</li>
            <li><strong>User profile:</strong> 10-30 minutes</li>
            <li><strong>List data:</strong> 5-10 minutes</li>
            <li><strong>Real-time data:</strong> 10-30 seconds</li>
            <li><strong>Live updates:</strong> Use WebSocket instead</li>
          </ul>
        </div>

        <div className="practice">
          <h4>Invalidate After Mutations</h4>
          <pre>{`const create = useMinder('/posts', {
  method: 'POST',
  autoFetch: false
});

const { data } = useMinder('/posts'); // List query

// After creating:
await create.mutate(newPost);
await invalidate(); // Refresh the list`}</pre>
        </div>

        <div className="practice">
          <h4>Use Query Keys Wisely</h4>
          <pre>{`// Different keys = separate caches
useMinder('/posts'); // Cache key: ['/posts', undefined]
useMinder('/posts', { params: { page: 1 } }); // Key: ['/posts', {page:1}]
useMinder('/posts', { params: { page: 2 } }); // Key: ['/posts', {page:2}]

// Each has its own cache!`}</pre>
        </div>

        <div className="practice">
          <h4>Prefetch for Better UX</h4>
          <pre>{`// Prefetch next page on hover
onMouseEnter={() => {
  useMinder('/posts', { 
    params: { page: 2 },
    autoFetch: true // Prefetch in background
  });
}}`}</pre>
        </div>
      </div>

      {/* Performance Tips */}
      <div className="performance-tips">
        <h3>🚀 Performance Tips</h3>
        <ul>
          <li>
            <strong>✅ Cache frequently accessed data:</strong> Reduces server load
          </li>
          <li>
            <strong>✅ Use longer TTL for static content:</strong> Serve from cache
          </li>
          <li>
            <strong>✅ Invalidate after mutations:</strong> Keep data fresh
          </li>
          <li>
            <strong>✅ Prefetch on hover/focus:</strong> Feels instant when clicked
          </li>
          <li>
            <strong>✅ Use optimistic updates:</strong> Update UI before server responds
          </li>
          <li>
            <strong>⚠️ Don't cache sensitive data:</strong> Security risk
          </li>
          <li>
            <strong>⚠️ Don't use very short TTL:</strong> Defeats purpose of caching
          </li>
        </ul>
      </div>

      {/* Advanced Patterns */}
      <div className="advanced-patterns">
        <h3>🎯 Advanced Caching Patterns</h3>

        <div className="pattern">
          <h4>1. Cache-First Strategy</h4>
          <p>Return cached data immediately, update in background</p>
          <pre>{`const { data } = useMinder('/posts', {
  cacheTTL: 10 * 60 * 1000, // 10 minutes
  // Returns cache if available
  // Fetches fresh data in background if stale
});`}</pre>
        </div>

        <div className="pattern">
          <h4>2. Network-First Strategy</h4>
          <p>Always fetch fresh data, fallback to cache if offline</p>
          <pre>{`const { data, refetch } = useMinder('/posts');

// Always refetch on mount
useEffect(() => {
  refetch();
}, []);`}</pre>
        </div>

        <div className="pattern">
          <h4>3. Optimistic Updates</h4>
          <p>Update cache immediately, rollback on error</p>
          <pre>{`// Update cache optimistically
const optimisticData = [...currentData, newItem];
queryClient.setQueryData('/posts', optimisticData);

// Send request
const result = await mutate(newItem);

// Rollback if failed
if (!result.success) {
  queryClient.setQueryData('/posts', currentData);
}`}</pre>
        </div>
      </div>
    </div>
  );
}

export default CachingExample;
