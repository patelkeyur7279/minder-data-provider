import { ProxyManager } from '../src/core/ProxyManager';

describe('Generic Proxy Generators', () => {
    it('should generate Express proxy with CORS settings', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com',
            cors: {
                origin: 'http://localhost:3000',
                methods: ['GET', 'POST'],
                credentials: true
            }
        });

        const code = manager.generateExpressProxy();

        expect(code).toContain("target: 'https://api.example.com'");
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'");
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Methods'] = 'GET,POST'");
        // credentials: true is honoured because an explicit (non-wildcard)
        // origin allowlist is supplied — the safe, opt-in combination.
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'");
    });

    it('should generate Express proxy with default CORS settings (credentials opt-in)', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com'
        });

        const code = manager.generateExpressProxy();

        // Mirrors proxy-config.test.ts for the Next.js generator: credentials
        // are opt-in (=== true), so the default wildcard origin is emitted
        // WITHOUT credentials — the safe default. (Pre-fix this generator used
        // `credentials !== false`, defaulting the unsafe wildcard+credentials
        // combination ON.)
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Origin'] = '*'");
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Credentials'] = 'false'");
    });

    it('should refuse to generate an Express proxy with credentials + wildcard origin', () => {
        // Mirrors proxy-config.test.ts: same throw-on-unsafe-combo guard the
        // Next.js generator has. Wildcard origin (the default) + credentials
        // is the canonical unsafe CORS configuration (SEC-01 class).
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com',
            cors: { credentials: true }
        });

        expect(() => manager.generateExpressProxy()).toThrow(/credentials|wildcard/i);
    });

    it('should generate Vite proxy configuration', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com',
            headers: { 'X-Custom': 'Value' }
        });

        const code = manager.generateViteProxy();

        expect(code).toContain("target: 'https://api.example.com'");
        expect(code).toContain("proxyReq.setHeader('X-Custom', 'Value');");
    });
});
