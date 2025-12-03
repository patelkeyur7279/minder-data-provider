import { ProxyManager } from '../src/core/ProxyManager';

describe('ProxyManager Configuration', () => {
    it('should generate proxy with default CORS settings', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com'
        });

        const code = manager.generateNextJSProxy();

        expect(code).toContain("res.setHeader('Access-Control-Allow-Origin', '*')");
        expect(code).toContain("res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')");
        expect(code).toContain("res.setHeader('Access-Control-Allow-Credentials', 'true')");
    });

    it('should generate proxy with custom CORS settings', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com',
            cors: {
                origin: ['http://localhost:3000', 'http://localhost:3001'],
                methods: ['GET', 'POST'],
                headers: ['Content-Type', 'X-Custom'],
                credentials: false
            }
        });

        const code = manager.generateNextJSProxy();

        expect(code).toContain("res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000,http://localhost:3001')");
        expect(code).toContain("res.setHeader('Access-Control-Allow-Methods', 'GET,POST')");
        expect(code).toContain("res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Custom')");
        expect(code).toContain("res.setHeader('Access-Control-Allow-Credentials', 'false')");
    });
});
