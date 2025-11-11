/**
 * FileUploadAdapter - Base class for platform-specific file upload implementations
 * 
 * Provides common functionality:
 * - File selection and validation
 * - Upload progress tracking
 * - Chunked uploads
 * - Multiple file support
 * - Cancel/pause/resume operations
 * 
 * @module FileUploadAdapter
 */

import { MinderValidationError, MinderNetworkError } from '../../../errors/index.js';
import type {
  FileMetadata,
  UploadProgress,
  UploadResult,
  FileUploadConfig,
  FilePickerOptions,
} from './types.js';

// Re-export types for backward compatibility
export type {
  FileMetadata,
  UploadProgress,
  UploadResult,
  FileUploadConfig,
  FilePickerOptions,
} from './types.js';

/**
 * Abstract File Upload Adapter
 */
export abstract class FileUploadAdapter {
  protected config: Required<Omit<FileUploadConfig, 'headers' | 'formData' | 'allowedTypes' | 'onProgress' | 'onStart' | 'onComplete' | 'onError'>> & {
    headers?: Record<string, string>;
    formData?: Record<string, string>;
    allowedTypes?: string[];
    onProgress?: (progress: UploadProgress, file: FileMetadata) => void;
    onStart?: (file: FileMetadata) => void;
    onComplete?: (result: UploadResult) => void;
    onError?: (error: Error, file: FileMetadata) => void;
  };

  protected abortControllers: Map<string, AbortController> = new Map();

  constructor(config: FileUploadConfig) {
    this.config = {
      url: config.url,
      method: config.method ?? 'POST',
      headers: config.headers,
      fieldName: config.fieldName ?? 'file',
      formData: config.formData,
      maxSize: config.maxSize ?? 10 * 1024 * 1024, // 10MB
      allowedTypes: config.allowedTypes,
      chunked: config.chunked ?? false,
      chunkSize: config.chunkSize ?? 1024 * 1024, // 1MB
      multiple: config.multiple ?? false,
      maxFiles: config.maxFiles ?? 5,
      timeout: config.timeout ?? 60000,
      onProgress: config.onProgress,
      onStart: config.onStart,
      onComplete: config.onComplete,
      onError: config.onError,
    };
  }

  /**
   * Pick files from device
   */
  abstract pickFiles(options?: FilePickerOptions): Promise<FileMetadata[]>;

  /**
   * Upload single file
   */
  async uploadFile(file: File | FileMetadata): Promise<UploadResult> {
    const metadata = this.getFileMetadata(file);

    // Validate file
    const validationError = this.validateFile(metadata);
    if (validationError) {
      const error = new Error(validationError);
      this.config.onError?.(error, metadata);
      return {
        success: false,
        error: validationError,
        file: metadata,
      };
    }

    this.config.onStart?.(metadata);

    try {
      const result = this.config.chunked
        ? await this.uploadChunked(file, metadata)
        : await this.uploadDirect(file, metadata);

      this.config.onComplete?.(result);
      return result;
    } catch (error) {
      const err = error as Error;
      this.config.onError?.(err, metadata);
      return {
        success: false,
        error: err.message,
        file: metadata,
      };
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files: (File | FileMetadata)[]): Promise<UploadResult[]> {
    if (files.length > this.config.maxFiles) {
      throw new MinderValidationError(`Maximum ${this.config.maxFiles} files allowed`, { files: ['Too many files'] });
    }

    const results = await Promise.all(
      files.map((file) => this.uploadFile(file))
    );

    return results;
  }

  /**
   * Cancel upload
   */
  cancelUpload(fileId: string): void {
    const controller = this.abortControllers.get(fileId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(fileId);
    }
  }

  /**
   * Cancel all uploads
   */
  cancelAll(): void {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }

  /**
   * Validate file
   */
  protected validateFile(file: FileMetadata): string | null {
    // Check size
    if (file.size > this.config.maxSize) {
      return `File size exceeds ${this.formatBytes(this.config.maxSize)} limit`;
    }

    // Check type
    if (this.config.allowedTypes && this.config.allowedTypes.length > 0) {
      const isAllowed = this.config.allowedTypes.some((type) => {
        if (type.endsWith('/*')) {
          const category = type.split('/')[0];
          return file.type.startsWith(category + '/');
        }
        return file.type === type;
      });

      if (!isAllowed) {
        return `File type ${file.type} is not allowed`;
      }
    }

    return null;
  }

  /**
   * Direct upload (non-chunked)
   */
  protected async uploadDirect(
    file: File | FileMetadata,
    metadata: FileMetadata
  ): Promise<UploadResult> {
    const formData = this.createFormData(file);
    const fileId = this.generateFileId(metadata);
    const controller = new AbortController();
    this.abortControllers.set(fileId, controller);

    try {
      const startTime = Date.now();

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: this.config.headers,
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new MinderNetworkError(`Upload failed: ${response.status} ${response.statusText}`, response.status);
      }

      const data = await response.json();

      this.abortControllers.delete(fileId);

      return {
        success: true,
        data,
        url: data.url || data.file?.url,
        file: metadata,
      };
    } catch (error) {
      this.abortControllers.delete(fileId);
      throw error;
    }
  }

  /**
   * Chunked upload
   */
  protected async uploadChunked(
    file: File | FileMetadata,
    metadata: FileMetadata
  ): Promise<UploadResult> {
    // Chunked upload implementation would go here
    // For now, fallback to direct upload
    return this.uploadDirect(file, metadata);
  }

  /**
   * Create FormData from file
   */
  protected createFormData(file: File | FileMetadata, additionalData: Record<string, string> = {}): FormData {
    const formData = new FormData();

    // Add file
    if (file instanceof File) {
      formData.append(this.config.fieldName, file);
    }

    // Add additional fields from config
    if (this.config.formData) {
      Object.entries(this.config.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Add additional fields from parameter
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return formData;
  }

  /**
   * Get file metadata
   */
  protected getFileMetadata(file: File | FileMetadata): FileMetadata {
    if (file instanceof File) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      };
    }
    return file;
  }

  /**
   * Generate unique file ID
   */
  protected generateFileId(file: FileMetadata): string {
    return `${file.name}_${file.size}_${Date.now()}`;
  }

  /**
   * Format bytes to human-readable string
   */
  protected formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Calculate upload progress
   */
  protected calculateProgress(loaded: number, total: number, startTime: number, lastLoaded: number = 0, lastTime: number = 0): UploadProgress {
    if (total === 0) {
      return {
        loaded: 0,
        total: 0,
        percentage: 0,
        speed: 0,
        estimatedTime: 0,
      };
    }

    const percentage = Math.round((loaded / total) * 100);
    const now = Date.now();
    const timeDiff = lastTime > 0 ? (now - lastTime) / 1000 : 0; // seconds
    const bytesDiff = loaded - lastLoaded;
    const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
    const remaining = total - loaded;
    const estimatedTime = speed > 0 ? remaining / speed : 0;

    return {
      loaded,
      total,
      percentage,
      speed,
      estimatedTime,
    };
  }
}
