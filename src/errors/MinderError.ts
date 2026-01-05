/**
 * Custom Error Classes for Minder Data Provider
 * 
 * Provides typed, structured errors with error codes for better error handling
 */

export interface ErrorSuggestion {
  message: string;
  action?: string;
  link?: string;
}

/**
 * Base error class for all Minder errors
 */
export class MinderError extends Error {
  public suggestions: ErrorSuggestion[] = [];

  public status: number;

  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MinderError';
    this.status = statusCode || 0;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  addSuggestion(suggestion: ErrorSuggestion): this {
    this.suggestions.push(suggestion);
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      suggestions: this.suggestions,
    };
  }

  toString(): string {
    let str = `${this.name}: ${this.message} (${this.code})`;
    if (this.suggestions.length > 0) {
      str += '\n\nSuggestions:';
      this.suggestions.forEach((s, i) => {
        str += `\n${i + 1}. ${s.message}`;
        if (s.action) str += `\n   Action: ${s.action}`;
        if (s.link) str += `\n   Docs: ${s.link}`;
      });
    }
    return str;
  }
}

/**
 * Configuration errors
 */
export class MinderConfigError extends MinderError {
  constructor(
    message: string,
    public configPath?: string,
    code: string = 'CONFIG_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, undefined, { ...context, configPath });
    this.name = 'MinderConfigError';

    // Add helpful suggestions
    if (configPath) {
      this.addSuggestion({
        message: `Invalid configuration at: ${configPath}`,
        action: 'Check your configuration object for typos or incorrect values',
        link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_REFERENCE.md'
      });
    } else {
      this.addSuggestion({
        message: 'Review your configuration settings',
        action: 'Ensure all required configuration fields are provided',
        link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md'
      });
    }
  }
}

/**
 * Network/API errors
 */
export class MinderNetworkError extends MinderError {
  constructor(
    message: string,
    statusCode: number,
    public response?: unknown,
    public url?: string,
    public method?: string,
    code: string = 'NETWORK_ERROR'
  ) {
    super(message, code, statusCode, { response, url, method });
    this.name = 'MinderNetworkError';

    // Add helpful suggestions based on status code
    this.addContextualSuggestions();
  }

  private addContextualSuggestions(): void {
    const { statusCode, url, method } = this;

    switch (statusCode) {
      case 400:
        this.addSuggestion({
          message: 'Bad Request - Check your request payload and parameters',
          action: 'Review the request data format and required fields',
          link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/API_REFERENCE.md'
        });
        break;

      case 401:
        this.addSuggestion({
          message: 'Unauthorized - Authentication required or token expired',
          action: 'Check if you\'re logged in and your token is valid',
          link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#authentication'
        });
        break;

      case 403:
        this.addSuggestion({
          message: 'Forbidden - You don\'t have permission to access this resource',
          action: 'Verify your user role and permissions',
        });
        break;

      case 404:
        this.addSuggestion({
          message: `Resource not found: ${method} ${url}`,
          action: 'Check if the endpoint URL is correct and the resource exists',
        });
        break;

      case 422:
        this.addSuggestion({
          message: 'Validation Error - Request data doesn\'t meet server requirements',
          action: 'Check validation errors in response and fix the data',
        });
        break;

      case 429:
        this.addSuggestion({
          message: 'Too Many Requests - Rate limit exceeded',
          action: 'Wait before retrying or implement request throttling',
          link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/PERFORMANCE_GUIDE.md#rate-limiting'
        });
        break;

      case 500:
        this.addSuggestion({
          message: 'Server Error - Something went wrong on the server',
          action: 'Contact API support or try again later',
        });
        break;

      case 503:
        this.addSuggestion({
          message: 'Service Unavailable - Server is temporarily down',
          action: 'Wait a few minutes and retry',
        });
        break;

      case 0:
        this.addSuggestion({
          message: 'Network Error - Failed to connect to server',
          action: 'Check your internet connection and server availability',
        });
        this.addSuggestion({
          message: 'Possible CORS issue if calling from browser',
          action: 'Verify CORS settings on your API server',
          link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#cors'
        });
        break;
    }
  }
}

/**
 * Validation errors
 */
export class MinderValidationError extends MinderError {
  constructor(
    message: string,
    public fields?: Record<string, string[]>,
    code: string = 'VALIDATION_ERROR'
  ) {
    super(message, code, 400, { fields });
    this.name = 'MinderValidationError';

    // Add field-specific suggestions
    if (fields && Object.keys(fields).length > 0) {
      const fieldCount = Object.keys(fields).length;
      const fieldNames = Object.keys(fields).join(', ');
      this.addSuggestion({
        message: `${fieldCount} field(s) failed validation: ${fieldNames}`,
        action: 'Fix the validation errors for each field',
      });

      // Add specific error details
      Object.entries(fields).forEach(([field, errors]) => {
        errors.forEach(error => {
          this.addSuggestion({
            message: `${field}: ${error}`,
          });
        });
      });
    }
  }
}

