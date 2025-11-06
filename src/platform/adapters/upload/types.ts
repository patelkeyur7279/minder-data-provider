/**
 * Type definitions for File Upload Adapter
 */

/**
 * File metadata
 */
export interface FileMetadata {
  /**
   * File name
   */
  name: string;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * MIME type
   */
  type: string;

  /**
   * Last modified timestamp
   */
  lastModified?: number;

  /**
   * File URI (for mobile)
   */
  uri?: string;
}

/**
 * Upload progress information
 */
export interface UploadProgress {
  /**
   * Bytes uploaded
   */
  loaded: number;

  /**
   * Total bytes
   */
  total: number;

  /**
   * Upload percentage (0-100)
   */
  percentage: number;

  /**
   * Upload speed in bytes/sec
   */
  speed?: number;

  /**
   * Estimated time remaining in seconds
   */
  estimatedTime?: number;
}

/**
 * Upload result
 */
export interface UploadResult {
  /**
   * Upload success
   */
  success: boolean;

  /**
   * Server response data
   */
  data?: any;

  /**
   * File URL after upload
   */
  url?: string;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * File metadata
   */
  file: FileMetadata;
}

/**
 * File upload configuration
 */
export interface FileUploadConfig {
  /**
   * Upload endpoint URL
   */
  url: string;

  /**
   * HTTP method
   * @default 'POST'
   */
  method?: 'POST' | 'PUT' | 'PATCH';

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Form field name for file
   * @default 'file'
   */
  fieldName?: string;

  /**
   * Additional form data
   */
  formData?: Record<string, string>;

  /**
   * Max file size in bytes
   * @default 10 * 1024 * 1024 (10MB)
   */
  maxSize?: number;

  /**
   * Allowed MIME types
   */
  allowedTypes?: string[];

  /**
   * Enable chunked upload
   * @default false
   */
  chunked?: boolean;

  /**
   * Chunk size in bytes
   * @default 1024 * 1024 (1MB)
   */
  chunkSize?: number;

  /**
   * Enable multiple file selection
   * @default false
   */
  multiple?: boolean;

  /**
   * Max number of files
   * @default 5
   */
  maxFiles?: number;

  /**
   * Upload timeout in ms
   * @default 60000
   */
  timeout?: number;

  /**
   * Callback on upload progress
   */
  onProgress?: (progress: UploadProgress, file: FileMetadata) => void;

  /**
   * Callback on upload start
   */
  onStart?: (file: FileMetadata) => void;

  /**
   * Callback on upload complete
   */
  onComplete?: (result: UploadResult) => void;

  /**
   * Callback on upload error
   */
  onError?: (error: Error, file: FileMetadata) => void;
}

/**
 * File picker options
 */
export interface FilePickerOptions {
  /**
   * Allow multiple file selection
   */
  multiple?: boolean;

  /**
   * Allowed MIME types
   */
  accept?: string | string[];

  /**
   * Max file size in bytes
   */
  maxSize?: number;

  /**
   * Max number of files
   */
  maxFiles?: number;

  /**
   * Capture mode for mobile cameras
   */
  capture?: 'user' | 'environment';
}
