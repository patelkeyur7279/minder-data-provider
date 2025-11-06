/**
 * Error Classes
 * 
 * Typed errors for better error handling and debugging
 */

export {
  MinderError,
  MinderConfigError,
  MinderNetworkError,
  MinderValidationError,
  MinderAuthError,
  MinderAuthorizationError,
  MinderStorageError,
  MinderPlatformError,
  MinderSecurityError,
  MinderTimeoutError,
  MinderOfflineError,
  MinderPluginError,
  MinderWebSocketError,
  MinderUploadError,
  isMinderError,
  getErrorMessage,
  getErrorCode,
} from './MinderError.js';
