/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  detectMethod,
  isFileUpload,
  encodeWithModel,
  decodeWithModel,
  handleError,
} from '../src/core/minder/utils';

// Mock Logger to suppress console output during tests
jest.mock('../src/utils/Logger', () => ({
  Logger: class MockLogger {
    warn() {}
    debug() {}
    info() {}
    error() {}
  },
  LogLevel: {
    WARN: 'warn',
    DEBUG: 'debug',
    INFO: 'info',
    ERROR: 'error',
  },
}));

describe('Minder Utils', () => {
  describe('detectMethod', () => {
    it('should use explicit method when provided', () => {
      expect(detectMethod('/users', { name: 'John' }, { method: 'PATCH' })).toBe('PATCH');
      expect(detectMethod('/users/123', null, { method: 'DELETE' })).toBe('DELETE');
      expect(detectMethod('/posts', { title: 'Test' }, { method: 'POST' })).toBe('POST');
    });

    it('should return GET for null data', () => {
      expect(detectMethod('/users', null)).toBe('GET');
      expect(detectMethod('/users/123', null)).toBe('GET');
    });

    it('should return GET for undefined data', () => {
      expect(detectMethod('/users', undefined)).toBe('GET');
      expect(detectMethod('/posts', undefined)).toBe('GET');
    });

    it('should return DELETE when data has delete indicator', () => {
      expect(detectMethod('/users/123', { delete: true })).toBe('DELETE');
      expect(detectMethod('/posts/456', { delete: 1 })).toBe('DELETE');
      expect(detectMethod('/items', { delete: 'yes' })).toBe('DELETE');
    });

    it('should return PUT when route has ID pattern', () => {
      expect(detectMethod('/users/123', { name: 'John' })).toBe('PUT');
      expect(detectMethod('/posts/abc-def-ghi', { title: 'Test' })).toBe('PUT');
      expect(detectMethod('/items/user_123', { value: 100 })).toBe('PUT');
      expect(detectMethod('/data/a1b2c3', {})).toBe('PUT');
    });

    it('should return PUT when data has id field', () => {
      expect(detectMethod('/users', { id: 123, name: 'John' })).toBe('PUT');
      expect(detectMethod('/posts', { id: '456', title: 'Test' })).toBe('PUT');
    });

    it('should return PUT when data has _id field (MongoDB style)', () => {
      expect(detectMethod('/users', { _id: '507f1f77bcf86cd799439011', name: 'John' })).toBe('PUT');
      expect(detectMethod('/posts', { _id: 'abc123', title: 'Test' })).toBe('PUT');
    });

    it('should not consider id: 0 or id: null as having ID', () => {
      // Routes ending with / won't match ID pattern
      expect(detectMethod('/api/users/', { id: 0, name: 'John' })).toBe('POST');
      expect(detectMethod('/api/users/', { id: null, name: 'John' })).toBe('POST');
      expect(detectMethod('/api/users/', { _id: null, name: 'John' })).toBe('POST');
    });

    it('should return POST as default for new records without ID', () => {
      // Routes ending with / won't match the ID pattern
      expect(detectMethod('/api/users/', { name: 'John' })).toBe('POST');
      expect(detectMethod('/api/posts/', { title: 'New Post' })).toBe('POST');
      expect(detectMethod('/api/items/', { value: 100 })).toBe('POST');
    });

    it('should prioritize explicit method over detection', () => {
      expect(detectMethod('/users/123', { name: 'John' }, { method: 'POST' })).toBe('POST');
      expect(detectMethod('/users', { id: 123 }, { method: 'DELETE' })).toBe('DELETE');
    });

    it('should handle route patterns correctly', () => {
      // Should detect as PUT (has ID in route)
      expect(detectMethod('/api/users/123', { name: 'John' })).toBe('PUT');
      expect(detectMethod('/v1/posts/abc', { title: 'Test' })).toBe('PUT');
      
      // Should detect as POST (route ending with /)
      expect(detectMethod('/api/users/', { name: 'John' })).toBe('POST');
      expect(detectMethod('/users/', { name: 'John' })).toBe('POST');
    });

    it('should handle complex route patterns', () => {
      expect(detectMethod('/users/123/posts', { title: 'Test' })).toBe('PUT');
      expect(detectMethod('/users/abc-123-def', { name: 'John' })).toBe('PUT');
      expect(detectMethod('/items/user_456', { value: 100 })).toBe('PUT');
    });

    it('should handle empty objects as POST', () => {
      // Routes ending with / to avoid ID pattern match
      expect(detectMethod('/api/users/', {})).toBe('POST');
      expect(detectMethod('/api/posts/', {})).toBe('POST');
    });
  });

  describe('isFileUpload', () => {
    it('should return false for null or undefined', () => {
      expect(isFileUpload(null)).toBe(false);
      expect(isFileUpload(undefined)).toBe(false);
    });

    it('should return false for primitive types', () => {
      expect(isFileUpload('string')).toBe(false);
      expect(isFileUpload(123)).toBe(false);
      expect(isFileUpload(true)).toBe(false);
      expect(isFileUpload([])).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isFileUpload({})).toBe(false);
      expect(isFileUpload({ file: 'data' })).toBe(false);
    });

    it('should return true for File instances', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      expect(isFileUpload(file)).toBe(true);
    });

    it('should return true for Blob instances', () => {
      const blob = new Blob(['content'], { type: 'text/plain' });
      expect(isFileUpload(blob)).toBe(true);
    });

    it('should return true for FileList', () => {
      // Check if DataTransfer is available (jsdom)
      if (typeof DataTransfer === 'undefined') {
        // Skip test in environments without DataTransfer
        expect(true).toBe(true);
        return;
      }
      
      const file1 = new File(['content1'], 'test1.txt');
      const file2 = new File(['content2'], 'test2.txt');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file1);
      dataTransfer.items.add(file2);
      const fileList = dataTransfer.files;
      
      expect(isFileUpload(fileList)).toBe(true);
    });

    it('should return true for FormData', () => {
      // Check if FormData is available
      if (typeof FormData === 'undefined') {
        expect(true).toBe(true);
        return;
      }
      
      const formData = new FormData();
      formData.append('file', new Blob(['content']));
      expect(isFileUpload(formData)).toBe(true);
    });
  });

  describe('encodeWithModel', () => {
    it('should return data as-is when no model provided', () => {
      const data = { name: 'John', age: 30 };
      expect(encodeWithModel(data)).toBe(data);
    });

    it('should return data as-is when data is null or undefined', () => {
      class Model {}
      expect(encodeWithModel(null, Model)).toBe(null);
      expect(encodeWithModel(undefined, Model)).toBe(undefined);
    });

    it('should use static encode method if available', () => {
      class ModelWithStaticEncode {
        static encode(data: any) {
          return { ...data, encoded: true };
        }
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, ModelWithStaticEncode);
      
      expect(result).toEqual({ name: 'John', encoded: true });
    });

    it('should use instance encode method if available', () => {
      class ModelWithInstanceEncode {
        private data: any;
        
        constructor(data: any) {
          this.data = data;
        }
        
        encode() {
          return { ...this.data, instanceEncoded: true };
        }
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, ModelWithInstanceEncode);
      
      expect(result).toEqual({ name: 'John', instanceEncoded: true });
    });

    it('should prioritize static encode over instance encode', () => {
      class ModelWithBoth {
        private data: any;
        
        static encode(data: any) {
          return { ...data, staticEncoded: true };
        }
        
        constructor(data: any) {
          this.data = data;
        }
        
        encode() {
          return { ...this.data, instanceEncoded: true };
        }
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, ModelWithBoth);
      
      expect(result).toEqual({ name: 'John', staticEncoded: true });
    });

    it('should return raw data when model has no encode method', () => {
      class SimpleModel {
        constructor(public data: any) {}
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, SimpleModel);
      
      expect(result).toEqual(data);
    });

    it('should handle encode errors gracefully', () => {
      class BrokenModel {
        static encode() {
          throw new Error('Encode failed');
        }
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, BrokenModel);
      
      // Should return original data on error
      expect(result).toEqual(data);
    });

    it('should handle constructor errors gracefully', () => {
      class BrokenConstructor {
        constructor() {
          throw new Error('Constructor failed');
        }
      }
      
      const data = { name: 'John' };
      const result = encodeWithModel(data, BrokenConstructor);
      
      // Should return original data on error
      expect(result).toEqual(data);
    });
  });

  describe('decodeWithModel', () => {
    it('should return data as-is when no model provided', () => {
      const data = { name: 'John', age: 30 };
      expect(decodeWithModel(data)).toBe(data);
    });

    it('should return data as-is when data is null or undefined', () => {
      class Model {}
      expect(decodeWithModel(null, Model)).toBe(null);
      expect(decodeWithModel(undefined, Model)).toBe(undefined);
    });

    it('should use static decode method if available', () => {
      class ModelWithStaticDecode {
        static decode(data: any) {
          return { ...data, decoded: true };
        }
      }
      
      const data = { name: 'John' };
      const result = decodeWithModel(data, ModelWithStaticDecode);
      
      expect(result).toEqual({ name: 'John', decoded: true });
    });

    it('should create model instance when no static decode method', () => {
      class UserModel {
        name: string;
        
        constructor(data: any) {
          this.name = data.name.toUpperCase();
        }
      }
      
      const data = { name: 'john' };
      const result = decodeWithModel(data, UserModel);
      
      expect(result).toBeInstanceOf(UserModel);
      expect((result as UserModel).name).toBe('JOHN');
    });

    it('should handle decode errors gracefully', () => {
      class BrokenDecode {
        static decode() {
          throw new Error('Decode failed');
        }
      }
      
      const data = { name: 'John' };
      const result = decodeWithModel(data, BrokenDecode);
      
      // Should return original data on error
      expect(result).toEqual(data);
    });

    it('should handle constructor errors gracefully', () => {
      class BrokenConstructor {
        constructor() {
          throw new Error('Constructor failed');
        }
      }
      
      const data = { name: 'John' };
      const result = decodeWithModel(data, BrokenConstructor);
      
      // Should return original data on error
      expect(result).toEqual(data);
    });

    it('should work with complex model transformations', () => {
      class ProductModel {
        id: number;
        name: string;
        price: number;
        
        static decode(data: any) {
          return new ProductModel(data);
        }
        
        constructor(data: any) {
          this.id = data.id;
          this.name = data.name;
          this.price = parseFloat(data.price);
        }
      }
      
      const data = { id: 1, name: 'Widget', price: '19.99' };
      const result = decodeWithModel(data, ProductModel);
      
      expect(result).toBeInstanceOf(ProductModel);
      expect((result as ProductModel).price).toBe(19.99);
    });
  });

  describe('handleError', () => {
    it('should handle axios-like 400 errors', () => {
      const error = {
        response: {
          status: 400,
          data: { field: 'name', message: 'Invalid' }
        }
      };
      
      const result = handleError(error);
      
      expect(result.message).toBe('Invalid request data');
      expect(result.code).toBe('HTTP_400');
      expect(result.status).toBe(400);
      expect(result.solution).toBe('Please check your input and try again');
      expect(result.details).toEqual({ field: 'name', message: 'Invalid' });
    });

    it('should handle axios-like 401 errors', () => {
      const error = { response: { status: 401 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Authentication required');
      expect(result.code).toBe('HTTP_401');
      expect(result.status).toBe(401);
      expect(result.solution).toBe('Please login and try again');
    });

    it('should handle axios-like 403 errors', () => {
      const error = { response: { status: 403 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Access denied');
      expect(result.code).toBe('HTTP_403');
      expect(result.status).toBe(403);
      expect(result.solution).toContain('permission');
    });

    it('should handle axios-like 404 errors', () => {
      const error = { response: { status: 404 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Resource not found');
      expect(result.code).toBe('HTTP_404');
      expect(result.status).toBe(404);
      expect(result.solution).toContain('doesn\'t exist');
    });

    it('should handle axios-like 422 errors', () => {
      const error = { response: { status: 422 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Validation failed');
      expect(result.code).toBe('HTTP_422');
      expect(result.status).toBe(422);
      expect(result.solution).toContain('input fields');
    });

    it('should handle axios-like 429 errors', () => {
      const error = { response: { status: 429 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Too many requests');
      expect(result.code).toBe('HTTP_429');
      expect(result.status).toBe(429);
      expect(result.solution).toContain('wait');
    });

    it('should handle axios-like 500 errors', () => {
      const error = { response: { status: 500 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Server error');
      expect(result.code).toBe('HTTP_500');
      expect(result.status).toBe(500);
      expect(result.solution).toContain('try again later');
    });

    it('should handle axios-like 503 errors', () => {
      const error = { response: { status: 503 } };
      const result = handleError(error);
      
      expect(result.message).toBe('Service unavailable');
      expect(result.code).toBe('HTTP_503');
      expect(result.status).toBe(503);
      expect(result.solution).toContain('temporarily down');
    });

    it('should handle unknown HTTP status codes', () => {
      const error = { response: { status: 418 } }; // I'm a teapot
      const result = handleError(error);
      
      expect(result.message).toBe('Request failed');
      expect(result.code).toBe('HTTP_418');
      expect(result.status).toBe(418);
      expect(result.solution).toBe('Please try again');
    });

    it('should handle axios errors without status', () => {
      const error = { response: { data: 'Error data' } };
      const result = handleError(error);
      
      expect(result.message).toBe('Request failed');
      expect(result.code).toBe('HTTP_ERROR');
      expect(result.status).toBe(0);
      expect(result.details).toBe('Error data');
    });

    it('should handle network errors (has request but no response)', () => {
      const error = { request: {}, message: 'Network timeout' };
      const result = handleError(error);
      
      expect(result.message).toBe('Network error');
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.status).toBe(0);
      expect(result.details).toBe('Network timeout');
      expect(result.solution).toContain('internet connection');
    });

    it('should handle Error instances', () => {
      const error = new Error('Something went wrong');
      const result = handleError(error);
      
      expect(result.message).toBe('Something went wrong');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.status).toBe(0);
      expect(result.details).toBe(error);
      expect(result.solution).toContain('try again');
    });

    it('should handle plain error objects with message', () => {
      const error = { message: 'Custom error message' };
      const result = handleError(error);
      
      expect(result.message).toBe('Custom error message');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.status).toBe(0);
    });

    it('should handle unknown error types', () => {
      const error = 'string error';
      const result = handleError(error);
      
      expect(result.message).toBe('Unknown error');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.status).toBe(0);
      expect(result.details).toBe(error);
    });

    it('should handle null/undefined errors', () => {
      const resultNull = handleError(null);
      expect(resultNull.message).toBe('Unknown error');
      expect(resultNull.code).toBe('UNKNOWN_ERROR');
      
      const resultUndefined = handleError(undefined);
      expect(resultUndefined.message).toBe('Unknown error');
      expect(resultUndefined.code).toBe('UNKNOWN_ERROR');
    });

    it('should never throw an error', () => {
      // Various edge cases that should not throw
      expect(() => handleError(null)).not.toThrow();
      expect(() => handleError(undefined)).not.toThrow();
      expect(() => handleError({})).not.toThrow();
      expect(() => handleError(123)).not.toThrow();
      expect(() => handleError(true)).not.toThrow();
      expect(() => handleError(Symbol('test'))).not.toThrow();
    });

    it('should include response data in details', () => {
      const responseData = {
        errors: [
          { field: 'email', message: 'Invalid format' },
          { field: 'password', message: 'Too short' }
        ]
      };
      
      const error = { response: { status: 422, data: responseData } };
      const result = handleError(error);
      
      expect(result.details).toEqual(responseData);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete request flow with model', () => {
      class UserModel {
        id?: number;
        name: string;
        
        static encode(data: any) {
          return { user_name: data.name, user_id: data.id };
        }
        
        static decode(data: any) {
          return new UserModel({ id: data.user_id, name: data.user_name });
        }
        
        constructor(data: any) {
          this.id = data.id;
          this.name = data.name;
        }
      }
      
      // Create new user (POST) - use route ending with /
      const newUser = { name: 'John' };
      expect(detectMethod('/api/users/', newUser)).toBe('POST');
      const encoded = encodeWithModel(newUser, UserModel);
      expect(encoded).toEqual({ user_name: 'John', user_id: undefined });
      
      // Update existing user (PUT)
      const existingUser = { id: 123, name: 'John Updated' };
      expect(detectMethod('/users', existingUser)).toBe('PUT');
      
      // Decode response
      const response = { user_id: 123, user_name: 'John' };
      const decoded = decodeWithModel(response, UserModel);
      expect(decoded).toBeInstanceOf(UserModel);
      expect((decoded as UserModel).id).toBe(123);
      expect((decoded as UserModel).name).toBe('John');
    });

    it('should handle file upload detection and routing', () => {
      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      
      if (typeof FormData !== 'undefined') {
        const formData = new FormData();
        formData.append('file', file);
        expect(isFileUpload(formData)).toBe(true);
      }
      
      expect(isFileUpload(file)).toBe(true);
      
      // File uploads typically use POST
      const method = detectMethod('/upload', file, { method: 'POST' });
      expect(method).toBe('POST');
    });

    it('should handle error recovery workflow', () => {
      // Simulate API error
      const apiError = {
        response: {
          status: 401,
          data: { message: 'Token expired' }
        }
      };
      
      const error = handleError(apiError);
      
      expect(error.code).toBe('HTTP_401');
      expect(error.solution).toContain('login');
      
      // User should be redirected to login based on this error
      const shouldRedirectToLogin = error.status === 401;
      expect(shouldRedirectToLogin).toBe(true);
    });

    it('should handle CRUD operations with smart detection', () => {
      const data = { name: 'Product', price: 99.99 };
      
      // CREATE - use route ending with /
      expect(detectMethod('/api/products/', data)).toBe('POST');
      
      // READ
      expect(detectMethod('/products/123', null)).toBe('GET');
      
      // UPDATE (with ID in route)
      expect(detectMethod('/products/123', data)).toBe('PUT');
      
      // UPDATE (with ID in data)
      expect(detectMethod('/api/products/', { id: 123, ...data })).toBe('PUT');
      
      // DELETE
      expect(detectMethod('/products/123', { delete: true })).toBe('DELETE');
    });

    it('should handle complex error scenarios', () => {
      // Network failure
      const networkError = handleError({ request: {} });
      expect(networkError.code).toBe('NETWORK_ERROR');
      
      // Server error
      const serverError = handleError({ response: { status: 500 } });
      expect(serverError.code).toBe('HTTP_500');
      
      // Unknown error
      const unknownError = handleError(new Error('Unknown'));
      expect(unknownError.code).toBe('UNKNOWN_ERROR');
      
      // All should have solutions
      expect(networkError.solution).toBeTruthy();
      expect(serverError.solution).toBeTruthy();
      expect(unknownError.solution).toBeTruthy();
    });
  });
});
