import React, { useState } from "react";
import { useEnvironment, useProxy } from "minder-data-provider";

// 🌍 SINGLE CONFIG WITH ENVIRONMENTS
export const singleConfig = {
  apiBaseUrl: "https://jsonplaceholder.typicode.com",
  routes: {
    users: { method: "GET", url: "/users" },
    createUser: { method: "POST", url: "/users" },
  },
  defaultEnvironment: "development",
  autoDetectEnvironment: true,
  environments: {
    development: {
      name: "Development",
      apiBaseUrl: "http://localhost:8080/api",
      cors: {
        enabled: true,
        proxy: "/api/minder-proxy", // Next.js proxy route
        credentials: true,
        origin: "http://localhost:3000",
      },
      auth: {
        tokenKey: "dev_token",
        storage: "localStorage",
      },
      cache: {
        staleTime: 1 * 60 * 1000, // 1 minute for dev
        gcTime: 2 * 60 * 1000, // 2 minutes for dev
      },
      debug: true,
    },

    staging: {
      name: "Staging",
      apiBaseUrl: "https://staging-api.example.com",
      cors: {
        enabled: true,
        proxy: "/api/minder-proxy",
        credentials: true,
        origin: ["https://staging.example.com", "https://dev.example.com"],
      },
      auth: {
        tokenKey: "staging_token",
        storage: "sessionStorage",
      },
      cache: {
        staleTime: 3 * 60 * 1000, // 3 minutes for staging
        gcTime: 5 * 60 * 1000, // 5 minutes for staging
      },
      debug: true,
    },

    production: {
      name: "Production",
      apiBaseUrl: "https://api.example.com",
      cors: {
        enabled: false, // Same domain in production
        credentials: true,
        origin: "https://example.com",
      },
      auth: {
        tokenKey: "prod_token",
        storage: "cookie", // Secure cookies in production
      },
      cache: {
        staleTime: 10 * 60 * 1000, // 10 minutes for production
        gcTime: 30 * 60 * 1000, // 30 minutes for production
      },
      debug: false,
    },

    test: {
      name: "Testing",
      apiBaseUrl: "http://localhost:3001/mock-api",
      cors: {
        enabled: true,
        proxy: "/api/minder-proxy",
        credentials: false,
      },
      auth: {
        tokenKey: "test_token",
        storage: "memory", // Memory storage for tests
      },
      cache: {
        staleTime: 0, // No caching in tests
        gcTime: 0,
      },
      debug: true,
    },
  },
};

