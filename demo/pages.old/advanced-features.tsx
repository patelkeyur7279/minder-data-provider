import React, { useState, useEffect } from 'react';
import { 
  QueryBuilder, 
  PaginationHelper,
  PluginManager, 
  LoggerPlugin, 
  RetryPlugin, 
  AnalyticsPlugin
} from '../../src';
import { MockDevTools, mockDevToolsEvents } from '../components/MockDevTools';

// Sample data for testing
const SAMPLE_USERS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: i % 3 === 0 ? 'admin' : i % 2 === 0 ? 'editor' : 'viewer',
  age: 20 + (i % 50),
  status: i % 2 === 0 ? 'active' : 'inactive',
  createdAt: new Date(2024, 0, i + 1).toISOString(),
}));

export default function AdvancedFeaturesDemo() {
  const [activeTab, setActiveTab] = useState<'query' | 'plugins' | 'devtools'>('query');
  const [filteredUsers, setFilteredUsers] = useState(SAMPLE_USERS);
  const [pluginLogs, setPluginLogs] = useState<string[]>([]);
  const [showDevTools, setShowDevTools] = useState(false);

  // Query Builder Demo
  const [queryUrl, setQueryUrl] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [minAge, setMinAge] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination Demo
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const pagination = PaginationHelper.calculateState(currentPage, filteredUsers.length, itemsPerPage);
  
  const nextPage = () => {
    if (pagination.hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  };
  
  const previousPage = () => {
    if (pagination.hasPreviousPage) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // Plugin Manager Demo
  const [pluginManager] = useState(() => new PluginManager());

  useEffect(() => {
    // Initialize plugins
    const setupPlugins = async () => {
      // Custom logger that captures output
      const customLogger = {
        ...LoggerPlugin,
        onRequest: async (config: any) => {
          const log = `🚀 Request: ${config.method || 'GET'} ${config.url}`;
          setPluginLogs(prev => [...prev.slice(-9), log]);
          
          // Emit to DevTools
          mockDevToolsEvents.emit('network:request', {
            id: Date.now().toString(),
            method: config.method || 'GET',
            url: config.url,
            status: 0,
            duration: 0,
            timestamp: Date.now(),
          });
          
          return config;
        },
        onResponse: async (response: any) => {
          const log = `✅ Response: ${response.status || 200} ${response.statusText || 'OK'}`;
          setPluginLogs(prev => [...prev.slice(-9), log]);
          return response;
        },
        onError: async (error: any) => {
          const log = `❌ Error: ${error.message}`;
          setPluginLogs(prev => [...prev.slice(-9), log]);
          throw error;
        },
      };

      pluginManager.register(customLogger);
      pluginManager.register(RetryPlugin);
      pluginManager.register(AnalyticsPlugin);

      await pluginManager.init({});
      addLog('🔌 Plugins initialized');
    };

    setupPlugins();
  }, []);

  const addLog = (log: string) => {
    setPluginLogs(prev => [...prev.slice(-9), log]);
  };

  // Query Builder Functions
  const buildQuery = () => {
    const qb = new QueryBuilder('/api/users');

    if (selectedRole !== 'all') {
      qb.where('role', selectedRole);
    }

    if (minAge > 0) {
      qb.whereGreaterThanOrEqual('age', minAge);
    }

    if (searchTerm) {
      qb.search(searchTerm);
    }

    if (sortField) {
      if (sortOrder === 'desc') {
        qb.sortByDesc(sortField);
      } else {
        qb.sortBy(sortField);
      }
    }

    qb.page(pagination.currentPage).limit(itemsPerPage);

    const url = qb.build();
    setQueryUrl(url);

    // Filter data locally for demo
    let filtered = SAMPLE_USERS.filter(user => {
      if (selectedRole !== 'all' && user.role !== selectedRole) return false;
      if (minAge > 0 && user.age < minAge) return false;
      if (searchTerm && !user.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !user.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a];
      const bVal = b[sortField as keyof typeof b];
      if (sortOrder === 'desc') {
        return aVal > bVal ? -1 : 1;
      }
      return aVal > bVal ? 1 : -1;
    });

    setFilteredUsers(filtered);
    addLog(`🔍 Query built: ${url}`);
    
    // Emit network request event for DevTools
    mockDevToolsEvents.emit('network:request', {
      id: Date.now().toString(),
      method: 'GET',
      url,
      status: 200,
      duration: 45,
      timestamp: Date.now(),
    });
  };

  const testPluginExecution = async () => {
    try {
      const mockConfig = {
        method: 'POST',
        url: '/api/test',
        data: { test: true },
        timestamp: Date.now(),
      };

      addLog('🔌 Executing plugin lifecycle...');
      await pluginManager.executeRequestHooks(mockConfig);
      addLog('✅ Plugin execution successful');
      
      // Emit network request event for DevTools
      mockDevToolsEvents.emit('network:request', {
        id: Date.now().toString(),
        method: 'POST',
        url: '/api/test',
        status: 200,
        duration: 120,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      addLog(`❌ Plugin error: ${error.message}`);
    }
  };

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>🚀 Advanced Features Demo</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Test QueryBuilder, Plugin System, and DevTools in action
      </p>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '30px',
        borderBottom: '2px solid #e0e0e0',
        paddingBottom: '10px'
      }}>
        {(['query', 'plugins', 'devtools'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === tab ? '#0070f3' : '#f0f0f0',
              color: activeTab === tab ? 'white' : '#333',
              cursor: 'pointer',
              borderRadius: '5px',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'query' && '🔍'} {tab === 'plugins' && '🔌'} {tab === 'devtools' && '🛠️'} {tab}
          </button>
        ))}
      </div>

      {/* Query Builder Tab */}
      {activeTab === 'query' && (
        <div>
          <h2>🔍 Query Builder Demo</h2>
          
          {/* Query Controls */}
          <div style={{
            background: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Role Filter:</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Min Age:</label>
                <input
                  type="number"
                  value={minAge}
                  onChange={(e) => setMinAge(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Search:</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name or email..."
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sort By:</label>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="age">Age</option>
                  <option value="role">Role</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sort Order:</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={buildQuery}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#0070f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  🔍 Build Query
                </button>
              </div>
            </div>
          </div>

          {/* Generated URL */}
          {queryUrl && (
            <div style={{ 
              background: '#1e1e1e', 
              color: '#d4d4d4', 
              padding: '15px', 
              borderRadius: '8px',
              marginBottom: '20px',
              fontFamily: 'monospace',
              fontSize: '14px',
              overflow: 'auto'
            }}>
              <strong style={{ color: '#4EC9B0' }}>Generated URL:</strong>
              <pre style={{ margin: '10px 0 0 0', color: '#CE9178' }}>{queryUrl}</pre>
            </div>
          )}

          {/* Results */}
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: 0 }}>
                Results: {filteredUsers.length} users found
              </h3>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f5f5f5' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Email</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Role</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Age</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px' }}>{user.id}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{user.name}</td>
                      <td style={{ padding: '12px', color: '#666' }}>{user.email}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          background: user.role === 'admin' ? '#fee' : user.role === 'editor' ? '#efe' : '#eef',
                          color: user.role === 'admin' ? '#c00' : user.role === 'editor' ? '#0c0' : '#00c',
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>{user.age}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          background: user.status === 'active' ? '#d4edda' : '#f8d7da',
                          color: user.status === 'active' ? '#155724' : '#721c24',
                        }}>
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ 
              padding: '15px', 
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ color: '#666' }}>
                Page {pagination.currentPage} of {pagination.totalPages}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={previousPage}
                  disabled={!pagination.hasPreviousPage}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: pagination.hasPreviousPage ? 'pointer' : 'not-allowed',
                    opacity: pagination.hasPreviousPage ? 1 : 0.5,
                  }}
                >
                  ← Previous
                </button>
                <button
                  onClick={nextPage}
                  disabled={!pagination.hasNextPage}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed',
                    opacity: pagination.hasNextPage ? 1 : 0.5,
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plugins Tab */}
      {activeTab === 'plugins' && (
        <div>
          <h2>🔌 Plugin System Demo</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Plugin Controls */}
            <div style={{
              background: '#f5f5f5',
              padding: '20px',
              borderRadius: '8px'
            }}>
              <h3>Active Plugins</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ padding: '10px', background: 'white', marginBottom: '10px', borderRadius: '4px' }}>
                  ✅ <strong>LoggerPlugin</strong> - Logs requests/responses
                </li>
                <li style={{ padding: '10px', background: 'white', marginBottom: '10px', borderRadius: '4px' }}>
                  ✅ <strong>RetryPlugin</strong> - Auto-retry on failures
                </li>
                <li style={{ padding: '10px', background: 'white', marginBottom: '10px', borderRadius: '4px' }}>
                  ✅ <strong>AnalyticsPlugin</strong> - Track API usage
                </li>
              </ul>

              <button
                onClick={testPluginExecution}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  marginTop: '10px'
                }}
              >
                🧪 Test Plugin Execution
              </button>
            </div>

            {/* Plugin Logs */}
            <div style={{
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: '20px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '14px'
            }}>
              <h3 style={{ color: 'white', marginTop: 0 }}>Plugin Logs</h3>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {pluginLogs.length === 0 ? (
                  <div style={{ color: '#888', fontStyle: 'italic' }}>No logs yet...</div>
                ) : (
                  pluginLogs.map((log, i) => (
                    <div key={i} style={{ 
                      padding: '8px', 
                      borderBottom: '1px solid #333',
                      color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#34d399' : '#60a5fa'
                    }}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Plugin Documentation */}
          <div style={{ marginTop: '20px', background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <h3>Plugin Lifecycle Hooks</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {[
                { name: 'onInit', desc: 'Called when plugin is initialized' },
                { name: 'onRequest', desc: 'Intercept requests before sending' },
                { name: 'onResponse', desc: 'Process responses after receiving' },
                { name: 'onError', desc: 'Handle errors and implement retry logic' },
                { name: 'onCacheHit', desc: 'Called when cache entry is found' },
                { name: 'onCacheMiss', desc: 'Called when cache entry is not found' },
                { name: 'onDestroy', desc: 'Cleanup when plugin is removed' },
              ].map(hook => (
                <div key={hook.name} style={{ padding: '10px', background: '#f9fafb', borderRadius: '4px' }}>
                  <code style={{ color: '#0070f3', fontWeight: 'bold' }}>{hook.name}</code>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>{hook.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DevTools Tab */}
      {activeTab === 'devtools' && (
        <div>
          <h2>🛠️ DevTools Demo</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={() => setShowDevTools(!showDevTools)}
              style={{
                padding: '12px 24px',
                background: showDevTools ? '#ef4444' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              {showDevTools ? '🚫 Hide DevTools' : '✅ Show DevTools'}
            </button>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
            <h3>DevTools Features</h3>
            <ul style={{ lineHeight: '2' }}>
              <li><strong>Network Tab:</strong> Monitor all API requests with status, duration, and timestamps</li>
              <li><strong>Cache Tab:</strong> Inspect cache entries and their TTL</li>
              <li><strong>Performance Tab:</strong> Real-time metrics for requests, latency, cache hit rate</li>
              <li><strong>State Tab:</strong> Track state changes over time</li>
              <li><strong>Customizable:</strong> Choose position (corners) and toggle visibility</li>
            </ul>

            <div style={{ marginTop: '20px', background: 'white', padding: '15px', borderRadius: '4px' }}>
              <h4>Try it out:</h4>
              <ol style={{ lineHeight: '2' }}>
                <li>Click "Show DevTools" above to open the DevTools panel</li>
                <li>Switch to the Query tab and build some queries</li>
                <li>Check the Network tab in DevTools to see requests</li>
                <li>Switch to the Plugins tab and test plugin execution</li>
                <li>Watch the Performance metrics update in real-time</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* DevTools Component */}
      {showDevTools && (
        <MockDevTools position="bottom-right" defaultOpen={true} />
      )}
    </div>
  );
}
