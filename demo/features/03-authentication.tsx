import React, { useState, useEffect } from 'react';
import { useAuth, useCurrentUser } from '../../src/hooks/index.js';

// 🔐 COMPLETE AUTHENTICATION SYSTEM
// Demonstrates all authentication features with multiple storage strategies

export function AuthenticationExample() {
  // 🎣 Authentication hooks
  const auth = useAuth();                    // Core auth operations
  const currentUser = useCurrentUser();     // Current user information
  
  // 📝 Login form state
  const [loginForm, setLoginForm] = useState({
    email: 'admin@example.com',
    password: 'password123'
  });
  
  // 🔑 Token information state
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  
  // 📊 Authentication status monitoring
  useEffect(() => {
    const token = auth.getToken();
    if (token) {
      try {
        // Decode JWT token to show information
        const payload = JSON.parse(atob(token.split('.')[1] || ''));
        setTokenInfo({
          ...payload,
          isExpired: payload.exp ? payload.exp < Date.now() / 1000 : false,
          expiresIn: payload.exp ? Math.max(0, payload.exp - Date.now() / 1000) : null
        });
      } catch (error) {
        console.error('Failed to decode token:', error);
        setTokenInfo(null);
      }
    } else {
      setTokenInfo(null);
    }
  }, [auth.getToken()]);
  
  // 🔐 LOGIN - Simulate authentication with different user roles
  const handleLogin = (role: 'admin' | 'user' | 'guest' = 'user') => {
    // Create mock JWT token with user information
    const mockPayload = {
      sub: Math.random().toString(36).substr(2, 9),    // User ID
      email: loginForm.email,                          // User email
      name: role === 'admin' ? 'Admin User' : 'Regular User',
      role: role,                                      // User role
      permissions: role === 'admin' 
        ? ['read', 'write', 'delete', 'admin']         // Admin permissions
        : role === 'user' 
        ? ['read', 'write']                            // User permissions
        : ['read'],                                    // Guest permissions
      iat: Math.floor(Date.now() / 1000),             // Issued at
      exp: Math.floor(Date.now() / 1000) + 3600,      // Expires in 1 hour
      iss: 'minder-data-provider',                     // Issuer
      aud: 'demo-app'                                  // Audience
    };
    
    // Encode as JWT-like token (base64 encoded for demo)
    const mockToken = `header.${btoa(JSON.stringify(mockPayload))}.signature`;
    
    // Store token using configured storage strategy
    auth.setToken(mockToken);
    
    console.log('🔐 Login successful:', {
      role,
      permissions: mockPayload.permissions,
      expiresAt: new Date(mockPayload.exp * 1000).toLocaleString()
    });
  };
  
  // 🚪 LOGOUT - Clear authentication
  const handleLogout = () => {
    auth.clearAuth();
    setTokenInfo(null);
    console.log('🚪 Logged out successfully');
  };
  
  // 🔄 REFRESH TOKEN - Simulate token refresh
  const handleRefreshToken = () => {
    if (!tokenInfo) return;
    
    // Create new token with extended expiration
    const refreshedPayload = {
      ...tokenInfo,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600  // Extend by 1 hour
    };
    
    const refreshedToken = `header.${btoa(JSON.stringify(refreshedPayload))}.signature`;
    auth.setToken(refreshedToken);
    
    console.log('🔄 Token refreshed successfully');
  };
  
  // 🔑 SET REFRESH TOKEN - For apps using refresh tokens
  const handleSetRefreshToken = () => {
    const refreshToken = 'refresh_' + Math.random().toString(36).substr(2, 20);
    auth.setRefreshToken(refreshToken);
    console.log('🔑 Refresh token set:', refreshToken);
  };
  
  // 📱 STORAGE STRATEGY DEMO
  const demonstrateStorageStrategies = () => {
    console.log('📱 Storage Strategy Comparison:');
    console.log('localStorage: Persistent across browser sessions');
    console.log('sessionStorage: Cleared when tab closes');
    console.log('memory: Lost on page refresh');
    console.log('cookie: Secure, HTTP-only option');
  };
  
  return (
    <div className="authentication-example">
      <h2>🔐 Complete Authentication System</h2>
      
      {/* 📊 AUTHENTICATION STATUS */}
      <div className="auth-status-panel">
        <h3>📊 Authentication Status</h3>
        <div className="status-grid">
          <div className="status-item">
            <strong>Authenticated:</strong> 
            <span className={currentUser.isLoggedIn ? 'status-success' : 'status-error'}>
              {currentUser.isLoggedIn ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div className="status-item">
            <strong>Token Present:</strong> 
            <span className={auth.getToken() ? 'status-success' : 'status-error'}>
              {auth.getToken() ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div className="status-item">
            <strong>Refresh Token:</strong> 
            <span className={auth.getRefreshToken() ? 'status-success' : 'status-warning'}>
              {auth.getRefreshToken() ? '✅ Present' : '⚠️ None'}
            </span>
          </div>
        </div>
      </div>
      
      {/* 👤 CURRENT USER INFORMATION */}
      {currentUser.isLoggedIn && (
        <div className="user-info-panel">
          <h3>👤 Current User Information</h3>
          <div className="user-details">
            <p><strong>Name:</strong> {currentUser.user?.name || 'Unknown'}</p>
            <p><strong>Email:</strong> {currentUser.user?.email || 'Unknown'}</p>
            <p><strong>Role:</strong> {currentUser.user?.role || 'Unknown'}</p>
            <p><strong>User ID:</strong> {currentUser.user?.sub || 'Unknown'}</p>
            
            {/* Permission checks */}
            <div className="permissions">
              <h4>🔒 Permissions</h4>
              <div className="permission-grid">
                <span className={currentUser.hasPermission('read') ? 'perm-granted' : 'perm-denied'}>
                  📖 Read: {currentUser.hasPermission('read') ? '✅' : '❌'}
                </span>
                <span className={currentUser.hasPermission('write') ? 'perm-granted' : 'perm-denied'}>
                  ✏️ Write: {currentUser.hasPermission('write') ? '✅' : '❌'}
                </span>
                <span className={currentUser.hasPermission('delete') ? 'perm-granted' : 'perm-denied'}>
                  🗑️ Delete: {currentUser.hasPermission('delete') ? '✅' : '❌'}
                </span>
                <span className={currentUser.hasPermission('admin') ? 'perm-granted' : 'perm-denied'}>
                  👑 Admin: {currentUser.hasPermission('admin') ? '✅' : '❌'}
                </span>
              </div>
            </div>
            
            {/* Role checks */}
            <div className="roles">
              <h4>👥 Role Checks</h4>
              <p>Is Admin: {currentUser.hasRole('admin') ? '✅ Yes' : '❌ No'}</p>
              <p>Is User: {currentUser.hasRole('user') ? '✅ Yes' : '❌ No'}</p>
              <p>Is Guest: {currentUser.hasRole('guest') ? '✅ Yes' : '❌ No'}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 🔑 TOKEN INFORMATION */}
      {tokenInfo && (
        <div className="token-info-panel">
          <h3>🔑 Token Information</h3>
          <div className="token-details">
            <p><strong>Issuer:</strong> {tokenInfo.iss}</p>
            <p><strong>Audience:</strong> {tokenInfo.aud}</p>
            <p><strong>Issued At:</strong> {new Date(tokenInfo.iat * 1000).toLocaleString()}</p>
            <p><strong>Expires At:</strong> {new Date(tokenInfo.exp * 1000).toLocaleString()}</p>
            <p><strong>Time Until Expiry:</strong> {
              tokenInfo.expiresIn 
                ? `${Math.floor(tokenInfo.expiresIn / 60)}m ${Math.floor(tokenInfo.expiresIn % 60)}s`
                : 'Expired'
            }</p>
            <p><strong>Status:</strong> 
              <span className={tokenInfo.isExpired ? 'status-error' : 'status-success'}>
                {tokenInfo.isExpired ? '❌ Expired' : '✅ Valid'}
              </span>
            </p>
          </div>
        </div>
      )}
      
      {/* 📝 LOGIN FORM */}
      {!currentUser.isLoggedIn && (
        <div className="login-form-panel">
          <h3>📝 Login Form</h3>
          <div className="login-form">
            <input
              type="email"
              placeholder="Email"
              value={loginForm.email}
              onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
            />
            
            <div className="login-buttons">
              <button onClick={() => handleLogin('admin')} className="btn-admin">
                👑 Login as Admin
              </button>
              <button onClick={() => handleLogin('user')} className="btn-user">
                👤 Login as User
              </button>
              <button onClick={() => handleLogin('guest')} className="btn-guest">
                👥 Login as Guest
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 🎛️ AUTHENTICATION OPERATIONS */}
      <div className="auth-operations-panel">
        <h3>🎛️ Authentication Operations</h3>
        <div className="operation-buttons">
          {currentUser.isLoggedIn ? (
            <>
              <button onClick={handleLogout} className="btn-logout">
                🚪 Logout
              </button>
              <button onClick={handleRefreshToken} className="btn-refresh">
                🔄 Refresh Token
              </button>
              <button onClick={handleSetRefreshToken} className="btn-refresh-token">
                🔑 Set Refresh Token
              </button>
            </>
          ) : (
            <p>Please login to see authentication operations</p>
          )}
          
          <button onClick={demonstrateStorageStrategies} className="btn-demo">
            📱 Demo Storage Strategies
          </button>
        </div>
      </div>
      
      {/* 🔒 PROTECTED CONTENT EXAMPLE */}
      <div className="protected-content-panel">
        <h3>🔒 Protected Content Examples</h3>
        
        {/* Content based on authentication */}
        {!currentUser.isLoggedIn && (
          <div className="access-denied">
            ❌ Please login to access protected content
          </div>
        )}
        
        {/* Content based on permissions */}
        {currentUser.hasPermission('read') && (
          <div className="protected-content">
            📖 <strong>Read Permission:</strong> You can view this content
          </div>
        )}
        
        {currentUser.hasPermission('write') && (
          <div className="protected-content">
            ✏️ <strong>Write Permission:</strong> You can edit content
          </div>
        )}
        
        {currentUser.hasPermission('delete') && (
          <div className="protected-content">
            🗑️ <strong>Delete Permission:</strong> You can delete content
          </div>
        )}
        
        {currentUser.hasPermission('admin') && (
          <div className="protected-content admin-content">
            👑 <strong>Admin Access:</strong> You have full administrative privileges
          </div>
        )}
        
        {/* Content based on roles */}
        {currentUser.hasRole('admin') && (
          <div className="role-content admin-role">
            🛡️ <strong>Admin Role:</strong> Access to admin dashboard
          </div>
        )}
      </div>
      
      {/* 📚 AUTHENTICATION FEATURES */}
      <div className="feature-explanation">
        <h3>📚 Authentication Features</h3>
        <ul>
          <li><strong>🎣 useAuth():</strong> Core authentication operations (login, logout, token management)</li>
          <li><strong>👤 useCurrentUser():</strong> Current user information with role/permission checks</li>
          <li><strong>🔑 Token Management:</strong> JWT token storage with multiple strategies</li>
          <li><strong>🔄 Token Refresh:</strong> Automatic or manual token refresh capabilities</li>
          <li><strong>📱 Storage Options:</strong> localStorage, sessionStorage, memory, or cookie storage</li>
          <li><strong>🔒 Permission System:</strong> Granular permission checks for UI components</li>
          <li><strong>👥 Role-Based Access:</strong> Role-based content rendering and access control</li>
          <li><strong>⏰ Token Expiry:</strong> Automatic token expiration detection and handling</li>
          <li><strong>🛡️ Security:</strong> Secure token handling with configurable storage strategies</li>
        </ul>
      </div>
    </div>
  );
}