// 🌍 ENVIRONMENT MANAGEMENT COMPONENT
export function EnvironmentManagementExample() {
  const env = useEnvironment();
  const proxy = useProxy();
  const [selectedEnv, setSelectedEnv] = useState(env.currentEnvironment);

  // 🔄 Switch environment
  const handleEnvironmentSwitch = (newEnv: string) => {
    try {
      env.setEnvironment(newEnv);
      setSelectedEnv(newEnv);
      console.log(`🌍 Switched to ${newEnv} environment`);

      // Show reload prompt for environment changes
      if (
        confirm(
          `Environment switched to ${newEnv}. Reload page to apply changes?`
        )
      ) {
        window.location.reload();
      }
    } catch (error) {
      console.error("❌ Failed to switch environment:", error);
      alert(`Failed to switch to ${newEnv}: ${error}`);
    }
  };

  // 📋 Get environment details
  const envConfig = env.getEnvironmentConfig();
  const allEnvironments = env.getAllEnvironments();

  // 🔧 Generate proxy code
  const generateProxyCode = () => {
    if (!proxy.isEnabled()) {
      alert("Proxy is not enabled for current environment");
      return;
    }

    const proxyCode = proxy.generateNextJSProxy();
    navigator.clipboard.writeText(proxyCode);
    alert(
      "Proxy code copied to clipboard! Create pages/api/minder-proxy/[...path].js"
    );
  };

  return (
    <div className='environment-management'>
      <h2>🌍 Environment Management</h2>

      {/* 📊 CURRENT ENVIRONMENT STATUS */}
      <div className='env-status-panel'>
        <h3>📊 Current Environment Status</h3>
        <div className='status-grid'>
          <div className='status-item'>
            <strong>Environment:</strong>
            <span className={`env-badge ${env.currentEnvironment}`}>
              {env.currentEnvironment.toUpperCase()}
            </span>
          </div>
          <div className='status-item'>
            <strong>Mode:</strong>
            <span
              className={
                env.isProduction() ? "status-production" : "status-development"
              }>
              {env.isProduction() ? "🚀 Production" : "🔧 Development"}
            </span>
          </div>
          <div className='status-item'>
            <strong>Debug:</strong>
            <span
              className={
                env.getDebugMode() ? "status-debug-on" : "status-debug-off"
              }>
              {env.getDebugMode() ? "🐛 Enabled" : "🔒 Disabled"}
            </span>
          </div>
          <div className='status-item'>
            <strong>Proxy:</strong>
            <span
              className={
                proxy.isEnabled() ? "status-proxy-on" : "status-proxy-off"
              }>
              {proxy.isEnabled() ? "🔄 Enabled" : "❌ Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* 🎛️ ENVIRONMENT SWITCHER */}
      <div className='env-switcher-panel'>
        <h3>🎛️ Environment Switcher</h3>
        <div className='env-buttons'>
          {allEnvironments.map((envName) => (
            <button
              key={envName}
              onClick={() => handleEnvironmentSwitch(envName)}
              className={`env-button ${envName} ${
                selectedEnv === envName ? "active" : ""
              }`}
              disabled={selectedEnv === envName}>
              <span className='env-icon'>
                {envName === "development"
                  ? "🔧"
                  : envName === "staging"
                  ? "🚧"
                  : envName === "production"
                  ? "🚀"
                  : envName === "test"
                  ? "🧪"
                  : "🌍"}
              </span>
              <div className='env-details'>
                <div className='env-name'>
                  {envName.charAt(0).toUpperCase() + envName.slice(1)}
                </div>
                <div className='env-description'>
                  {(singleConfig.environments as any)[envName]?.name || envName}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ⚙️ CURRENT ENVIRONMENT CONFIG */}
      {envConfig && (
        <div className='env-config-panel'>
          <h3>⚙️ Current Environment Configuration</h3>
          <div className='config-grid'>
            <div className='config-section'>
              <h4>🌐 API Configuration</h4>
              <div className='config-item'>
                <strong>Base URL:</strong>
                <code>{envConfig.apiBaseUrl}</code>
              </div>
              <div className='config-item'>
                <strong>CORS Enabled:</strong>
                <span
                  className={
                    envConfig.cors?.enabled ? "status-success" : "status-error"
                  }>
                  {envConfig.cors?.enabled ? "✅ Yes" : "❌ No"}
                </span>
              </div>
              {envConfig.cors?.proxy && (
                <div className='config-item'>
                  <strong>Proxy Route:</strong>
                  <code>{envConfig.cors.proxy}</code>
                </div>
              )}
            </div>

            <div className='config-section'>
              <h4>🔐 Authentication</h4>
              <div className='config-item'>
                <strong>Token Key:</strong>
                <code>{envConfig.auth?.tokenKey || "default"}</code>
              </div>
              <div className='config-item'>
                <strong>Storage:</strong>
                <code>{envConfig.auth?.storage || "localStorage"}</code>
              </div>
            </div>

            <div className='config-section'>
              <h4>💾 Caching</h4>
              <div className='config-item'>
                <strong>Stale Time:</strong>
                <code>{(envConfig.cache?.staleTime || 0) / 1000}s</code>
              </div>
              <div className='config-item'>
                <strong>GC Time:</strong>
                <code>{(envConfig.cache?.gcTime || 0) / 1000}s</code>
              </div>
            </div>

            <div className='config-section'>
              <h4>🔧 Development</h4>
              <div className='config-item'>
                <strong>Debug Mode:</strong>
                <span
                  className={
                    envConfig.debug ? "status-success" : "status-error"
                  }>
                  {envConfig.debug ? "✅ Enabled" : "❌ Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔄 CORS PROXY SETUP */}
      <div className='proxy-setup-panel'>
        <h3>🔄 CORS Proxy Setup</h3>
        <p>Generate Next.js API route to handle CORS issues automatically</p>

        <div className='proxy-info'>
          <div className='proxy-status'>
            <strong>Proxy Status:</strong>
            <span
              className={
                proxy.isEnabled() ? "status-success" : "status-warning"
              }>
              {proxy.isEnabled() ? "✅ Enabled" : "⚠️ Disabled"}
            </span>
          </div>

          {proxy.isEnabled() && (
            <div className='proxy-details'>
              <p>
                <strong>How it works:</strong>
              </p>
              <ol>
                <li>
                  Your app calls <code>/api/minder-proxy/users</code>
                </li>
                <li>
                  Next.js proxy forwards to{" "}
                  <code>{envConfig?.apiBaseUrl}/users</code>
                </li>
                <li>No CORS issues because it's server-to-server</li>
              </ol>
            </div>
          )}
        </div>

        <div className='proxy-actions'>
          <button
            onClick={generateProxyCode}
            disabled={!proxy.isEnabled()}
            className='btn-generate-proxy'>
            📋 Generate Proxy Code
          </button>

          {proxy.isEnabled() && (
            <div className='proxy-instructions'>
              <h4>📝 Setup Instructions:</h4>
              <ol>
                <li>
                  Create <code>pages/api/minder-proxy/[...path].js</code>
                </li>
                <li>Paste the generated code</li>
                <li>Restart your Next.js server</li>
                <li>All API calls will be CORS-free!</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* 📚 ENVIRONMENT FEATURES */}
      <div className='feature-explanation'>
        <h3>📚 Environment Management Features</h3>
        <ul>
          <li>
            <strong>🌍 Multi-Environment:</strong> Different configs for dev,
            staging, production
          </li>
          <li>
            <strong>🔄 Auto-Detection:</strong> Automatically detect environment
            based on URL/NODE_ENV
          </li>
          <li>
            <strong>🎛️ Runtime Switching:</strong> Switch environments without
            code changes
          </li>
          <li>
            <strong>🔒 Secure Configs:</strong> Different auth strategies per
            environment
          </li>
          <li>
            <strong>💾 Environment Caching:</strong> Optimized cache settings
            per environment
          </li>
          <li>
            <strong>🔄 CORS Proxy:</strong> Automatic proxy generation for CORS
            issues
          </li>
          <li>
            <strong>🐛 Debug Mode:</strong> Environment-specific debugging
          </li>
          <li>
            <strong>⚙️ Config Override:</strong> Override any setting per
            environment
          </li>
        </ul>
      </div>

      {/* 🎯 ENVIRONMENT STRATEGIES */}
      <div className='strategies-panel'>
        <h3>🎯 Environment Strategies</h3>
        <div className='strategies-grid'>
          <div className='strategy-item'>
            <h4>🔧 Development</h4>
            <ul>
              <li>Short cache times for fresh data</li>
              <li>Debug mode enabled</li>
              <li>CORS proxy for external APIs</li>
              <li>localStorage for quick testing</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>🚧 Staging</h4>
            <ul>
              <li>Production-like settings</li>
              <li>sessionStorage for testing</li>
              <li>Moderate cache times</li>
              <li>Debug enabled for troubleshooting</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>🚀 Production</h4>
            <ul>
              <li>Long cache times for performance</li>
              <li>Secure cookie storage</li>
              <li>Debug disabled</li>
              <li>Same-domain (no CORS proxy)</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>🧪 Testing</h4>
            <ul>
              <li>No caching for predictable tests</li>
              <li>Memory storage (clean slate)</li>
              <li>Mock API endpoints</li>
              <li>Debug enabled for test failures</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
