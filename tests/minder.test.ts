/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { minder, configureMinder } from '../src/core/minder';
import { setGlobalMinderConfig, clearGlobalMinderConfig } from '../src/core/globalConfig';
import type { StandardSchemaV1 } from '../src/types/standard-schema';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('minder() - Universal Data Provider', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Reset global config
    configureMinder({
      baseURL: '',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  describe('configureMinder', () => {
    it('should configure global baseURL', async () => {
      configureMinder({ baseURL: 'http://api.example.com' });
      
      mockedAxios.mockResolvedValueOnce({
        data: { id: 1 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/users');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://api.example.com',
        })
      );
    });

    it('should configure global timeout', async () => {
      configureMinder({ timeout: 60000 });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should configure global headers', async () => {
      configureMinder({
        headers: {
          'X-Custom-Header': 'value',
        },
      });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'value',
          }),
        })
      );
    });

    it('should configure global token', async () => {
      configureMinder({ token: 'global-token-123' });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer global-token-123',
          }),
        })
      );
    });

    it('should merge configurations', async () => {
      configureMinder({
        baseURL: 'http://api.example.com',
        timeout: 45000,
        token: 'token123',
      });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://api.example.com',
          timeout: 45000,
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });
  });
  
  // ============================================================================
  // GET REQUESTS
  // ============================================================================
  
  describe('GET Requests', () => {
    it('should perform GET request with null data', async () => {
      const mockData = { id: 1, name: 'Test User' };
      mockedAxios.mockResolvedValueOnce({ 
        data: mockData, 
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', null);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/users/1',
        })
      );
    });

    it('should perform GET request with undefined data', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      mockedAxios.mockResolvedValueOnce({ 
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle GET request with query params', async () => {
      mockedAxios.mockResolvedValueOnce({ 
        data: [],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await minder('/users', null, {
        params: { page: 1, limit: 10 }
      });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: 1, limit: 10 }
        })
      );
    });
  });

  // ============================================================================
  // POST REQUESTS
  // ============================================================================
  
  describe('POST Requests', () => {
    it('should perform POST request with data', async () => {
      const postData = { name: 'New User', email: 'test@example.com' };
      const mockResponse = { id: 1, ...postData };
      
      mockedAxios.mockResolvedValueOnce({ 
        data: mockResponse,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any
      });

      const result = await minder('/api/users/', postData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.status).toBe(201);
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: postData,
        })
      );
    });

    it('should encode data with model class', async () => {
      class UserModel {
        static encode(data: any) {
          return { user: data };
        }
      }
      
      mockedAxios.mockResolvedValueOnce({
        data: { id: 1 },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });
      
      await minder('/api/users/', { name: 'John' }, { model: UserModel });
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { user: { name: 'John' } },
        })
      );
    });
  });

  // ============================================================================
  // PUT/PATCH REQUESTS
  // ============================================================================
  
  describe('PUT/PATCH Requests', () => {
    it('should perform PUT request', async () => {
      const updateData = { name: 'Updated User' };
      mockedAxios.mockResolvedValueOnce({ 
        data: { id: 1, ...updateData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', updateData);

      expect(result.success).toBe(true);
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          data: updateData,
        })
      );
    });

    it('should perform PUT when data has id', async () => {
      mockedAxios.mockResolvedValueOnce({ 
        data: { id: 1 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await minder('/api/users/', { id: 1, name: 'Updated' });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should perform PATCH request with explicit method', async () => {
      const patchData = { status: 'active' };
      mockedAxios.mockResolvedValueOnce({ 
        data: patchData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await minder('/users/1', patchData, { method: 'PATCH' });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });
  });

  // ============================================================================
  // DELETE REQUESTS
  // ============================================================================
  
  describe('DELETE Requests', () => {
    it('should perform DELETE request', async () => {
      mockedAxios.mockResolvedValueOnce({ 
        data: { message: 'Deleted successfully' },
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', null, { method: 'DELETE' });

      expect(result.success).toBe(true);
      expect(result.status).toBe(204);
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should perform DELETE when data has delete indicator', async () => {
      mockedAxios.mockResolvedValueOnce({ 
        data: {},
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any
      });

      await minder('/users/1', { delete: true });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  // ============================================================================
  // FILE UPLOADS
  // ============================================================================
  
  describe('File Uploads', () => {
    it('should handle File upload', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      
      mockedAxios.mockResolvedValueOnce({
        data: { url: 'http://example.com/file.txt' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      const result = await minder('/upload', file);
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        })
      );
      expect(result.data).toEqual({ url: 'http://example.com/file.txt' });
    });

    it('should handle Blob upload', async () => {
      const blob = new Blob(['content'], { type: 'text/plain' });
      
      mockedAxios.mockResolvedValueOnce({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/upload', blob);
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        })
      );
    });

    it('should handle FormData upload', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['content']));
      
      mockedAxios.mockResolvedValueOnce({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/upload', formData);
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: formData,
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        })
      );
    });

    it('should handle FileList upload', async () => {
      // Skip if DataTransfer not available
      if (typeof DataTransfer === 'undefined') {
        return;
      }
      
      const file1 = new File(['content1'], 'test1.txt');
      const file2 = new File(['content2'], 'test2.txt');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file1);
      dataTransfer.items.add(file2);
      const fileList = dataTransfer.files;
      
      mockedAxios.mockResolvedValueOnce({
        data: { uploaded: 2 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/upload', fileList);
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        })
      );
    });

    it('should track upload progress', async () => {
      const file = new File(['content'], 'test.txt');
      const onProgress = jest.fn();
      
      (mockedAxios as any).mockImplementationOnce((config: any) => {
        // Simulate progress
        if (config.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 });
          config.onUploadProgress({ loaded: 100, total: 100 });
        }
        return Promise.resolve({
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });
      });
      
      await minder('/upload', file, { onProgress });
      
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 50,
          total: 100,
          percentage: 50,
        })
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 100,
          total: 100,
          percentage: 100,
        })
      );
    });
  });

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================
  
  describe('Authentication', () => {
    it('should add global token to requests', async () => {
      configureMinder({ token: 'global-token' });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/protected');
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer global-token',
          }),
        })
      );
    });

    it('should override global token with request token', async () => {
      configureMinder({ token: 'global-token' });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/protected', null, { token: 'request-token' });
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer request-token',
          }),
        })
      );
    });
  });

  // ============================================================================
  // CUSTOM HEADERS
  // ============================================================================
  
  describe('Custom Headers', () => {
    it('should merge custom headers with defaults', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test', null, {
        headers: {
          'X-Custom': 'value',
        },
      });
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          }),
        })
      );
    });
  });

  // ============================================================================
  // MODEL INTEGRATION
  // ============================================================================
  
  describe('Model Integration', () => {
    it('should decode response with model class', async () => {
      class UserModel {
        name: string;
        
        static decode(data: any) {
          return new UserModel(data);
        }
        
        constructor(data: any) {
          this.name = data.name.toUpperCase();
        }
      }
      
      mockedAxios.mockResolvedValueOnce({
        data: { name: 'john' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      const result = await minder('/users/1', null, { model: UserModel });
      
      expect(result.data).toBeInstanceOf(UserModel);
      expect((result.data as UserModel).name).toBe('JOHN');
    });
  });

  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  describe('Success and Error Callbacks', () => {
    it('should call onSuccess callback on successful request', async () => {
      const mockData = { id: 1 };
      mockedAxios.mockResolvedValueOnce({ 
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const onSuccess = jest.fn();
      await minder('/users/1', null, { onSuccess });

      expect(onSuccess).toHaveBeenCalledWith(mockData);
    });

    it('should call onError callback on failed request', async () => {
      mockedAxios.mockRejectedValueOnce({
        response: { status: 404, data: {} }
      });

      const onError = jest.fn();
      await minder('/users/999', null, { onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toHaveProperty('code', 'HTTP_404');
    });
  });
  
  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  
  describe('Error Handling', () => {
    it('should never throw errors', async () => {
      mockedAxios.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await minder('/test');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.data).toBeNull();
    });

    it('should handle 404 errors', async () => {
      mockedAxios.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { message: 'Not found' },
        },
      });
      
      const result = await minder('/users/999');
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HTTP_404');
      expect(result.error?.message).toBe('Resource not found');
      expect(result.status).toBe(404);
    });

    it('should handle 401 authentication errors', async () => {
      mockedAxios.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      });

      const result = await minder('/protected');

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(401);
      expect(result.error?.code).toBe('HTTP_401');
      expect(result.error?.message).toBe('Authentication required');
    });

    it('should handle 500 server errors', async () => {
      mockedAxios.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        }
      });

      const result = await minder('/users');

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(500);
      expect(result.error?.code).toBe('HTTP_500');
      expect(result.error?.message).toBe('Server error');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).request = {};
      mockedAxios.mockRejectedValueOnce(networkError);

      const result = await minder('/users');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Network error');
      expect(result.data).toBeNull();
    });
  });

  // ============================================================================
  // OPTIONS OVERRIDE
  // ============================================================================
  
  describe('Options Override', () => {
    it('should override baseURL per request', async () => {
      configureMinder({ baseURL: 'http://api1.example.com' });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test', null, { baseURL: 'http://api2.example.com' });
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://api2.example.com',
        })
      );
    });

    it('should override timeout per request', async () => {
      configureMinder({ timeout: 30000 });
      
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      await minder('/test', null, { timeout: 60000 });
      
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================
  
  describe('Response Metadata', () => {
    it('should include metadata in successful response', async () => {
      mockedAxios.mockResolvedValueOnce({ 
        data: { id: 1 },
        status: 200,
        statusText: 'OK',
        headers: { 'x-custom': 'value' },
        config: {} as any,
      });

      const result = await minder('/users/1');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.method).toBe('GET');
      expect(result.metadata?.url).toBe('/users/1');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.cached).toBe(false);
    });

    it('should include metadata in error response', async () => {
      mockedAxios.mockRejectedValueOnce(new Error('Failed'));

      const result = await minder('/api/users/', { name: 'test' });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.method).toBe('POST');
      expect(result.metadata?.url).toBe('/api/users/');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.cached).toBe(false);
    });

    it('should include response headers', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
          'x-rate-limit': '100',
        },
        config: {} as any,
      });
      
      const result = await minder('/test');
      
      expect(result.headers).toEqual({
        'content-type': 'application/json',
        'x-rate-limit': '100',
      });
    });
  });

  // ============================================================================
  // INTEGRATION SCENARIOS
  // ============================================================================
  
  describe('Integration Scenarios', () => {
    it('should handle complete CRUD workflow', async () => {
      configureMinder({ baseURL: 'http://api.example.com' });
      
      // CREATE
      mockedAxios.mockResolvedValueOnce({
        data: { id: 1, name: 'John' },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });
      
      const createResult = await minder('/api/users/', { name: 'John' });
      expect(createResult.success).toBe(true);
      expect(createResult.data?.id).toBe(1);
      
      // READ
      mockedAxios.mockResolvedValueOnce({
        data: { id: 1, name: 'John' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      const readResult = await minder('/users/1');
      expect(readResult.data).toEqual({ id: 1, name: 'John' });
      
      // UPDATE
      mockedAxios.mockResolvedValueOnce({
        data: { id: 1, name: 'Jane' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      const updateResult = await minder('/users/1', { name: 'Jane' });
      expect(updateResult.data?.name).toBe('Jane');
      
      // DELETE
      mockedAxios.mockResolvedValueOnce({
        data: {},
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any,
      });
      
      const deleteResult = await minder('/users/1', { delete: true });
      expect(deleteResult.status).toBe(204);
    });

    it('should handle file upload with progress and callbacks', async () => {
      const file = new File(['content'], 'document.pdf');
      const onProgress = jest.fn();
      const onSuccess = jest.fn();
      
      (mockedAxios as any).mockImplementationOnce((config: any) => {
        if (config.onUploadProgress) {
          config.onUploadProgress({ loaded: 100, total: 100 });
        }
        return Promise.resolve({
          data: { url: 'http://example.com/document.pdf' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });
      });
      
      const result = await minder('/upload', file, { onProgress, onSuccess });
      
      expect(result.success).toBe(true);
      expect(onProgress).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should handle authentication and error recovery', async () => {
      const onError = jest.fn();
      
      // First request fails with 401
      mockedAxios.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      });
      
      const failedResult = await minder('/protected', null, { onError });
      
      expect(failedResult.success).toBe(false);
      expect(failedResult.error?.code).toBe('HTTP_401');
      expect(onError).toHaveBeenCalled();
      
      // Retry with token
      mockedAxios.mockResolvedValueOnce({
        data: { secret: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
      
      const successResult = await minder('/protected', null, { token: 'new-token' });
      
      expect(successResult.success).toBe(true);
      expect(successResult.data).toEqual({ secret: 'data' });
    });
  });

  // ============================================================================
  // RESPONSE VALIDATION (Task 3.1 — Standard Schema)
  // ============================================================================

  describe('Response validation (Standard Schema)', () => {
    const userSchema: StandardSchemaV1<any, { id: number; name: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v: any) =>
          v && typeof v.id !== 'undefined' && typeof v.name === 'string'
            ? { value: { id: Number(v.id), name: v.name } }
            : { issues: [{ message: 'invalid user shape', path: ['name'] }] },
      },
    };

    afterEach(() => {
      clearGlobalMinderConfig();
    });

    it('passes valid data through, typed/replaced by the validator output', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: { id: '1', name: 'Ada' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await minder('/users/1', undefined, { schema: userSchema });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'Ada' });
    });

    it('fails closed with RESPONSE_VALIDATION_FAILED and populated issues on a mismatch', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: { id: '1' }, // missing `name`
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await minder('/users/1', undefined, { schema: userSchema });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('RESPONSE_VALIDATION_FAILED');
      expect(result.error?.status).toBe(200);
      expect(result.error?.issues).toEqual([{ message: 'invalid user shape', path: ['name'] }]);
    });

    it('is a pass-through, byte-identical to the no-schema path, when no schema is configured', async () => {
      const raw = { id: '1', name: 'Ada', extra: 'untouched' };
      mockedAxios.mockResolvedValueOnce({
        data: raw,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await minder('/users/1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(raw);
    });

    it('per-call options.schema overrides a route-def schema', async () => {
      const routeSchema: StandardSchemaV1<any, any> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => ({ issues: [{ message: 'route schema always fails' }] }),
        },
      };
      setGlobalMinderConfig({
        apiBaseUrl: 'http://api.example.com',
        routes: {
          getUser: { method: 'GET' as any, url: '/users/1', schema: routeSchema },
        },
      });

      mockedAxios.mockResolvedValueOnce({
        data: { id: '1', name: 'Ada' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      // The per-call schema (valid) must win over the route-def schema
      // (which always fails) — same precedence as method/timeout/headers.
      const result = await minder('getUser', undefined, { schema: userSchema });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'Ada' });
    });

    it('a route-def schema applies when no per-call schema is given', async () => {
      setGlobalMinderConfig({
        apiBaseUrl: 'http://api.example.com',
        routes: {
          getUser: { method: 'GET' as any, url: '/users/1', schema: userSchema },
        },
      });

      mockedAxios.mockResolvedValueOnce({
        data: { id: 'nope' }, // missing `name` -> fails userSchema
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await minder('getUser');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RESPONSE_VALIDATION_FAILED');
    });

    it('throwOnError:true throws the validation error instead of returning it', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: { id: '1' }, // missing `name`
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await expect(
        minder('/users/1', undefined, { schema: userSchema, throwOnError: true })
      ).rejects.toMatchObject({
        code: 'RESPONSE_VALIDATION_FAILED',
        status: 200,
        minderError: expect.objectContaining({ code: 'RESPONSE_VALIDATION_FAILED' }),
      });
    });

    it('awaits an async validator', async () => {
      const asyncUserSchema: StandardSchemaV1<any, { id: number; name: string }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async (v: any) => userSchema['~standard'].validate(v),
        },
      };
      mockedAxios.mockResolvedValueOnce({
        data: { id: '2', name: 'Grace' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await minder('/users/2', undefined, { schema: asyncUserSchema });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 2, name: 'Grace' });
    });
  });
});
