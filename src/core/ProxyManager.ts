import { Logger, LogLevel } from '../utils/Logger.js';
import type { ResolvedRouteConfig } from './apiClient/resolveRequest.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = /*#__PURE__*/ new Logger('ProxyManager', { level: LogLevel.DEBUG });

export interface ProxyConfig {
  enabled: boolean;
  baseUrl: string;
  rewriteRules?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
  cors?: {
    origin?: string | string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  };
}

export class ProxyManager {
  public config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  // fix-2.2.0-blockers (STRUCTURAL REDESIGN, item 1): re-typed from `ApiRoute`
  // to the narrowed `ResolvedRouteConfig` — this parameter is unused below
  // (it always was; nothing here reads `.method`/`.url` off it), so keeping
  // it typed as the FULL declared route was itself a latent way for a
  // declared route's `.method`/`.url` to flow past `ApiClient.dispatchResolved`
  // as a pass-through argument. Narrowing the type closes that even though
  // the value is never read.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public rewriteUrl(originalUrl: string, route?: ResolvedRouteConfig): string {
    if (!this.config.enabled) {
      return originalUrl;
    }

    // Check if the original URL is already an absolute URL
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      return originalUrl;
    }

    // Remove leading slash if present
    const cleanUrl = originalUrl.startsWith('/') ? originalUrl.slice(1) : originalUrl;

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
    const corsOrigin = this.config.cors?.origin
      ? (Array.isArray(this.config.cors.origin) ? this.config.cors.origin.join(',') : this.config.cors.origin)
      : '*';

    const corsMethods = this.config.cors?.methods?.join(',') || 'GET,POST,PUT,DELETE,OPTIONS';
    const corsHeaders = this.config.cors?.headers?.join(',') || 'Content-Type,Authorization';
    // Credentials are opt-in: the pre-2.2.0-beta.1 default was 'true', which
    // combined with the wildcard origin default is the canonical unsafe CORS
    // configuration (flagged by CorsManager.validateConfig).
    const corsCredentials = this.config.cors?.credentials === true ? 'true' : 'false';

    if (corsCredentials === 'true' && corsOrigin === '*') {
      throw new Error(
        '[minder-data-provider] Refusing to generate a proxy that sends ' +
          'Access-Control-Allow-Credentials with a wildcard origin. Set cors.origin ' +
          'to an explicit allowlist when cors.credentials is true.'
      );
    }

    return `
    // pages/api/minder-proxy/[...path].js
    export default async function handler(req, res) {
      const { path } = req.query;
      const apiPath = Array.isArray(path) ? path.join('/') : path;

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '${corsOrigin}');
      res.setHeader('Access-Control-Allow-Methods', '${corsMethods}');
      res.setHeader('Access-Control-Allow-Headers', '${corsHeaders}');
      res.setHeader('Access-Control-Allow-Credentials', '${corsCredentials}');
      
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

      } catch (error) {
        logger.error('Proxy error:', error);
        res.status(500).json({ error: 'Proxy request failed', message: error.message });
      }
    }
  `;
  }

  // Generate Express/Node.js middleware for proxy
  public generateExpressProxy(): string {
    const corsOrigin = this.config.cors?.origin
      ? (Array.isArray(this.config.cors.origin) ? JSON.stringify(this.config.cors.origin) : `'${this.config.cors.origin}'`)
      : "'*'";

    const corsMethods = this.config.cors?.methods?.join(',') || 'GET,POST,PUT,DELETE,OPTIONS';
    const corsHeaders = this.config.cors?.headers?.join(',') || 'Content-Type,Authorization';
    // G-08: credentials are opt-in (was `!== false`, defaulting the unsafe
    // wildcard+credentials combination ON) — aligned with generateNextJSProxy.
    const corsCredentials = this.config.cors?.credentials === true ? 'true' : 'false';

    if (corsCredentials === 'true' && corsOrigin === "'*'") {
      throw new Error(
        '[minder-data-provider] Refusing to generate an Express proxy that sends ' +
          'Access-Control-Allow-Credentials with a wildcard origin. Set cors.origin ' +
          'to an explicit allowlist when cors.credentials is true.'
      );
    }

    return `
    const express = require('express');
    const { createProxyMiddleware } = require('http-proxy-middleware');
    const router = express.Router();

    // Proxy configuration
    const proxyOptions = {
      target: '${this.config.baseUrl}',
      changeOrigin: true,
      pathRewrite: {
        '^/api/minder-proxy': '', // Remove base path
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add custom headers
        ${Object.entries(this.config.headers || {}).map(([k, v]) => `proxyReq.setHeader('${k}', '${v}');`).join('\n        ')}
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = ${corsOrigin};
        proxyRes.headers['Access-Control-Allow-Methods'] = '${corsMethods}';
        proxyRes.headers['Access-Control-Allow-Headers'] = '${corsHeaders}';
        proxyRes.headers['Access-Control-Allow-Credentials'] = '${corsCredentials}';
      }
    };

    // Mount proxy
    router.use('/api/minder-proxy', createProxyMiddleware(proxyOptions));

    module.exports = router;
    `;
  }

  // Generate Vite configuration for proxy
  public generateViteProxy(): string {
    return `
    // vite.config.ts
    export default defineConfig({
      server: {
        proxy: {
          '/api/minder-proxy': {
            target: '${this.config.baseUrl}',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\\/api\\/minder-proxy/, ''),
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                ${Object.entries(this.config.headers || {}).map(([k, v]) => `proxyReq.setHeader('${k}', '${v}');`).join('\n                ')}
              });
            }
          }
        }
      }
    });
    `;
  }
}