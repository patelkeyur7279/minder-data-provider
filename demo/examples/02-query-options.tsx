/**
 * Example 2: Query Options - Advanced Data Fetching
 * 
 * This example shows how to customize queries with options like:
 * - Pagination
 * - Filtering
 * - Sorting
 * - Auto-refresh
 * - Cache control
 * 
 * WHY: Real applications need more control over data fetching.
 * Query options give you that power while keeping code simple.
 */

import React, { useState } from 'react';
import { useMinder } from '../../src/hooks/useMinder';

/**
 * CONCEPT: Query Options
 * 
 * The second parameter to useMinder accepts options that control:
 * - When to fetch data
 * - How to cache it
 * - What parameters to send
 * - How often to refresh
 */

export function QueryOptionsExample() {
  // State for pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // State for filtering
  const [searchTerm, setSearchTerm] = useState('');

  // State for sorting
  const [sortBy, setSortBy] = useState<'name' | 'email'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  /**
   * OPTION 1: Query Parameters
   * 
   * WHY use params?
   * - Send data to the server in the URL
   * - Works with GET requests
   * - Common for pagination, filtering, sorting
   * 
   * HOW it works:
   * params: { page: 1, limit: 10 }
   * Results in: /users?page=1&limit=10
   */
  const { data: users, loading, error, refetch } = useMinder('/users', {
    params: {
      _page: page,        // JSONPlaceholder uses _page
      _limit: limit,      // JSONPlaceholder uses _limit
      q: searchTerm,      // Search query
    },

    /**
     * OPTION 2: Enabled
     * 
     * WHY use enabled?
     * - Conditionally fetch data
     * - Wait for user input
     * - Depend on other data
     * 
     * Example: Only fetch when search term is long enough
     */
    enabled: searchTerm.length >= 2 || searchTerm === '',

    /**
     * OPTION 3: Cache TTL (Time-To-Live)
     * 
     * WHY set cacheTTL?
     * - Control how long cached data stays "fresh"
     * - Reduce unnecessary requests
     * - Balance freshness vs performance
     * 
     * 5 minutes = 5 * 60 * 1000 ms
     */
    cacheTTL: 5 * 60 * 1000,

    /**
     * OPTION 4: Refetch on Window Focus
     * 
     * WHY enable this?
     * - Keep data fresh when user returns to tab
     * - Detect changes made in other tabs
     * - Better real-time experience
     */
    refetchOnWindowFocus: true,

    /**
     * OPTION 5: Refetch on Reconnect
     * 
     * WHY enable this?
     * - Get fresh data when connection is restored
     * - Handle offline/online transitions
     * - Ensure data consistency
     */
    refetchOnReconnect: true,

    /**
     * OPTION 6: Refetch Interval
     * 
     * WHY use polling?
     * - Real-time updates without WebSocket
     * - Dashboard refresh
     * - Monitor changing data
     * 
     * false = disabled (default)
     * number = milliseconds between refetches
     */
    refetchInterval: false,
  });

  /**
   * Client-side filtering and sorting
   * 
   * WHY do this client-side?
   * - JSONPlaceholder has limited API
   * - Real apps might do this server-side
   * - Demonstrates data transformation
   */
  const filteredAndSortedUsers = React.useMemo(() => {
    if (!users) return [];

    let result = [...users];

    // Apply sorting
    result.sort((a: any, b: any) => {
      const aVal = a[sortBy].toLowerCase();
      const bVal = b[sortBy].toLowerCase();

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return result;
  }, [users, sortBy, sortOrder]);

  return (
    <div className="example-card">
      <h2>🔍 Advanced Query Options</h2>
      <p className="explanation">
        This example demonstrates how to use query options to control
        data fetching, caching, and behavior.
      </p>

      {/* Search Input */}
      <div className="search-section">
        <input
          type="text"
          placeholder="Search users (min 2 characters)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {searchTerm.length > 0 && searchTerm.length < 2 && (
          <small className="hint">
            Type at least 2 characters to search
          </small>
        )}
      </div>

      {/* Sorting Controls */}
      <div className="controls-section">
        <div className="control-group">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Name</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div className="control-group">
          <label>Order:</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <button onClick={() => refetch()} className="btn-secondary">
          🔄 Refresh
        </button>
      </div>

      {/* Pagination Controls */}
      <div className="pagination">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          ← Previous
        </button>
        <span>Page {page}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={!users || users.length < limit}
        >
          Next →
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>Error: {error.message}</p>
        </div>
      ) : (
        <div className="users-grid">
          {filteredAndSortedUsers.map((user: any) => (
            <div key={user.id} className="user-card">
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              <small>ID: {user.id}</small>
            </div>
          ))}
        </div>
      )}

      {/* Options Explanation */}
      <div className="options-guide">
        <h3>📖 Understanding Query Options</h3>
        
        <div className="option-item">
          <h4>params</h4>
          <p><strong>What:</strong> URL query parameters</p>
          <p><strong>Why:</strong> Send data with GET requests (pagination, filters)</p>
          <code>params: {'{ page: 1, limit: 10 }'}</code>
        </div>

        <div className="option-item">
          <h4>enabled</h4>
          <p><strong>What:</strong> Conditional fetching</p>
          <p><strong>Why:</strong> Wait for dependencies or user input</p>
          <code>enabled: searchTerm.length {'>'} 2</code>
        </div>

        <div className="option-item">
          <h4>staleTime</h4>
          <p><strong>What:</strong> How long data stays fresh (ms)</p>
          <p><strong>Why:</strong> Reduce requests, improve performance</p>
          <code>staleTime: 5 * 60 * 1000 // 5 minutes</code>
        </div>

        <div className="option-item">
          <h4>cacheTime</h4>
          <p><strong>What:</strong> How long to keep in cache (ms)</p>
          <p><strong>Why:</strong> Fast navigation, better UX</p>
          <code>cacheTime: 10 * 60 * 1000 // 10 minutes</code>
        </div>

        <div className="option-item">
          <h4>refetchOnWindowFocus</h4>
          <p><strong>What:</strong> Refresh when tab gets focus</p>
          <p><strong>Why:</strong> Keep data current, detect changes</p>
          <code>refetchOnWindowFocus: true</code>
        </div>

        <div className="option-item">
          <h4>retry</h4>
          <p><strong>What:</strong> Number of retry attempts</p>
          <p><strong>Why:</strong> Handle flaky networks, temporary errors</p>
          <code>retry: 3</code>
        </div>
      </div>

      {/* Best Practices */}
      <div className="best-practices">
        <h3>💡 Best Practices</h3>
        <ul>
          <li>
            <strong>staleTime:</strong> Set longer for static data (5-30 min),
            shorter for dynamic data (30s-2min)
          </li>
          <li>
            <strong>cacheTime:</strong> Usually 2x staleTime, keep data for back navigation
          </li>
          <li>
            <strong>enabled:</strong> Use for dependent queries or conditional fetching
          </li>
          <li>
            <strong>refetchOnWindowFocus:</strong> Enable for critical data,
            disable for expensive queries
          </li>
          <li>
            <strong>retry:</strong> Use 2-3 for reliability, 0 for user-triggered actions
          </li>
        </ul>
      </div>

      {/* Common Use Cases */}
      <div className="use-cases">
        <h3>🎯 Common Use Cases</h3>
        
        <div className="use-case">
          <h4>Infinite Scroll / Pagination</h4>
          <pre>{`const { data } = useMinder('/posts', {
  params: { page, limit: 20 }
});`}</pre>
        </div>

        <div className="use-case">
          <h4>Search with Debouncing</h4>
          <pre>{`const { data } = useMinder('/search', {
  params: { q: searchTerm },
  enabled: searchTerm.length >= 3,
  staleTime: 30000 // Cache searches
});`}</pre>
        </div>

        <div className="use-case">
          <h4>Real-time Dashboard</h4>
          <pre>{`const { data } = useMinder('/metrics', {
  refetchInterval: 5000, // Every 5s
  refetchOnWindowFocus: true,
  staleTime: 0 // Always fresh
});`}</pre>
        </div>

        <div className="use-case">
          <h4>Dependent Query</h4>
          <pre>{`const { data: user } = useMinder('/user');
const { data: posts } = useMinder('/posts', {
  params: { userId: user?.id },
  enabled: !!user?.id
});`}</pre>
        </div>
      </div>
    </div>
  );
}

export default QueryOptionsExample;
