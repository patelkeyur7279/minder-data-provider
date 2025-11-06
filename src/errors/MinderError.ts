/**
 * Custom Error Classes for Minder Data Provider
 * 
 * Provides typed, structured errors with error codes for better error handling
 */

/**
 * Base error class for all Minder errors
 */
export class MinderError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MinderError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

/**
 * Configuration errors
 */
export class MinderConfigError extends MinderError {
  constructor(message: string, code: string = 'CONFIG_ERROR', context?: Record<string, unknown>) {
    super(message, code, undefined, context);
    this.name = 'MinderConfigError';
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
    code: string = 'NETWORK_ERROR'
  ) {
    super(message, code, statusCode, { response });
    this.name = 'MinderNetworkError';
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
  }
}

/**
 * Authentication errors
 */
export class MinderAuthError extends MinderError {
  constructor(message: string, code: string = 'AUTH_ERROR') {
    super(message, code, 401);
    this.name = 'MinderAuthError';
  }
}

/**
 * Authorization errors
 */
export class MinderAuthorizationError extends MinderError {
  constructor(message: string, code: string = 'AUTHORIZATION_ERROR') {
    super(message, code, 403);
    this.name = 'MinderAuthorizationError';
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
  constructor(message: string = 'Request timeout', public timeout: number) {
    super(message, 'TIMEOUT_ERROR', 408, { timeout });
    this.name = 'MinderTimeoutError';
  }
}

/**
 * Offline/connectivity errors
 */
export class MinderOfflineError extends MinderError {
  constructor(message: string = 'No network connection') {
    super(message, 'OFFLINE_ERROR', 0);
    this.name = 'MinderOfflineError';
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
