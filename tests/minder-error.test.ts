/**
 * Tests for MinderError and related error classes
 * Coverage improvement for src/errors/MinderError.ts (currently 49%)
 */

import {
  MinderError,
  MinderConfigError,
  MinderNetworkError,
  MinderAuthError,
  MinderValidationError,
  MinderStorageError,
  MinderTimeoutError,
  MinderOfflineError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from '../src/errors/MinderError';

describe('MinderError', () => {
  describe('Basic functionality', () => {
    it('should create error with message and code', () => {
      const error = new MinderError('Test error', 'TEST_ERROR');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('MinderError');
    });

    it('should include status code when provided', () => {
      const error = new MinderError('Test error', 'TEST_ERROR', 500);

      expect(error.statusCode).toBe(500);
    });

    it('should include context when provided', () => {
      const context = { userId: '123', action: 'test' };
      const error = new MinderError('Test error', 'TEST_ERROR', undefined, context);

      expect(error.context).toEqual(context);
    });

    it('should maintain proper stack trace', () => {
      const error = new MinderError('Test error', 'TEST_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MinderError');
    });
  });

  describe('Suggestions', () => {
    it('should add suggestions', () => {
      const error = new MinderError('Test error', 'TEST_ERROR');
      
      error.addSuggestion({
        message: 'Try this',
        action: 'Do something',
        link: 'https://docs.example.com',
      });

      expect(error.suggestions).toHaveLength(1);
      expect(error.suggestions[0].message).toBe('Try this');
    });

    it('should chain multiple suggestions', () => {
      const error = new MinderError('Test error', 'TEST_ERROR')
        .addSuggestion({ message: 'First suggestion' })
        .addSuggestion({ message: 'Second suggestion' });

      expect(error.suggestions).toHaveLength(2);
    });

    it('should return this for chaining', () => {
      const error = new MinderError('Test error', 'TEST_ERROR');
      const result = error.addSuggestion({ message: 'Test' });

      expect(result).toBe(error);
    });
  });

  describe('Serialization', () => {
    it('should convert to JSON', () => {
      const error = new MinderError('Test error', 'TEST_ERROR', 404, { detail: 'test' })
        .addSuggestion({ message: 'Fix it' });

      const json = error.toJSON();

      expect(json.name).toBe('MinderError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.statusCode).toBe(404);
      expect(json.context).toEqual({ detail: 'test' });
      expect(json.suggestions).toHaveLength(1);
    });

    it('should convert to string without suggestions', () => {
      const error = new MinderError('Test error', 'TEST_ERROR');

      const str = error.toString();

      expect(str).toBe('MinderError: Test error (TEST_ERROR)');
    });

    it('should convert to string with suggestions', () => {
      const error = new MinderError('Test error', 'TEST_ERROR')
        .addSuggestion({
          message: 'Try this',
          action: 'Do something',
          link: 'https://docs.example.com',
        });

      const str = error.toString();

      expect(str).toContain('MinderError: Test error (TEST_ERROR)');
      expect(str).toContain('Suggestions:');
      expect(str).toContain('1. Try this');
      expect(str).toContain('Action: Do something');
      expect(str).toContain('Docs: https://docs.example.com');
    });

    it('should format multiple suggestions', () => {
      const error = new MinderError('Test error', 'TEST_ERROR')
        .addSuggestion({ message: 'First' })
        .addSuggestion({ message: 'Second', action: 'Act' });

      const str = error.toString();

      expect(str).toContain('1. First');
      expect(str).toContain('2. Second');
      expect(str).toContain('Action: Act');
    });
  });
});

describe('MinderConfigError', () => {
  it('should create config error', () => {
    const error = new MinderConfigError('Invalid config');

    expect(error.name).toBe('MinderConfigError');
    expect(error.message).toBe('Invalid config');
    expect(error.code).toBe('CONFIG_ERROR');
  });

  it('should include config path', () => {
    const error = new MinderConfigError('Invalid config', 'auth.tokenKey');

    expect(error.configPath).toBe('auth.tokenKey');
    expect(error.context?.configPath).toBe('auth.tokenKey');
  });

  it('should add suggestion when config path provided', () => {
    const error = new MinderConfigError('Invalid config', 'auth.tokenKey');

    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].message).toContain('auth.tokenKey');
  });

  it('should add generic suggestion when no config path', () => {
    const error = new MinderConfigError('Invalid config');

    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].message).toContain('configuration settings');
  });

  it('should support custom error code', () => {
    const error = new MinderConfigError('Invalid config', 'path', 'CUSTOM_CODE');

    expect(error.code).toBe('CUSTOM_CODE');
  });

  it('should include additional context', () => {
    const error = new MinderConfigError('Invalid config', 'path', 'CODE', { extra: 'data' });

    expect(error.context?.extra).toBe('data');
    expect(error.context?.configPath).toBe('path');
  });
});

