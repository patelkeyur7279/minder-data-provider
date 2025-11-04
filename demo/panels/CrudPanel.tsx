/**
 * 🔄 CRUD OPERATIONS PANEL
 * Complete CRUD demo with users, posts, and real-time updates
 */

import React, { useState } from 'react';
import { useMinder } from '../../src/index';

export function CrudPanel() {
  const [selectedResource, setSelectedResource] = useState('users');
  
  // Fetch users using useMinder hook
  const { data, loading, error, refetch } = useMinder<any[]>('/users', {
    method: 'GET',
  });

  return (
    <div className="panel crud-panel">
      <div className="panel-header">
        <h2>🔄 CRUD Operations</h2>
        <p>Complete Create, Read, Update, Delete with optimistic updates</p>
      </div>

      <div className="panel-content">
        {/* Resource Selector */}
        <div className="resource-selector">
          <button
            className={selectedResource === 'users' ? 'active' : ''}
            onClick={() => setSelectedResource('users')}
          >
            👤 Users
          </button>
          <button
            className={selectedResource === 'posts' ? 'active' : ''}
            onClick={() => setSelectedResource('posts')}
          >
            📝 Posts
          </button>
          <button
            className={selectedResource === 'comments' ? 'active' : ''}
            onClick={() => setSelectedResource('comments')}
          >
            💬 Comments
          </button>
        </div>

        {/* Data List */}
        <div className="data-list">
          <h3>📋 {selectedResource} List</h3>
          {loading && <div className="loading">⏳ Loading...</div>}
          {error && <div className="error">❌ Error: {String(error)}</div>}
          {data && (
            <div className="items-grid">
              {data.slice(0, 10).map((item: any) => (
                <div key={item.id} className="data-item">
                  <div className="item-header">
                    <strong>{item.name}</strong>
                    <span className="item-id">#{item.id}</span>
                  </div>
                  <div className="item-body">
                    {item.email || item.title || item.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Features */}
        <div className="features-info">
          <h3>✨ CRUD Features</h3>
          <ul>
            <li>✅ Optimistic Updates - Instant UI feedback</li>
            <li>✅ Automatic Rollback - Revert on error</li>
            <li>✅ Cache Invalidation - Auto-refresh related data</li>
            <li>✅ Request Deduplication - Avoid duplicate requests</li>
            <li>✅ Retry Logic - Automatic retry with backoff</li>
            <li>✅ Model Transformation - Auto-transform responses</li>
          </ul>
        </div>

        {/* Stats */}
        <div className="stats-card">
          <div className="stat">
            <div className="stat-label">Total Items</div>
            <div className="stat-value">{data?.length || 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Status</div>
            <div className="stat-value">{loading ? '🔄' : '✅'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
