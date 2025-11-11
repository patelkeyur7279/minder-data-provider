import { RouteProcessor } from '../src/utils/routeProcessor.js';
import { RouteScanner } from '../src/utils/routeScanner.js';
import { generateConfigFromApiRoutes } from '../src/platforms/node.js';
import { validateRoutes } from '../src/utils/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { HttpMethod } from '../src/constants/enums.js';

// Mock fs and path for testing
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  relative: jest.fn((from, to) => to.replace(from + '/', '')),
  extname: jest.fn((file) => '.' + file.split('.').pop()),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('Route Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RouteProcessor', () => {
    describe('validateRoutes', () => {
      it('should validate valid routes', () => {
        const routes = {
          getUsers: {
            method: HttpMethod.GET,
            url: '/users',
            timeout: 30000
          },
          createUser: {
            method: HttpMethod.POST,
            url: '/users',
            timeout: 30000
          }
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('should detect missing method', () => {
        const routes = {
          invalidRoute: {
            url: '/test'
          } as any
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Route "invalidRoute" is missing method');
      });

      it('should detect missing URL', () => {
        const routes = {
          invalidRoute: {
            method: HttpMethod.GET
          } as any
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Route "invalidRoute" is missing url');
      });

      it('should detect invalid HTTP methods', () => {
        const routes = {
          invalidRoute: {
            method: 'INVALID' as any,
            url: '/test'
          }
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Route "invalidRoute" has invalid method "INVALID"');
      });

      it('should detect duplicate URLs with same method', () => {
        const routes = {
          route1: {
            method: HttpMethod.GET,
            url: '/users'
          },
          route2: {
            method: HttpMethod.GET,
            url: '/users'
          }
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((error: string) => error.includes('Duplicate URLs found'))).toBe(true);
      });

      it('should warn about URLs not starting with slash', () => {
        const routes = {
          invalidRoute: {
            method: HttpMethod.GET,
            url: 'users' // Missing leading slash
          }
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Route "invalidRoute" URL must start with "/"');
      });

      it('should warn about duplicate parameters', () => {
        const routes = {
          invalidRoute: {
            method: HttpMethod.GET,
            url: '/users/:id/:id' // Duplicate parameter
          }
        };

        const result = validateRoutes(routes);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Route "invalidRoute" has duplicate parameters');
      });
    });

    describe('generateFromDirectory', () => {
      it('should process Next.js API routes', async () => {
        const mockFiles = ['api/users.ts', 'api/posts.ts'];
        const mockContent = `
          export default async function handler(req, res) {
            // Next.js API route
          }
        `;

        mockFs.readdir.mockResolvedValue([
          { name: 'users.ts', isDirectory: () => false, isFile: () => true },
          { name: 'posts.ts', isDirectory: () => false, isFile: () => true }
        ] as any);

        mockFs.readFile.mockResolvedValue(mockContent);
        mockPath.relative.mockReturnValue('api/users.ts');
        mockPath.extname.mockReturnValue('.ts');

        const result = await RouteProcessor.generateFromDirectory({
          baseDir: '/test',
          framework: 'nextjs'
        });

        expect(result.routes).toBeDefined();
        expect(result.errors).toHaveLength(0);
      });

      it('should handle file read errors gracefully', async () => {
        mockFs.readdir.mockResolvedValue([
          { name: 'users.ts', isDirectory: () => false, isFile: () => true }
        ] as any);

        mockFs.readFile.mockRejectedValue(new Error('File read error'));

        const result = await RouteProcessor.generateFromDirectory({
          baseDir: '/test',
          framework: 'nextjs'
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to process');
      });
    });
  });

  describe('RouteScanner', () => {
    describe('detectFramework', () => {
      it('should detect Next.js from package.json', async () => {
        mockFs.readFile.mockResolvedValue(JSON.stringify({
          dependencies: { next: '^12.0.0' }
        }));

        const framework = await RouteScanner.detectFramework('/test');

        expect(framework).toBe('nextjs');
      });

      it('should detect Express from package.json', async () => {
        mockFs.readFile.mockResolvedValue(JSON.stringify({
          dependencies: { express: '^4.0.0' }
        }));

        const framework = await RouteScanner.detectFramework('/test');

        expect(framework).toBe('express');
      });

      it('should return null for unknown frameworks', async () => {
        mockFs.readFile.mockResolvedValue(JSON.stringify({
          dependencies: { unknown: '^1.0.0' }
        }));

        const framework = await RouteScanner.detectFramework('/test');

        expect(framework).toBeNull();
      });
    });

    describe('scanFramework', () => {
      it('should scan Next.js routes', async () => {
        const mockContent = `
          export async function GET() {
            return Response.json({ data: [] });
          }

          export async function POST() {
            return Response.json({ success: true });
          }
        `;

        mockFs.readdir.mockResolvedValue([
          { name: 'users.ts', isDirectory: () => false, isFile: () => true }
        ] as any);

        mockFs.readFile.mockResolvedValue(mockContent);
        mockPath.relative.mockReturnValue('api/users.ts');

        const routes = await RouteScanner.scanFramework('/test', 'nextjs');

        expect(routes).toHaveLength(2);
        expect(routes.some(r => r.route.method === HttpMethod.GET)).toBe(true);
        expect(routes.some(r => r.route.method === HttpMethod.POST)).toBe(true);
      });

      it('should scan Express routes', async () => {
        const mockContent = `
          const express = require('express');
          const router = express.Router();

          router.get('/users', (req, res) => {
            res.json({ users: [] });
          });

          router.post('/users', (req, res) => {
            res.json({ success: true });
          });
        `;

        mockFs.readdir.mockResolvedValue([
          { name: 'users.ts', isDirectory: () => false, isFile: () => true }
        ] as any);

        mockFs.readFile.mockResolvedValue(mockContent);
        mockPath.relative.mockReturnValue('routes/users.ts');

        const routes = await RouteScanner.scanFramework('/test', 'express');

        expect(routes.length).toBeGreaterThan(0);
        expect(routes.some(r => r.route.method === HttpMethod.GET)).toBe(true);
        expect(routes.some(r => r.route.method === HttpMethod.POST)).toBe(true);
      });
    });
  });

  describe('generateConfigFromApiRoutes', () => {
    it('should generate config from API routes', async () => {
      const mockContent = `
        export async function GET() {
          return Response.json({ data: [] });
        }
      `;

      mockFs.readdir.mockResolvedValue([
        { name: 'users.ts', isDirectory: () => false, isFile: () => true }
      ] as any);

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPath.relative.mockReturnValue('api/users.ts');

      const result = await generateConfigFromApiRoutes('/test/api');

      expect(result).toHaveProperty('routes');
      expect(result).toHaveProperty('processing');
      expect(result.processing.routeCount).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const result = await generateConfigFromApiRoutes('/nonexistent');

      expect(result.processing.errors).toHaveLength(1);
      expect(result.processing.errors[0]).toContain('Directory scan failed');
    });
  });
});