/**
 * Authentication errors
 */
export class MinderAuthError extends MinderError {
  constructor(message: string, code: string = 'AUTH_ERROR') {
    super(message, code, 401);
    this.name = 'MinderAuthError';

    this.addSuggestion({
      message: 'Authentication failed - User is not logged in or session expired',
      action: 'Redirect user to login page or refresh authentication token',
      link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#authentication'
    });
  }
}

/**
 * Authorization errors
 */
export class MinderAuthorizationError extends MinderError {
  constructor(message: string, public requiredPermission?: string, code: string = 'AUTHORIZATION_ERROR') {
    super(message, code, 403, { requiredPermission });
    this.name = 'MinderAuthorizationError';

    if (requiredPermission) {
      this.addSuggestion({
        message: `Missing required permission: ${requiredPermission}`,
        action: 'Contact administrator to grant necessary permissions',
      });
    } else {
      this.addSuggestion({
        message: 'Insufficient permissions to access this resource',
        action: 'Verify your user role has the correct permissions',
      });
    }
  }
}

/**
 * Storage errors
 */
export class MinderStorageError extends MinderError {
  constructor(message: string, code: string = 'STORAGE_ERROR', context?: Record<string, unknown>) {
    super(message, code, undefined, context);
    this.name = 'MinderStorageError';
  }
}

/**
 * Platform compatibility errors
 */
export class MinderPlatformError extends MinderError {
  constructor(message: string, public platform: string, code: string = 'PLATFORM_ERROR') {
    super(message, code, undefined, { platform });
    this.name = 'MinderPlatformError';
  }
}

/**
 * Security errors
 */
export class MinderSecurityError extends MinderError {
  constructor(message: string, code: string = 'SECURITY_ERROR', context?: Record<string, unknown>) {
    super(message, code, undefined, context);
    this.name = 'MinderSecurityError';
  }
}

/**
 * Timeout errors
 */
export class MinderTimeoutError extends MinderError {
  constructor(message: string = 'Request timeout', public timeout: number, public url?: string) {
    super(message, 'TIMEOUT_ERROR', 408, { timeout, url });
    this.name = 'MinderTimeoutError';

    this.addSuggestion({
      message: `Request timed out after ${timeout}ms${url ? ` for ${url}` : ''}`,
      action: 'Increase timeout setting or check server performance',
      link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#timeout'
    });
  }
}

/**
 * Offline/connectivity errors
 */
export class MinderOfflineError extends MinderError {
  constructor(message: string = 'No network connection', public url?: string) {
    super(message, 'OFFLINE_ERROR', 0, { url });
    this.name = 'MinderOfflineError';

    this.addSuggestion({
      message: 'Device appears to be offline',
      action: 'Check internet connection and try again',
    });
    this.addSuggestion({
      message: 'Enable offline mode to cache requests',
      action: 'Configure offline support in your Minder setup',
      link: 'https://github.com/patelkeyur7279/minder-data-provider/blob/main/docs/CONFIG_GUIDE.md#offline-support'
    });
  }
}

/**
 * Plugin errors
 */
export class MinderPluginError extends MinderError {
  constructor(message: string, public pluginName: string, code: string = 'PLUGIN_ERROR') {
    super(message, code, undefined, { pluginName });
    this.name = 'MinderPluginError';
  }
}

/**
 * WebSocket errors
 */
export class MinderWebSocketError extends MinderError {
  constructor(
    message: string,
    public event?: string,
    code: string = 'WEBSOCKET_ERROR'
  ) {
    super(message, code, undefined, { event });
    this.name = 'MinderWebSocketError';
  }
}

/**
 * Upload errors
 */
export class MinderUploadError extends MinderError {
  constructor(
    message: string,
    public fileName?: string,
    code: string = 'UPLOAD_ERROR'
  ) {
    super(message, code, undefined, { fileName });
    this.name = 'MinderUploadError';
  }
}

/**
 * Type guard to check if error is a Minder error
 */
export function isMinderError(error: unknown): error is MinderError {
  return error instanceof MinderError;
}

/**
 * Extract error message safely from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Extract error code safely from any error type
 */
export function getErrorCode(error: unknown): string {
  if (isMinderError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return 'UNKNOWN_ERROR';
}
