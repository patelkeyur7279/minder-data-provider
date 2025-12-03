import { CorsManager } from '../src/utils/corsManager';
import { HttpMethod } from '../src/constants/enums';

describe('CORS Hardening', () => {
    describe('Configuration Validation', () => {
        it('should detect security risk: credentials with wildcard origin', () => {
            const manager = new CorsManager({
                enabled: true,
                credentials: true,
                origin: '*'
            });

            const validation = manager.validateConfig();
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0]).toContain('Security Risk');
        });

        it('should warn about missing proxy in development', () => {
            // Mock window location
            Object.defineProperty(global, 'window', {
                value: {
                    location: { hostname: 'localhost', origin: 'http://localhost:3000' }
                },
                writable: true
            });

            const manager = new CorsManager({
                enabled: true,
                // No proxy configured
            });

            const validation = manager.validateConfig();
            expect(validation.warnings[0]).toContain('Development Warning');
        });

        it('should warn about missing OPTIONS method', () => {
            const manager = new CorsManager({
                enabled: true,
                methods: [HttpMethod.GET] // Missing OPTIONS
            });

            const validation = manager.validateConfig();
            expect(validation.warnings).toContainEqual(expect.stringContaining('Missing OPTIONS method'));
        });

        it('should pass valid configuration', () => {
            const manager = new CorsManager({
                enabled: true,
                credentials: true,
                origin: 'http://localhost:3000',
                proxy: '/api/proxy',
                methods: [HttpMethod.GET, HttpMethod.OPTIONS]
            });

            const validation = manager.validateConfig();
            expect(validation.isValid).toBe(true);
            expect(validation.warnings).toHaveLength(0);
            expect(validation.errors).toHaveLength(0);
        });
    });
});
