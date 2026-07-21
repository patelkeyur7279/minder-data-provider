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
        // Credentials are opt-in since 2.2.0-beta.1: wildcard + credentials is unsafe.
        expect(code).toContain("res.setHeader('Access-Control-Allow-Credentials', 'false')");
    });

    it('should refuse to generate a proxy with credentials + wildcard origin', () => {
        const manager = new ProxyManager({
            enabled: true,
            baseUrl: 'https://api.example.com',
            cors: { credentials: true }
        });

        expect(() => manager.generateNextJSProxy()).toThrow(/credentials|wildcard/i);
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
