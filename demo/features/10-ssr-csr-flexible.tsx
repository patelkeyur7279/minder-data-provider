import React from 'react';
import { useOneTouchCrud } from '../../src/index.js';
import { withSSR, withCSR, prefetchData } from '../../src/ssr/index.js';

// SSR Component - Pre-rendered on server
export function SSRUserList({ initialData }: { initialData?: any[] }) {
  const { data: users, loading } = useOneTouchCrud('users');
  
  // Use initial data if available, otherwise show loading
  const displayUsers = initialData || users;
  
  return (
    <div className="ssr-component">
      <h3>🌐 SSR User List (SEO Optimized)</h3>
      {loading.fetch && !initialData ? (
        <div>Loading users...</div>
      ) : (
        <ul>
          {displayUsers?.slice(0, 5).map((user: any) => (
            <li key={user.id}>{user.name} - {user.email}</li>
          ))}
        </ul>
      )}
      <p className="render-info">
        ✅ Rendered on server, indexed by search engines
      </p>
    </div>
  );
}

// CSR Component - Client-side only
export function CSRUserProfile() {
  const { data: users, loading, operations } = useOneTouchCrud('users');
  
  const handleUpdate = async () => {
    if (users?.[0]) {
      await operations.update(users[0].id, { 
        name: users[0].name + ' (Updated)' 
      });
    }
  };
  
  return (
    <div className="csr-component">
      <h3>⚡ CSR User Profile (Interactive)</h3>
      {loading.fetch ? (
        <div>Loading profile...</div>
      ) : users?.[0] ? (
        <div>
          <p><strong>Name:</strong> {users[0].name}</p>
          <p><strong>Email:</strong> {users[0].email}</p>
          <button onClick={handleUpdate} disabled={loading.update}>
            {loading.update ? 'Updating...' : 'Update Profile'}
          </button>
        </div>
      ) : (
        <p>No user data available</p>
      )}
      <p className="render-info">
        ⚡ Client-side rendered, interactive features
      </p>
    </div>
  );
}

export function SSRCSRFlexibleDemo() {
  return (
    <div className="demo-section">
      <h2>🔄 SSR/CSR Flexible Support</h2>
      <p>Choose rendering strategy per component for optimal performance:</p>

      <div className="rendering-strategies">
        <div className="strategy-comparison">
          <div className="ssr-section">
            <h3>Server-Side Rendering (SSR)</h3>
            <ul>
              <li>✅ SEO optimized</li>
              <li>✅ Fast initial load</li>
              <li>✅ Social media sharing</li>
              <li>⚠️ Less interactive</li>
            </ul>
          </div>
          
          <div className="csr-section">
            <h3>Client-Side Rendering (CSR)</h3>
            <ul>
              <li>✅ Highly interactive</li>
              <li>✅ Real-time updates</li>
              <li>✅ Optimistic UI</li>
              <li>⚠️ SEO challenges</li>
            </ul>
          </div>
        </div>

        <div className="implementation-examples">
          <h3>Implementation Examples:</h3>
          
          <div className="code-block">
            <h4>SSR Configuration:</h4>
            <pre>{`// pages/users.tsx
export async function getServerSideProps() {
  const config = createMinderConfig({...});
  const data = await prefetchData(config, ['users']);
  
  return { props: { initialData: data } };
}

// Component with SSR
const users = withSSR('users', fallbackData);`}</pre>
          </div>

          <div className="code-block">
            <h4>CSR Configuration:</h4>
            <pre>{`// Interactive component
const profile = withCSR('userProfile');

// Real-time updates
const { data, operations } = useOneTouchCrud('users');`}</pre>
          </div>
        </div>

        <div className="live-examples">
          <SSRUserList />
          <CSRUserProfile />
        </div>

        <div className="best-practices">
          <h3>Best Practices:</h3>
          <ul>
            <li>🎯 Use SSR for public pages (landing, blog, product listings)</li>
            <li>⚡ Use CSR for authenticated areas (dashboards, profiles)</li>
            <li>🔄 Combine both: SSR for initial load + CSR for interactions</li>
            <li>📊 Monitor Core Web Vitals for performance optimization</li>
          </ul>
        </div>
      </div>
    </div>
  );
}