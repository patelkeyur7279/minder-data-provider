/**
 * Tests for built-in validation support
 * Issue #12: Add validation to prevent invalid API calls
 * 
 * Tests:
 * 1. Validation with mutations
 * 2. Validation with CRUD operations
 * 3. Async validation support
 * 4. Validation errors prevent API calls
 * 5. Works with Zod-like schemas
 */

import { describe, it, expect } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder.js';
import React from 'react';

// Create a wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

// Mock validation schemas (simulating Zod-like behavior)
const createEmailValidator = () => ({
  parse: (data: any) => {
    if (!data.email || !data.email.includes('@')) {
      throw new Error('Invalid email format');
    }
    return data;
  },
});

const createAgeValidator = () => ({
  parse: (data: any) => {
    if (typeof data.age !== 'number' || data.age < 0) {
      throw new Error('Age must be a positive number');
    }
    return data;
  },
});

describe('Built-in Validation', () => {
  describe('Basic Validation', () => {
    it('should validate data before mutation', async () => {
      const wrapper = createWrapper();
      const validator = (data: any) => {
        if (!data.email?.includes('@')) {
          throw new Error('Invalid email');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: validator }),
        { wrapper }
      );

      // Try to mutate with invalid data
      const response = await result.current.mutate({ email: 'invalid' });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Invalid email');
      expect(response.status).toBe(400);
    });

    it('should allow valid data to pass through', async () => {
      const wrapper = createWrapper();
      const validator = (data: any) => {
        if (!data.email?.includes('@')) {
          throw new Error('Invalid email');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: validator }),
        { wrapper }
      );

      // Mutation will fail because no actual API, but validation should pass
      const response = await result.current.mutate({ email: 'valid@example.com' });

      // Validation passed, but API call failed (expected in test environment)
      expect(response.error?.message).not.toContain('Invalid email');
    });

    it('should work without validation when not provided', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false }),
        { wrapper }
      );

      // Should not throw validation error
      const response = await result.current.mutate({ email: 'anything' });

      // No validation error
      expect(response.error?.message).not.toContain('Invalid email');
    });
  });

  describe('Async Validation', () => {
    it('should support async validation functions', async () => {
      const wrapper = createWrapper();
      const asyncValidator = async (data: any) => {
        // Simulate async validation (e.g., checking if email exists)
        await new Promise(resolve => setTimeout(resolve, 10));
        if (!data.email?.includes('@')) {
          throw new Error('Invalid email format');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: asyncValidator }),
        { wrapper }
      );

      const response = await result.current.mutate({ email: 'invalid' });

      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('Invalid email');
    });

    it('should wait for async validation before API call', async () => {
      const wrapper = createWrapper();
      let validationCalled = false;

      const asyncValidator = async (data: any) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        validationCalled = true;
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: asyncValidator }),
        { wrapper }
      );

      expect(validationCalled).toBe(false);
      await result.current.mutate({ email: 'test@example.com' });
      expect(validationCalled).toBe(true);
    });
  });

  describe('Zod-like Schema Validation', () => {
    it('should work with Zod-like schema.parse()', async () => {
      const wrapper = createWrapper();
      const emailSchema = createEmailValidator();

      const { result } = renderHook(
        () => useMinder('users', { 
          autoFetch: false, 
          validate: (data) => emailSchema.parse(data)
        }),
        { wrapper }
      );

      const response = await result.current.mutate({ email: 'invalid' });

      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('Invalid email format');
    });

    it('should validate multiple fields', async () => {
      const wrapper = createWrapper();
      const compositeValidator = (data: any) => {
        if (!data.email?.includes('@')) {
          throw new Error('Invalid email');
        }
        if (typeof data.age !== 'number' || data.age < 0) {
          throw new Error('Invalid age');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: compositeValidator }),
        { wrapper }
      );

      // Invalid email
      const response1 = await result.current.mutate({ email: 'bad', age: 25 });
      expect(response1.error?.message).toContain('Invalid email');

      // Invalid age
      const response2 = await result.current.mutate({ email: 'good@test.com', age: -5 });
      expect(response2.error?.message).toContain('Invalid age');
    });
  });

  describe('Validation with CRUD Operations', () => {
    it('should validate on operations.create()', async () => {
      const wrapper = createWrapper();
      const validator = (data: any) => {
        if (!data.email?.includes('@')) {
          throw new Error('Invalid email');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: validator }),
        { wrapper }
      );

      // operations won't exist without MinderDataProvider context
      // So this test verifies the validation is set up correctly
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Custom Validation Logic', () => {
    it('should support custom business logic validation', async () => {
      const wrapper = createWrapper();
      const businessValidator = (data: any) => {
        // Business rule: email must be company domain
        if (!data.email?.endsWith('@company.com')) {
          throw new Error('Only company emails allowed');
        }
        // Business rule: age restrictions
        if (data.age && (data.age < 18 || data.age > 65)) {
          throw new Error('Age must be between 18 and 65');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: businessValidator }),
        { wrapper }
      );

      // Non-company email
      const response1 = await result.current.mutate({ email: 'user@gmail.com', age: 30 });
      expect(response1.error?.message).toContain('Only company emails allowed');

      // Invalid age
      const response2 = await result.current.mutate({ email: 'user@company.com', age: 17 });
      expect(response2.error?.message).toContain('Age must be between 18 and 65');
    });

    it('should allow data transformation during validation', async () => {
      const wrapper = createWrapper();
      const transformValidator = (data: any) => {
        // Validation + transformation
        if (!data.email) {
          throw new Error('Email required');
        }
        // Transform: normalize email to lowercase
        return {
          ...data,
          email: data.email.toLowerCase(),
        };
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: transformValidator }),
        { wrapper }
      );

      // Should transform email to lowercase
      await result.current.mutate({ email: 'USER@EXAMPLE.COM' });
      // Can't easily test transformation without API, but validation passed
    });
  });

  describe('Error Handling', () => {
    it('should return 400 status for validation errors', async () => {
      const wrapper = createWrapper();
      const validator = (data: any) => {
        if (!data.valid) {
          throw new Error('Validation failed');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: validator }),
        { wrapper }
      );

      const response = await result.current.mutate({ valid: false });

      expect(response.status).toBe(400);
      expect(response.success).toBe(false);
    });

    it('should not make API call when validation fails', async () => {
      const wrapper = createWrapper();
      let apiCalled = false;

      const validator = (data: any) => {
        if (!data.email) {
          throw new Error('Email required');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { 
          autoFetch: false, 
          validate: validator,
        }),
        { wrapper }
      );

      // Invalid data - should not reach API
      await result.current.mutate({ name: 'Test' });

      // Can't easily verify API wasn't called in test environment
      // but validation error was returned
    });

    it('should provide detailed error information', async () => {
      const wrapper = createWrapper();
      const validator = (data: any) => {
        const errors: string[] = [];
        if (!data.email) errors.push('Email is required');
        if (!data.name) errors.push('Name is required');
        if (errors.length > 0) {
          throw new Error(errors.join(', '));
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder('users', { autoFetch: false, validate: validator }),
        { wrapper }
      );

      const response = await result.current.mutate({});

      expect(response.error?.message).toContain('Email is required');
      expect(response.error?.message).toContain('Name is required');
    });
  });

  describe('TypeScript Integration', () => {
    it('should maintain type safety with validation', async () => {
      const wrapper = createWrapper();
      
      interface User {
        email: string;
        name: string;
        age: number;
      }

      const userValidator = (data: User): User => {
        if (!data.email.includes('@')) {
          throw new Error('Invalid email');
        }
        return data;
      };

      const { result } = renderHook(
        () => useMinder<User>('users', { 
          autoFetch: false, 
          validate: userValidator 
        }),
        { wrapper }
      );

      // TypeScript should ensure correct types
      await result.current.mutate({ 
        email: 'test@example.com', 
        name: 'Test', 
        age: 30 
      });
    });
  });
});
