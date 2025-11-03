// 🔄 CORS PROXY - Copy this to your Next.js project
// File: pages/api/minder-proxy/[...path].js

export default async function handler(req, res) {
  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path;
  
  // ✅ CORS Headers - Solves CORS error
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-Target-URL');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    // 🎯 Get target URL from headers or use default
    const targetBaseUrl = req.headers['x-target-url'] || 'https://jsonplaceholder.typicode.com';
    const targetUrl = `${targetBaseUrl}/${apiPath}`;
    
    console.log(`🔄 Proxying ${req.method} ${targetUrl}`);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' 
        ? JSON.stringify(req.body) 
        : undefined
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy request failed', 
      message: error.message 
    });
  }
}