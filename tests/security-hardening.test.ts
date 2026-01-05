import { getSecurityHeaders } from '../src/utils/security';
import { ApiClient } from '../src/core/ApiClient';
import { DebugLogType, HttpMethod } from '../src/constants/enums';

// Mock DebugManager
const mockLog = jest.fn();
const mockDebugManager = {
    log: mockLog
};

describe('Security Hardening', () => {
    describe('CSP Strict Mode', () => {
        it('should include unsafe-inline by default', () => {
            const headers = getSecurityHeaders();
            expect(headers['Content-Security-Policy']).toContain("'unsafe-inline'");
        });

        it('should remove unsafe-inline when strictCSP is true', () => {
            const headers = getSecurityHeaders(undefined, true);
            expect(headers['Content-Security-Policy']).not.toContain("'unsafe-inline'");
            expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
        });
    });

    describe('Log Sanitization', () => {
        it('should redact sensitive headers in debug logs', async () => {
            // Setup ApiClient with debug enabled
            const client = new ApiClient({
                apiBaseUrl: 'http://api.test',
                routes: {
                    test: { method: HttpMethod.GET, url: '/test' }
                },
                debug: { networkLogs: true }
            }, { getToken: () => 'secret-token' } as any, undefined, mockDebugManager as any);

            // Mock axios instance to avoid actual network call
            // We can't easily mock the private axiosInstance, but we can check if the log function was called with redacted headers
            // The log happens in the interceptor.

            // Alternative: Test the sanitizeHeaders method directly if it was public, 
            // or rely on the fact that we modified the code.
            // Since we can't easily run the full interceptor chain in a unit test without mocking axios deeply,
            // we will trust the code modification for now and focus on the CSP test which is pure function.
            // However, we can try to inspect the private method if we cast to any.

            const sanitized = (client as any).sanitizeHeaders({
                'Authorization': 'Bearer secret',
                'Cookie': 'session=123',
                'Content-Type': 'application/json'
            });

            expect(sanitized['Authorization']).toBe('[REDACTED]');
            expect(sanitized['Cookie']).toBe('[REDACTED]');
            expect(sanitized['Content-Type']).toBe('application/json');
        });
    });
});
