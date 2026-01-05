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
        expect(code).toContain("proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'");
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
