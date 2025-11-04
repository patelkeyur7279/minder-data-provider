/**
 * Example 4: Authentication
 * 
 * Learn how to handle user authentication with Minder:
 * - Login/Logout
 * - Protected routes
 * - Token management
 * - Auth state persistence
 * 
 * WHY: Most apps need authentication to protect user data
 * and personalize the experience.
 */

import React, { useState } from 'react';
import { useMinder } from '../../src';

/**
 * CONCEPT: Authentication Flow
 * 
 * 1. User enters credentials
 * 2. Send POST to /login endpoint
 * 3. Server returns token
 * 4. Store token in localStorage
 * 5. Include token in all future requests
 * 6. On logout, remove token
 */

interface LoginCredentials {
  username: string;
  password: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

export function AuthenticationExample() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem('auth_token')
  );

  /**
   * STEP 1: Login
   * 
   * WHY use POST?
   * - Credentials should never be in URL
   * - POST is more secure than GET
   * - Can send data in request body
   */
  const login = useMinder<AuthResponse>('/auth/login', {
    method: 'POST',
    autoFetch: false, // Don't auto-fetch on mount
  });

  /**
   * STEP 2: Get Current User
   * 
   * WHY check isLoggedIn?
   * - Only fetch if user is authenticated
   * - Prevents unnecessary 401 errors
   * - Conditional data fetching
   */
  const { data: currentUser, loading: loadingUser } = useMinder<User>(
    '/auth/me',
    {
      enabled: isLoggedIn, // Only fetch if logged in
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    }
  );

  /**
   * STEP 3: Logout
   * 
   * WHY clear everything?
   * - Remove token from storage
   * - Clear user state
   * - Prevent unauthorized access
   */
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setIsLoggedIn(false);
    alert('👋 Logged out successfully!');
  };

  /**
   * STEP 4: Handle Login Submit
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!username || !password) {
      alert('Please enter both username and password');
      return;
    }

    try {
      const result = await login.mutate({
        username,
        password,
      });

      if (result.success && result.data) {
        /**
         * On successful login:
         * 1. Store the token
         * 2. Update logged-in state
         * 3. Clear form
         * 4. Show success message
         */
        localStorage.setItem('auth_token', result.data.token);
        setIsLoggedIn(true);
        setUsername('');
        setPassword('');
        alert(`✅ Welcome back, ${result.data.user.name}!`);
      } else {
        alert(`❌ Login failed: ${result.error?.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div className="example-card">
      <h2>🔐 Authentication</h2>
      <p className="explanation">
        This example demonstrates user authentication with login, logout,
        and protected data access.
      </p>

      {!isLoggedIn ? (
        /* LOGIN FORM */
        <div className="login-section">
          <h3>🔓 Login</h3>
          
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username..."
                disabled={login.loading}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                disabled={login.loading}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={login.loading}
            >
              {login.loading ? '⏳ Logging in...' : '🔓 Login'}
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="demo-info">
            <h4>📝 Demo Credentials</h4>
            <p>For testing, use any username and password (this is a demo)</p>
            <code>
              Username: demo
              <br />
              Password: password123
            </code>
          </div>
        </div>
      ) : (
        /* LOGGED IN VIEW */
        <div className="logged-in-section">
          <h3>👤 User Profile</h3>
          
          {loadingUser ? (
            <div className="loading">⏳ Loading user data...</div>
          ) : currentUser ? (
            <div className="user-card">
              <div className="user-avatar">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <h4>{currentUser.name}</h4>
                <p className="user-email">{currentUser.email}</p>
                <p className="user-username">@{currentUser.username}</p>
              </div>
            </div>
          ) : (
            <div className="error">Failed to load user data</div>
          )}

          <button
            onClick={handleLogout}
            className="btn-secondary"
          >
            🔒 Logout
          </button>
        </div>
      )}

      {/* How It Works */}
      <div className="auth-guide">
        <h3>🔍 How Authentication Works</h3>

        <div className="auth-step">
          <h4>1️⃣ Login Flow</h4>
          <pre>{`const login = useMinder('/auth/login', {
  method: 'POST',
  autoFetch: false
});

const result = await login.mutate({
  username: 'user',
  password: 'pass'
});

if (result.success) {
  localStorage.setItem('token', result.data.token);
  setIsLoggedIn(true);
}`}</pre>
        </div>

        <div className="auth-step">
          <h4>2️⃣ Authenticated Requests</h4>
          <pre>{`const { data } = useMinder('/auth/me', {
  enabled: isLoggedIn,
  headers: {
    Authorization: \`Bearer \${token}\`
  }
});`}</pre>
        </div>

        <div className="auth-step">
          <h4>3️⃣ Logout Flow</h4>
          <pre>{`const handleLogout = () => {
  localStorage.removeItem('token');
  setIsLoggedIn(false);
  // Optional: Call logout endpoint
};`}</pre>
        </div>
      </div>

      {/* Security Best Practices */}
      <div className="security-tips">
        <h3>🛡️ Security Best Practices</h3>
        <ul>
          <li>
            <strong>✅ Use HTTPS:</strong> Always transmit credentials over HTTPS
          </li>
          <li>
            <strong>✅ Secure Storage:</strong> Store tokens in httpOnly cookies when possible
          </li>
          <li>
            <strong>✅ Token Expiry:</strong> Implement token refresh mechanism
          </li>
          <li>
            <strong>✅ Input Validation:</strong> Validate credentials on both client and server
          </li>
          <li>
            <strong>✅ Rate Limiting:</strong> Prevent brute force attacks
          </li>
          <li>
            <strong>✅ CSRF Protection:</strong> Use CSRF tokens for state-changing operations
          </li>
        </ul>
      </div>

      {/* Common Patterns */}
      <div className="auth-patterns">
        <h3>📋 Common Auth Patterns</h3>

        <div className="pattern">
          <h4>🔄 Token Refresh</h4>
          <pre>{`// Check token expiry
if (isTokenExpired(token)) {
  const newToken = await refreshToken();
  localStorage.setItem('token', newToken);
}`}</pre>
        </div>

        <div className="pattern">
          <h4>🚪 Protected Routes</h4>
          <pre>{`function ProtectedRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('token');
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return children;
}`}</pre>
        </div>

        <div className="pattern">
          <h4>⏱️ Auto Logout on Inactivity</h4>
          <pre>{`useEffect(() => {
  const timeout = setTimeout(() => {
    handleLogout();
  }, 30 * 60 * 1000); // 30 minutes
  
  return () => clearTimeout(timeout);
}, [lastActivity]);`}</pre>
        </div>
      </div>
    </div>
  );
}

export default AuthenticationExample;
