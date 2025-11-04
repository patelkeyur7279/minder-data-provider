/**
 * Comprehensive Test Suite for minder-data-provider
 * Tests cover: CRUD operations, error handling, callbacks, metadata, and edge cases
 */

import axios from 'axios';
import { minder, configureMinder } from '../src/core/minder';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe.skip('minder() - Universal Data Provider', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Configure minder for tests
    configureMinder({
      baseURL: 'https://api.test.com',
      timeout: 5000,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ============================================================================
  // GET REQUESTS
  // ============================================================================
  
  describe('GET Requests', () => {
    it('should perform GET request successfully', async () => {
      const mockData = { id: 1, name: 'Test User' };
      mockedAxios.get.mockResolvedValue({ 
        data: mockData, 
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.test.com/users/1',
        expect.any(Object)
      );
    });

    it('should handle GET request with query params', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      mockedAxios.get.mockResolvedValue({ 
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users', null, {
        params: { page: 1, limit: 10 }
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.test.com/users',
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
      
      mockedAxios.post.mockResolvedValue({ 
        data: mockResponse,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users', postData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.status).toBe(201);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.test.com/users',
        postData,
        expect.any(Object)
      );
    });

    it('should auto-detect POST when data is provided', async () => {
      mockedAxios.post.mockResolvedValue({ 
        data: {},
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any
      });

      await minder('/users', { name: 'Test' });

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PUT/PATCH REQUESTS
  // ============================================================================
  
  describe('PUT/PATCH Requests', () => {
    it('should perform PUT request', async () => {
      const updateData = { name: 'Updated User' };
      mockedAxios.put.mockResolvedValue({ 
        data: { id: 1, ...updateData },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', updateData, { method: 'PUT' });

      expect(result.success).toBe(true);
      expect(mockedAxios.put).toHaveBeenCalledWith(
        'https://api.test.com/users/1',
        updateData,
        expect.any(Object)
      );
    });

    it('should perform PATCH request', async () => {
      const patchData = { status: 'active' };
      mockedAxios.patch.mockResolvedValue({ 
        data: patchData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', patchData, { method: 'PATCH' });

      expect(result.success).toBe(true);
      expect(mockedAxios.patch).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DELETE REQUESTS
  // ============================================================================
  
  describe('DELETE Requests', () => {
    it('should perform DELETE request', async () => {
      mockedAxios.delete.mockResolvedValue({ 
        data: { message: 'Deleted successfully' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1', null, { method: 'DELETE' });

      expect(result.success).toBe(true);
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://api.test.com/users/1',
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).request = {};
      mockedAxios.get.mockRejectedValue(networkError);

      const result = await minder('/users');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Network error');
      expect(result.data).toBeNull();
    });

    it('should handle 404 errors with user-friendly message', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Not found' }
        }
      };
      mockedAxios.get.mockRejectedValue(error);

      const result = await minder('/users/999');

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(404);
      expect(result.error?.code).toBe('HTTP_404');
      expect(result.error?.message).toBe('Resource not found');
      expect(result.error?.solution).toBeDefined();
    });

    it('should handle 401 authentication errors', async () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      };
      mockedAxios.get.mockRejectedValue(error);

      const result = await minder('/protected');

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(401);
      expect(result.error?.code).toBe('HTTP_401');
      expect(result.error?.message).toBe('Authentication required');
    });

    it('should handle 500 server errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        }
      };
      mockedAxios.get.mockRejectedValue(error);

      const result = await minder('/users');

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(500);
      expect(result.error?.code).toBe('HTTP_500');
      expect(result.error?.message).toBe('Server error');
    });

    it('should never throw errors (always returns structured result)', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Something went wrong'));

      // Should NOT throw - should return error result
      await expect(minder('/users')).resolves.toBeDefined();
      
      const result = await minder('/users');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  describe('Success and Error Callbacks', () => {
    it('should call onSuccess callback on successful request', async () => {
      const mockData = { id: 1 };
      mockedAxios.get.mockResolvedValue({ 
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
      const error = {
        response: { status: 404, data: {} }
      };
      mockedAxios.get.mockRejectedValue(error);

      const onError = jest.fn();
      await minder('/users/999', null, { onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toHaveProperty('code', 'HTTP_404');
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  describe('Configuration', () => {
    it('should use configured baseURL', async () => {
      mockedAxios.get.mockResolvedValue({ 
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await minder('/users');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.test.com/users',
        expect.any(Object)
      );
    });

    it('should allow custom headers', async () => {
      mockedAxios.get.mockResolvedValue({ 
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await minder('/users', null, {
        headers: { 'X-Custom-Header': 'test' }
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test'
          })
        })
      );
    });
  });

  // ============================================================================
  // METADATA
  // ============================================================================
  
  describe('Response Metadata', () => {
    it('should include metadata in successful response', async () => {
      mockedAxios.get.mockResolvedValue({ 
        data: { id: 1 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const result = await minder('/users/1');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.method).toBe('GET');
      expect(result.metadata?.url).toBe('/users/1');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in error response', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Failed'));

      const result = await minder('/users');

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.method).toBe('GET');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
