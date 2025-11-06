import { Logger, LogLevel } from '../utils/Logger.js';
import type { ApiRoute } from './types.js';
import corsMiddleware from './corsMiddleware.js';

const logger = new Logger('ProxyManager', { level: LogLevel.DEBUG });

export interface ProxyConfig {
  enabled: boolean;
  baseUrl: string;
  rewriteRules?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

export class ProxyManager {
  public config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public rewriteUrl(originalUrl: string, route?: ApiRoute): string {
    if (!this.config.enabled) {
      return originalUrl;
    }

    // Check if the original URL is already an absolute URL
  if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
    return originalUrl;
  }

    // Remove leading slash if present
    const cleanUrl = originalUrl.startsWith('/') ? originalUrl.slice(1) : originalUrl;
    
    // Check if the base URL is already included in the original URL
  // if (originalUrl.startsWith(this.config.baseUrl)) {
  //   return originalUrl;
  // }


    // Rewrite to proxy URL
    return `${this.config.baseUrl}/${cleanUrl}`;
  }

  public getProxyHeaders(): Record<string, string> {
    return {
      'X-Proxy-Origin': 'minder-data-provider',
      'X-Proxy-Timestamp': Date.now().toString(),
      ...this.config.headers,
    };
  }

  public getTimeout(): number {
    return this.config.timeout || 30000;
  }

  // Generate Next.js API route for proxy
  public generateNextJSProxy(): string {
    return `
    // pages/api/minder-proxy/[...path].js
    const corsPath = require.resolve('./corsMiddleware');
    const corsMiddleware = require(corsPath);

    export default async function handler(req, res) {
      const { path } = req.query;
      const apiPath = Array.isArray(path) ? path.join('/') : path;
      await corsMiddleware(req, res);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      try {
        const targetUrl = \`\${${this.config.baseUrl}}\${apiPath}\`;
        
        logger.debug('Target URL:', targetUrl);
        
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || '',
            ${Object.entries(this.config.headers || {}).map(([k, v]) => `'${k}': '${v}'`).join(',\n        ')}
          },
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
        });
        
        // Set CORS headers on the response
        const data = await response.json();
        res.status(response.status).json(data);

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        
        const data = await response.json();
        res.status(response.status).json(data);
      } catch (error) {
        logger.error('Proxy error:', error);
        res.status(500).json({ error: 'Proxy request failed', message: error.message });
      }
    }
  `;
  }
}