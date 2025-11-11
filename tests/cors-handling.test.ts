import { CorsManager, CorsIssueType, CorsStrategy } from '../src/utils/corsManager';
import { ApiClient } from '../src/core/ApiClient';
import { MinderNetworkError } from '../src/errors';
import { HttpMethod } from '../src/constants/enums';
import { AuthManager } from '../src/core/AuthManager';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CorsManager', () => {
  let corsManager: CorsManager;
  const mockConfig = {
    enabled: true,
    credentials: true,
    origin: ['https://example.com'],
    methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE],
    headers: ['Content-Type', 'Authorization']
  };

  beforeEach(() => {
    corsManager = new CorsManager(mockConfig);
    corsManager.clearCache(); // Clear cache between tests
  });

  describe('detectCorsIssue', () => {
    it('should detect CORS preflight failure', () => {
      const error = {
        response: {
          status: 405,
          statusText: 'Method Not Allowed',
          data: { message: 'OPTIONS method not allowed' },
          headers: { 'content-type': 'application/json' }
        }
      };

      const result = corsManager.detectCorsIssue(error, 'https://api.example.com/preflight', 'OPTIONS', {});

      expect(result.hasCorsIssue).toBe(true);
      expect(result.issueType).toBe(CorsIssueType.PREFLIGHT_FAILED);
      expect(result.suggestedStrategy).toBe(CorsStrategy.PROXY);
    });

    it('should detect CORS origin blocked', () => {
      const error = {
        response: {
          status: 403,
          statusText: 'Forbidden',
          data: { message: 'Origin not allowed' },
          headers: { 'access-control-allow-origin': 'null' }
        }
      };

      const result = corsManager.detectCorsIssue(error, 'https://api.example.com/origin', 'GET', {});

      expect(result.hasCorsIssue).toBe(true);
      expect(result.issueType).toBe(CorsIssueType.ORIGIN_BLOCKED);
      expect(result.suggestedStrategy).toBe(CorsStrategy.DYNAMIC_ORIGIN);
    });

    it('should detect CORS method not allowed', () => {
      const error = {
        response: {
          status: 405,
          statusText: 'Method Not Allowed',
          data: { message: 'PUT method not allowed' },
          headers: { 'access-control-allow-methods': 'GET, POST' }
        }
      };

      const result = corsManager.detectCorsIssue(error, 'https://api.example.com/method', 'PUT', {});

      expect(result.hasCorsIssue).toBe(true);
      expect(result.issueType).toBe(CorsIssueType.METHOD_NOT_ALLOWED);
      expect(result.suggestedStrategy).toBe(CorsStrategy.FALLBACK);
    });

    it('should return false for non-CORS errors', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { message: 'Resource not found' }
        }
      };

      const result = corsManager.detectCorsIssue(error, 'https://api.example.com/notfound', 'GET', { 'Origin': 'https://example.com' });

      expect(result.hasCorsIssue).toBe(false);
    });
  });

  describe('performPreflight', () => {
    beforeEach(() => {
      // Mock fetch globally
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should perform successful preflight request', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn((header) => {
            switch (header) {
              case 'Access-Control-Allow-Methods':
                return 'GET, POST, PUT, DELETE';
              case 'Access-Control-Allow-Headers':
                return 'content-type, authorization';
              case 'Access-Control-Max-Age':
                return '3600';
              default:
                return null;
            }
          })
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await corsManager.performPreflight('https://api.example.com/users', HttpMethod.GET, ['content-type']);

      expect(result.success).toBe(true);
      expect(result.allowedMethods).toEqual([HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE]);
      expect(result.allowedHeaders).toEqual(['content-type', 'authorization']);
      expect(result.maxAge).toBe(3600);
    });

    it('should handle preflight failure', async () => {
      const mockResponse = {
        ok: false,
        status: 405
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await corsManager.performPreflight('https://api.example.com/users', HttpMethod.GET, ['content-type']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('405');
    });
  });

  describe('getCorsHeaders', () => {
    it('should return appropriate CORS headers', () => {
      const headers = corsManager.getCorsHeaders(HttpMethod.GET);

      expect(headers).toHaveProperty('Access-Control-Request-Method', 'GET');
      expect(headers).toHaveProperty('Access-Control-Request-Headers');
    });
  });

  describe('shouldTriggerPreflight', () => {
    it('should return true for complex requests', () => {
      const result = corsManager.shouldTriggerPreflight(HttpMethod.PUT, { 'Content-Type': 'application/json' });
      expect(result).toBe(true);
    });

    it('should return false for simple requests', () => {
      const result = corsManager.shouldTriggerPreflight(HttpMethod.GET, { 'Content-Type': 'text/plain' });
      expect(result).toBe(false);
    });
  });
});

// Note: ApiClient integration tests are covered by existing api-client.test.ts
// The CorsManager provides the core CORS functionality tested above