describe('MinderNetworkError', () => {
  it('should create network error', () => {
    const error = new MinderNetworkError('Request failed', 500);

    expect(error.name).toBe('MinderNetworkError');
    expect(error.message).toBe('Request failed');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('should include response data', () => {
    const response = { error: 'Server error' };
    const error = new MinderNetworkError('Request failed', 500, response);

    expect(error.response).toEqual(response);
  });

  it('should add 400 Bad Request suggestions', () => {
    const error = new MinderNetworkError('Bad request', 400);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Bad Request');
  });

  it('should add 401 Unauthorized suggestions', () => {
    const error = new MinderNetworkError('Unauthorized', 401);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Unauthorized');
  });

  it('should add 403 Forbidden suggestions', () => {
    const error = new MinderNetworkError('Forbidden', 403);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Forbidden');
  });

  it('should add 404 Not Found suggestions', () => {
    const error = new MinderNetworkError('Not found', 404);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('not found');
  });

  it('should add 429 Rate Limit suggestions', () => {
    const error = new MinderNetworkError('Too many requests', 429);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Rate limit');
  });

  it('should add 500 Server Error suggestions', () => {
    const error = new MinderNetworkError('Server error', 500);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Server');
  });

  it('should add 503 Service Unavailable suggestions', () => {
    const error = new MinderNetworkError('Service unavailable', 503);

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Service Unavailable');
  });

  it('should handle unknown status codes', () => {
    const error = new MinderNetworkError('Unknown error', 999);

    // Should still create the error without crashing
    expect(error.statusCode).toBe(999);
  });
});

describe('MinderAuthError', () => {
  it('should create auth error', () => {
    const error = new MinderAuthError('Auth failed');

    expect(error.name).toBe('MinderAuthError');
    expect(error.message).toBe('Auth failed');
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.statusCode).toBe(401);
  });

  it('should support custom error code', () => {
    const error = new MinderAuthError('Auth failed', 'CUSTOM_AUTH_ERROR');

    expect(error.code).toBe('CUSTOM_AUTH_ERROR');
  });

  it('should add suggestions for auth errors', () => {
    const error = new MinderAuthError('Auth failed');

    expect(error.suggestions.length).toBeGreaterThan(0);
    expect(error.suggestions[0].message).toContain('Authentication failed');
  });
});

describe('MinderValidationError', () => {
  it('should create validation error', () => {
    const error = new MinderValidationError('Validation failed');

    expect(error.name).toBe('MinderValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
  });

  it('should include validation errors', () => {
    const errors = {
      email: ['Invalid email format'],
      password: ['Too short', 'Must contain numbers'],
    };
    const error = new MinderValidationError('Validation failed', errors);

    expect(error.context?.fields).toEqual(errors);
  });

  it('should add suggestions for each validation error', () => {
    const errors = {
      email: ['Invalid email'],
      password: ['Too short'],
    };
    const error = new MinderValidationError('Validation failed', errors);

    expect(error.suggestions.length).toBeGreaterThan(0);
    const suggestionText = error.suggestions.map(s => s.message).join(' ');
    expect(suggestionText).toContain('email');
    expect(suggestionText).toContain('password');
  });

  it('should handle empty validation errors', () => {
    const error = new MinderValidationError('Validation failed', {});

    expect(error.context?.fields).toEqual({});
  });
});

describe('MinderStorageError', () => {
  it('should create storage error', () => {
    const error = new MinderStorageError('Storage failed');

    expect(error.name).toBe('MinderStorageError');
    expect(error.message).toBe('Storage failed');
    expect(error.code).toBe('STORAGE_ERROR');
  });

  it('should support custom error code', () => {
    const error = new MinderStorageError('Storage failed', 'CUSTOM_STORAGE_ERROR');

    expect(error.code).toBe('CUSTOM_STORAGE_ERROR');
  });

  it('should include context', () => {
    const error = new MinderStorageError('Storage failed', 'STORAGE_ERROR', { key: 'user:123' });

    expect(error.context?.key).toBe('user:123');
  });
});

describe('MinderTimeoutError', () => {
  it('should create timeout error', () => {
    const error = new MinderTimeoutError('Request timeout', 5000);

    expect(error.name).toBe('MinderTimeoutError');
    expect(error.message).toBe('Request timeout');
    expect(error.code).toBe('TIMEOUT_ERROR');
  });

  it('should include timeout duration', () => {
    const error = new MinderTimeoutError('Request timeout', 5000);

    expect(error.context?.timeout).toBe(5000);
  });

  it('should add suggestions for timeout errors', () => {
    const error = new MinderTimeoutError('Request timeout', 5000);

    expect(error.suggestions.length).toBeGreaterThan(0);
  });
});

describe('MinderOfflineError', () => {
  it('should create offline error', () => {
    const error = new MinderOfflineError('Network offline');

    expect(error.name).toBe('MinderOfflineError');
    expect(error.message).toBe('Network offline');
    expect(error.code).toBe('OFFLINE_ERROR');
  });

  it('should add suggestions for offline errors', () => {
    const error = new MinderOfflineError('Network offline');

    expect(error.suggestions.length).toBeGreaterThan(0);
  });
});

describe('Error utility functions', () => {
  it('should identify MinderError instances', () => {
    const minderError = new MinderError('Test', 'TEST');
    const normalError = new Error('Test');

    expect(isMinderError(minderError)).toBe(true);
    expect(isMinderError(normalError)).toBe(false);
    expect(isMinderError(null)).toBe(false);
    expect(isMinderError(undefined)).toBe(false);
  });

  it('should get error message from MinderError', () => {
    const error = new MinderError('Test message', 'TEST');

    expect(getErrorMessage(error)).toBe('Test message');
  });

  it('should get error message from regular Error', () => {
    const error = new Error('Test message');

    expect(getErrorMessage(error)).toBe('Test message');
  });

  it('should get error message from string', () => {
    expect(getErrorMessage('Test message')).toBe('Test message');
  });

  it('should get error message from unknown type', () => {
    expect(getErrorMessage({ custom: 'error' })).toBe('An unknown error occurred');
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
    expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
  });

  it('should get error code from MinderError', () => {
    const error = new MinderError('Test', 'TEST_CODE');

    expect(getErrorCode(error)).toBe('TEST_CODE');
  });

  it('should get error code from regular Error', () => {
    const error = new Error('Test');

    expect(getErrorCode(error)).toBe('Error');
  });

  it('should get error code from unknown type', () => {
    expect(getErrorCode('string error')).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
  });
});
