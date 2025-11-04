import React, { useState, useEffect } from "react";
import { useCache } from "../../src/hooks/index.js";

// 💾 ADVANCED CACHING SYSTEM
// Demonstrates all caching capabilities for optimal performance

export function CachingSystemExample() {
  // 🎣 Cache management hook
  const cache = useCache();

  // 📊 Cache statistics state
  const [cacheStats, setCacheStats] = useState<any>({});
  const [cacheData, setCacheData] = useState<any>({});
  const [customData, setCustomData] = useState("");
  const [customKey, setCustomKey] = useState("demo-key");

  // 🔄 Update cache statistics
  const updateCacheStats = () => {
    const allQueries = cache.getAllCachedQueries();
    const usersCache = cache.getCachedData("users");
    const productsCache = cache.getCachedData("products");

    setCacheStats({
      totalQueries: allQueries.length,
      queryKeys: allQueries.map((q) => q.queryKey),
      usersCount: Array.isArray(usersCache) ? usersCache.length : 0,
      productsCount: Array.isArray(productsCache) ? productsCache.length : 0,
      lastUpdated: new Date().toLocaleTimeString(),
    });

    setCacheData({
      users: usersCache,
      products: productsCache,
      custom: cache.getCachedData(customKey),
    });
  };

  // 📊 Auto-update stats every 2 seconds
  useEffect(() => {
    updateCacheStats();
    const interval = setInterval(updateCacheStats, 2000);
    return () => clearInterval(interval);
  }, [customKey]);

  // 📥 PRELOAD DATA - Load data into cache without UI update
  const handlePreloadUsers = async () => {
    try {
      console.log("📥 Preloading users data...");

      // Simulate API call and preload into cache
      await cache.prefetchQuery(
        "users", // Query key
        async () => {
          // Data fetcher function
          // Simulate API delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Return mock data
          return [
            {
              id: 1,
              name: "John Doe",
              email: "john@example.com",
              role: "admin",
            },
            {
              id: 2,
              name: "Jane Smith",
              email: "jane@example.com",
              role: "user",
            },
            {
              id: 3,
              name: "Bob Johnson",
              email: "bob@example.com",
              role: "user",
            },
          ];
        },
        {
          staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
          gcTime: 10 * 60 * 1000, // Garbage collect after 10 minutes
        }
      );

      console.log("✅ Users preloaded successfully");
      updateCacheStats();
    } catch (error) {
      console.error("❌ Preload failed:", error);
    }
  };

  // 📥 PRELOAD PRODUCTS - Different cache strategy
  const handlePreloadProducts = async () => {
    try {
      console.log("📥 Preloading products data...");

      await cache.prefetchQuery(
        ["products", "featured"], // Nested query key
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 800));

          return [
            { id: 1, name: "Laptop", price: 999, category: "Electronics" },
            { id: 2, name: "Phone", price: 599, category: "Electronics" },
            { id: 3, name: "Book", price: 29, category: "Education" },
          ];
        },
        {
          staleTime: 2 * 60 * 1000, // Fresh for 2 minutes (shorter for products)
          gcTime: 5 * 60 * 1000, // Garbage collect after 5 minutes
        }
      );

      console.log("✅ Products preloaded successfully");
      updateCacheStats();
    } catch (error) {
      console.error("❌ Products preload failed:", error);
    }
  };

  // 💾 SET CUSTOM CACHE DATA - Manual cache management
  const handleSetCustomData = () => {
    if (!customData.trim()) return;

    try {
      // Parse JSON if possible, otherwise store as string
      let dataToStore;
      try {
        dataToStore = JSON.parse(customData);
      } catch {
        dataToStore = customData;
      }

      // Store in cache with custom key
      cache.setCachedData(customKey, dataToStore);
      console.log(`💾 Custom data stored with key: ${customKey}`);
      updateCacheStats();
    } catch (error) {
      console.error("❌ Failed to set custom data:", error);
    }
  };

  // 🔍 CHECK CACHE FRESHNESS - Determine if data needs refresh
  const handleCheckFreshness = () => {
    const usersFresh = cache.isQueryFresh("users");
    const productsFresh = cache.isQueryFresh(["products", "featured"]);

    console.log("🔍 Cache Freshness Check:");
    console.log(`Users: ${usersFresh ? "✅ Fresh" : "⚠️ Stale"}`);
    console.log(`Products: ${productsFresh ? "✅ Fresh" : "⚠️ Stale"}`);

    alert(
      `Cache Status:\nUsers: ${usersFresh ? "Fresh" : "Stale"}\nProducts: ${
        productsFresh ? "Fresh" : "Stale"
      }`
    );
  };

  // 🔄 INVALIDATE SPECIFIC CACHE - Force refresh on next access
  const handleInvalidateUsers = async () => {
    try {
      await cache.invalidateQueries("users");
      console.log("🔄 Users cache invalidated");
      updateCacheStats();
    } catch (error) {
      console.error("❌ Invalidation failed:", error);
    }
  };

  // 🔄 INVALIDATE ALL QUERIES - Nuclear option
  const handleInvalidateAll = async () => {
    try {
      await cache.invalidateQueries();
      console.log("🔄 All queries invalidated");
      updateCacheStats();
    } catch (error) {
      console.error("❌ Global invalidation failed:", error);
    }
  };

  // 🗑️ REMOVE SPECIFIC CACHE - Completely remove from memory
  const handleRemoveUsers = () => {
    cache.clearCache("users");
    console.log("🗑️ Users cache removed");
    updateCacheStats();
  };

  // 🧹 CLEAR ALL CACHE - Complete cache reset
  const handleClearAll = () => {
    cache.clearCache();
    console.log("🧹 All cache cleared");
    updateCacheStats();
  };

  // 🎯 OPTIMISTIC UPDATE DEMO - Update cache optimistically
  // The optimisticUpdate method is not available in the cache object.
  // Demo is disabled.
  const handleOptimisticUpdate = () => {
    alert(
      "Optimistic update demo is unavailable: cache.optimisticUpdate is not implemented."
    );
  };

  return (
    <div className='caching-system'>
      <h2>💾 Advanced Caching System</h2>

      {/* 📊 CACHE STATISTICS */}
      <div className='cache-stats-panel'>
        <h3>📊 Cache Statistics</h3>
        <div className='stats-grid'>
          <div className='stat-item'>
            <strong>Total Queries:</strong> {cacheStats.totalQueries || 0}
          </div>
          <div className='stat-item'>
            <strong>Users Cached:</strong> {cacheStats.usersCount}
          </div>
          <div className='stat-item'>
            <strong>Products Cached:</strong> {cacheStats.productsCount}
          </div>
          <div className='stat-item'>
            <strong>Last Updated:</strong> {cacheStats.lastUpdated}
          </div>
        </div>

        {/* Query keys display */}
        {cacheStats.queryKeys && cacheStats.queryKeys.length > 0 && (
          <div className='query-keys'>
            <h4>🔑 Active Query Keys:</h4>
            <div className='keys-list'>
              {cacheStats.queryKeys.map((key: any, index: number) => (
                <span key={index} className='query-key'>
                  {Array.isArray(key) ? key.join(" → ") : key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 📥 PRELOADING OPERATIONS */}
      <div className='preload-panel'>
        <h3>📥 Data Preloading</h3>
        <p>Load data into cache without triggering UI updates</p>
        <div className='preload-buttons'>
          <button onClick={handlePreloadUsers} className='btn-preload'>
            👥 Preload Users (5min TTL)
          </button>
          <button onClick={handlePreloadProducts} className='btn-preload'>
            📦 Preload Products (2min TTL)
          </button>
          <button onClick={handleCheckFreshness} className='btn-check'>
            🔍 Check Freshness
          </button>
        </div>
      </div>

      {/* 💾 CUSTOM CACHE MANAGEMENT */}
      <div className='custom-cache-panel'>
        <h3>💾 Custom Cache Management</h3>
        <p>Manually store and retrieve custom data</p>
        <div className='custom-cache-form'>
          <input
            type='text'
            placeholder='Cache Key'
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
          />
          <textarea
            placeholder='Data (JSON or string)'
            value={customData}
            onChange={(e) => setCustomData(e.target.value)}
            rows={3}
          />
          <button onClick={handleSetCustomData} className='btn-set'>
            💾 Set Cache Data
          </button>
        </div>

        {/* Display custom cached data */}
        {cacheData.custom && (
          <div className='cached-data-display'>
            <h4>📄 Cached Data for "{customKey}":</h4>
            <pre>{JSON.stringify(cacheData.custom, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 🎯 OPTIMISTIC UPDATES */}
      <div className='optimistic-panel'>
        <h3>🎯 Optimistic Updates</h3>
        <p>Update cache immediately with rollback on failure</p>
        <button onClick={handleOptimisticUpdate} className='btn-optimistic'>
          ⚡ Optimistic Update Demo
        </button>
      </div>

      {/* 🔄 CACHE INVALIDATION */}
      <div className='invalidation-panel'>
        <h3>🔄 Cache Invalidation</h3>
        <p>Force refresh of cached data on next access</p>
        <div className='invalidation-buttons'>
          <button onClick={handleInvalidateUsers} className='btn-invalidate'>
            🔄 Invalidate Users
          </button>
          <button onClick={handleInvalidateAll} className='btn-invalidate-all'>
            🔄 Invalidate All
          </button>
        </div>
      </div>

      {/* 🗑️ CACHE REMOVAL */}
      <div className='removal-panel'>
        <h3>🗑️ Cache Removal</h3>
        <p>Completely remove data from cache memory</p>
        <div className='removal-buttons'>
          <button onClick={handleRemoveUsers} className='btn-remove'>
            🗑️ Remove Users
          </button>
          <button onClick={handleClearAll} className='btn-clear-all'>
            🧹 Clear All Cache
          </button>
        </div>
      </div>

      {/* 🎯 OPTIMISTIC UPDATES */}
      <div className='optimistic-panel'>
        <h3>🎯 Optimistic Updates</h3>
        <p>Update cache immediately with rollback on failure</p>
        <button
          onClick={handleOptimisticUpdate}
          className='btn-optimistic'
          disabled>
          ⚡ Optimistic Update Demo (Unavailable)
        </button>
        <div style={{ color: "red", marginTop: "8px" }}>
          Optimistic update is not supported in this cache implementation.
        </div>
      </div>

      {/* 🗂️ Cached Data Display */}
      <div className='cached-data-sections'>
        {/* Users data */}
        {cacheData.users && (
          <div className='cached-data-section'>
            <h4>👥 Users Cache:</h4>
            <pre>{JSON.stringify(cacheData.users, null, 2)}</pre>
          </div>
        )}

        {/* Products data */}
        {cacheData.products && (
          <div className='cached-data-section'>
            <h4>📦 Products Cache:</h4>
            <pre>{JSON.stringify(cacheData.products, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 📚 CACHING FEATURES */}
      <div className='feature-explanation'>
        <div>
          <h3>📚 Caching Features Explained</h3>
          <ul>
            <li>
              <strong>📥 Prefetching:</strong> Load data into cache without UI
              updates
            </li>
            <li>
              <strong>⏰ TTL (Time To Live):</strong> Automatic cache expiration
              with staleTime
            </li>
            <li>
              <strong>🗑️ Garbage Collection:</strong> Automatic cleanup with
              gcTime
            </li>
            <li>
              <strong>🔍 Freshness Check:</strong> Determine if cached data is
              still fresh
            </li>
            <li>
              <strong>🔄 Invalidation:</strong> Force refresh of specific or all
              cached data
            </li>
            <li>
              <strong>💾 Manual Management:</strong> Direct cache read/write
              operations
            </li>
            <li>
              <strong>🎯 Optimistic Updates:</strong> Immediate updates with
              rollback capability
            </li>
            <li>
              <strong>🔑 Flexible Keys:</strong> Support for simple strings or
              complex nested keys
            </li>
            <li>
              <strong>📊 Cache Analytics:</strong> Real-time statistics and
              monitoring
            </li>
            <li>
              <strong>🧹 Cache Cleanup:</strong> Granular or complete cache
              clearing
            </li>
          </ul>
        </div>
      </div>

      {/* 🎛️ CACHE STRATEGIES */}
      <div className='strategies-panel'>
        <h3>🎛️ Cache Strategies</h3>
        <div className='strategies-grid'>
          <div className='strategy-item'>
            <h4>🚀 Performance Strategy</h4>
            <ul>
              <li>Long staleTime for static data</li>
              <li>Preload critical data</li>
              <li>Use optimistic updates</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>🔄 Real-time Strategy</h4>
            <ul>
              <li>Short staleTime for dynamic data</li>
              <li>Frequent invalidation</li>
              <li>WebSocket integration</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>💾 Memory Strategy</h4>
            <ul>
              <li>Aggressive garbage collection</li>
              <li>Selective cache clearing</li>
              <li>Monitor cache size</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
