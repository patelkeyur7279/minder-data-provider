/**
 * Example 1: Basic Usage - Getting Started with Minder
 * 
 * This example demonstrates the simplest way to use Minder Data Provider.
 * You'll learn how to fetch data with just one line of code.
 * 
 * WHY: Starting with the basics helps you understand the core concept before
 * diving into advanced features. This is the foundation everything else builds on.
 */

import React from 'react';
import { useMinder } from '../../src/hooks/useMinder';

/**
 * CONCEPT: The useMinder hook
 * 
 * useMinder is the primary way to interact with your API. It:
 * 1. Automatically handles fetching data
 * 2. Manages loading and error states
 * 3. Caches results for better performance
 * 4. Re-fetches when needed
 * 
 * SYNTAX: const { data, loading, error } = useMinder(endpoint, options);
 */

export function BasicUsageExample() {
  /**
   * STEP 1: Fetch data from an API endpoint
   * 
   * The endpoint 'users' will automatically:
   * - Make a GET request to your configured baseURL + '/users'
   * - Cache the response
   * - Return typed data (if using TypeScript)
   * 
   * WHY '/users'?: 
   * - This is a RESTful convention (resource name in plural)
   * - Minder automatically constructs the full URL
   * - You configured the baseURL in demo.config.ts
   */
  const { data: users, loading, error } = useMinder('/users');

  /**
   * STEP 2: Handle loading state
   * 
   * WHY check loading first?
   * - Provides better UX with a loading indicator
   * - Prevents rendering undefined data
   * - Shows users that something is happening
   */
  if (loading) {
    return (
      <div className="example-card">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  /**
   * STEP 3: Handle error state
   * 
   * WHY check errors?
   * - Network requests can fail (offline, server errors, etc.)
   * - Users need to know what went wrong
   * - Provides opportunity to retry or show helpful message
   */
  if (error) {
    return (
      <div className="example-card">
        <div className="error-message">
          <span className="error-icon">❌</span>
          <p>Failed to load users: {error.message}</p>
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /**
   * STEP 4: Render your data
   * 
   * At this point:
   * - loading is false
   * - error is null
   * - data is populated and safe to use
   */
  return (
    <div className="example-card">
      <h2>👥 Users List</h2>
      <p className="explanation">
        This example shows the most basic usage of useMinder. 
        Just one hook call fetches, caches, and manages your data.
      </p>

      <div className="users-list">
        {users?.map((user: any) => (
          <div key={user.id} className="user-item">
            <div className="user-avatar">
              {user.name.charAt(0)}
            </div>
            <div className="user-info">
              <h3>{user.name}</h3>
              <p>{user.email}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Show what data looks like */}
      <details className="code-details">
        <summary>📊 View Raw Data</summary>
        <pre>{JSON.stringify(users?.slice(0, 2), null, 2)}</pre>
      </details>

      {/* Key Takeaways */}
      <div className="key-points">
        <h3>🎯 Key Takeaways</h3>
        <ul>
          <li>✅ One hook call handles everything</li>
          <li>✅ Automatic loading and error states</li>
          <li>✅ Data is cached automatically</li>
          <li>✅ Type-safe (with TypeScript)</li>
          <li>✅ No need to manage state yourself</li>
        </ul>
      </div>

      {/* What's Next */}
      <div className="next-steps">
        <h3>🚀 Next Steps</h3>
        <p>Now that you understand the basics, you can:</p>
        <ul>
          <li>Learn about query options (Example 2)</li>
          <li>Make POST/PUT/DELETE requests (Example 3)</li>
          <li>Add custom configurations (Example 4)</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * UNDER THE HOOD: What happens when you call useMinder?
 * 
 * 1. Component mounts → Hook registers the query
 * 2. Cache check → Looks for existing data
 * 3. If no cache → Makes HTTP request
 * 4. Response arrives → Updates state & cache
 * 5. Component re-renders → Shows data
 * 
 * PERFORMANCE NOTE:
 * If another component calls useMinder('/users'), it will use the cached
 * data instead of making a new request. This saves bandwidth and makes
 * your app feel instant.
 * 
 * COMMON MISTAKES TO AVOID:
 * 
 * ❌ DON'T: Forget to check loading/error states
 * ✅ DO: Always handle all three states (loading, error, success)
 * 
 * ❌ DON'T: Use wrong endpoint format (e.g., '/users/' with trailing slash)
 * ✅ DO: Use clean paths like '/users' or '/users/123'
 * 
 * ❌ DON'T: Call useMinder conditionally (breaks React rules)
 * ✅ DO: Call it at the top level of your component
 * 
 * WHEN TO USE THIS PATTERN:
 * - Simple GET requests
 * - Listing resources
 * - Displaying data
 * - No complex logic needed
 */

export default BasicUsageExample;
