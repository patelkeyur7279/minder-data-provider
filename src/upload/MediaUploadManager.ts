/**
 * 📁 MediaUploadManager - Production-ready file upload with progress tracking
 * 
 * Features:
 * - ✅ File upload with progress tracking
 * - ✅ Image optimization (resize, format conversion)
 * - ✅ Multiple file formats support
 * - ✅ Chunked uploads for large files
 * - ✅ Retry logic for failed uploads
 * - ✅ TypeScript-first with full type safety
 * - ✅ Cancellable uploads
 * 
 * @example
 * const uploadManager = new MediaUploadManager(config, apiClient);
 * 
 * const result = await uploadManager.uploadFile(file, {
 *   onProgress: (percent) => console.log(`${percent}% uploaded`)
 * });
 */

import type { MinderConfig, MediaUploadResult } from '../core/types.js';
import type { ApiClient } from '../core/ApiClient.js';
import type { DebugManager } from '../debug/DebugManager.js';
import { DebugLogType } from '../constants/enums.js';
import { HttpMethod } from '../constants/enums.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  estimatedTimeRemaining?: number; // seconds
}

export interface UploadOptions {
  /**
   * Progress callback
   */
  onProgress?: (progress: UploadProgress) => void;

  /**
   * Image optimization options
   */
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill';
  };

  /**
   * Convert image format
   */
  format?: 'jpeg' | 'png' | 'webp';

  /**
   * Image quality (0-100)
   */
  quality?: number;

  /**
   * Upload endpoint override
   */
  endpoint?: string;

  /**
   * Custom headers
   */
  headers?: Record<string, string>;

  /**
   * Chunked upload settings
   */
  chunked?: {
    enabled: boolean;
    chunkSize?: number; // bytes, default 1MB
  };

  /**
   * Retry settings
   */
  retry?: {
    attempts?: number;
    delay?: number; // ms
  };
}

interface UploadState {
  file: File;
  progress: UploadProgress;
  startTime: number;
  controller: AbortController;
}

// ============================================================================
// MEDIA UPLOAD MANAGER
// ============================================================================

export class MediaUploadManager {
  private config: MinderConfig;
  private apiClient: ApiClient;
  private debugManager?: DebugManager;
  private activeUploads: Map<string, UploadState> = new Map();

  constructor(
    config: MinderConfig,
    apiClient: ApiClient,
    debugManager?: DebugManager
  ) {
    this.config = config;
    this.apiClient = apiClient;
    this.debugManager = debugManager;
  }

  // ============================================================================
  // UPLOAD METHODS
  // ============================================================================

  /**
   * Upload a file
   */
  async uploadFile(
    file: File,
    options: UploadOptions = {}
  ): Promise<MediaUploadResult> {
    const uploadId = this.generateUploadId(file);
    
    try {
      this.log(`Starting upload: ${file.name} (${this.formatBytes(file.size)})`);

      // Check if chunked upload is needed
      const shouldUseChunked = options.chunked?.enabled && 
                               file.size > (options.chunked.chunkSize || 1024 * 1024);

      if (shouldUseChunked) {
        return await this.uploadChunked(file, options, uploadId);
      } else {
        return await this.uploadDirect(file, options, uploadId);
      }

    } catch (error) {
      this.log(`❌ Upload failed: ${file.name}`, error);
      this.activeUploads.delete(uploadId);
      throw error;
    }
  }

  /**
   * Upload image with optimization
   */
  async uploadImage(
    file: File,
    options: UploadOptions = {}
  ): Promise<MediaUploadResult> {
    // Validate image type
    if (!file.type.startsWith('image/')) {
      throw new Error(`File is not an image: ${file.type}`);
    }

    this.log(`Uploading image: ${file.name}`);

    // Optimize image if options provided
    let processedFile = file;
    if (options.resize || options.format || options.quality) {
      processedFile = await this.optimizeImage(file, options);
    }

    return await this.uploadFile(processedFile, options);
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple(
    files: File[],
    options: UploadOptions = {}
  ): Promise<MediaUploadResult[]> {
    this.log(`Uploading ${files.length} files...`);

    const results = await Promise.all(
      files.map(file => this.uploadFile(file, options))
    );

    this.log(`✅ All ${files.length} files uploaded successfully`);
    return results;
  }

  // ============================================================================
  // DIRECT UPLOAD
  // ============================================================================

  /**
   * Direct upload (single request)
   */
  private async uploadDirect(
    file: File,
    options: UploadOptions,
    uploadId: string
  ): Promise<MediaUploadResult> {
    const controller = new AbortController();
    const startTime = Date.now();

    // Track upload state
    this.activeUploads.set(uploadId, {
      file,
      progress: { loaded: 0, total: file.size, percentage: 0 },
      startTime,
      controller
    });

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);

    // Add metadata
    formData.append('filename', file.name);
    formData.append('size', file.size.toString());
    formData.append('type', file.type);

    const endpoint = options.endpoint || this.config.routes?.upload?.url || '/upload';

    try {
      // Use native fetch for upload progress tracking
      const response = await this.uploadWithProgress(
        `${this.config.apiBaseUrl}${endpoint}`,
        formData,
        controller,
        (progress) => {
          const state = this.activeUploads.get(uploadId);
          if (state) {
            state.progress = progress;
            options.onProgress?.(progress);
          }
        },
        options.headers
      );

      const result: MediaUploadResult = await response.json();

      this.log(`✅ Upload complete: ${file.name}`);
      this.activeUploads.delete(uploadId);

      return result;

    } catch (error) {
      // Retry if configured
      if (options.retry && options.retry.attempts && options.retry.attempts > 0) {
        this.log(`Retrying upload (${options.retry.attempts} attempts left)...`);
        await this.delay(options.retry.delay || 1000);
        
        return this.uploadDirect(file, {
          ...options,
          retry: {
            attempts: options.retry.attempts - 1,
            delay: options.retry.delay
          }
        }, uploadId);
      }

      throw error;
    }
  }

  // ============================================================================
  // CHUNKED UPLOAD
  // ============================================================================

  /**
   * Chunked upload for large files
   */
  private async uploadChunked(
    file: File,
    options: UploadOptions,
    uploadId: string
  ): Promise<MediaUploadResult> {
    const chunkSize = options.chunked?.chunkSize || 1024 * 1024; // 1MB default
    const totalChunks = Math.ceil(file.size / chunkSize);

    this.log(`Chunked upload: ${file.name} (${totalChunks} chunks)`);

    const controller = new AbortController();
    const startTime = Date.now();

    this.activeUploads.set(uploadId, {
      file,
      progress: { loaded: 0, total: file.size, percentage: 0 },
      startTime,
      controller
    });

    const endpoint = options.endpoint || this.config.routes?.upload?.url || '/upload';

    try {
      // Initialize chunked upload - use direct HTTP
      const initFormData = new FormData();
      initFormData.append('filename', file.name);
      initFormData.append('size', file.size.toString());
      initFormData.append('type', file.type);
      initFormData.append('chunks', totalChunks.toString());

      const initUrl = `${this.config.apiBaseUrl}${endpoint}/init`;
      const initResponse = await this.uploadWithProgress(
        initUrl,
        initFormData,
        controller,
        () => {}, // No progress for init
        options.headers
      );

      const initData = await initResponse.json();
      const sessionId = initData.sessionId;

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('sessionId', sessionId);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());

        await this.uploadWithProgress(
          `${this.config.apiBaseUrl}${endpoint}/chunk`,
          formData,
          controller,
          (chunkProgress) => {
            // Calculate overall progress
            const loaded = start + (chunkProgress.loaded);
            const percentage = (loaded / file.size) * 100;
            const progress: UploadProgress = {
              loaded,
              total: file.size,
              percentage,
              speed: chunkProgress.speed,
              estimatedTimeRemaining: chunkProgress.estimatedTimeRemaining
            };

            const state = this.activeUploads.get(uploadId);
            if (state) {
              state.progress = progress;
              options.onProgress?.(progress);
            }
          },
          options.headers
        );

        this.log(`Chunk ${i + 1}/${totalChunks} uploaded`);
      }

      // Finalize upload
      const finalizeFormData = new FormData();
      finalizeFormData.append('sessionId', sessionId);

      const finalizeUrl = `${this.config.apiBaseUrl}${endpoint}/finalize`;
      const finalizeResponse = await this.uploadWithProgress(
        finalizeUrl,
        finalizeFormData,
        controller,
        () => {}, // No progress for finalize
        options.headers
      );

      const finalData = await finalizeResponse.json();

      this.log(`✅ Chunked upload complete: ${file.name}`);
      this.activeUploads.delete(uploadId);

      return finalData;

    } catch (error) {
      this.log(`❌ Chunked upload failed: ${file.name}`, error);
      this.activeUploads.delete(uploadId);
      throw error;
    }
  }

  // ============================================================================
  // IMAGE OPTIMIZATION
  // ============================================================================

  /**
   * Optimize image (resize, convert format, compress)
   */
  private async optimizeImage(
    file: File,
    options: UploadOptions
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions
        if (options.resize) {
          const targetWidth = options.resize.width;
          const targetHeight = options.resize.height;
          const fit = options.resize.fit || 'contain';

          if (targetWidth && targetHeight) {
            if (fit === 'cover') {
              const ratio = Math.max(targetWidth / width, targetHeight / height);
              width = width * ratio;
              height = height * ratio;
            } else if (fit === 'contain') {
              const ratio = Math.min(targetWidth / width, targetHeight / height);
              width = width * ratio;
              height = height * ratio;
            } else {
              width = targetWidth;
              height = targetHeight;
            }
          } else if (targetWidth) {
            const ratio = targetWidth / width;
            width = targetWidth;
            height = height * ratio;
          } else if (targetHeight) {
            const ratio = targetHeight / height;
            height = targetHeight;
            width = width * ratio;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        const format = options.format || 'jpeg';
        const quality = (options.quality || 90) / 100;
        const mimeType = `image/${format}`;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }

            const optimizedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, `.${format}`),
              { type: mimeType }
            );

            this.log(`Image optimized: ${file.size} → ${optimizedFile.size} bytes`);
            resolve(optimizedFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = URL.createObjectURL(file);
    });
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

  /**
   * Upload with progress tracking using XMLHttpRequest
   */
  private uploadWithProgress(
    url: string,
    formData: FormData,
    controller: AbortController,
    onProgress: (progress: UploadProgress) => void,
    headers?: Record<string, string>
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // seconds
          const loadedDiff = event.loaded - lastLoaded;
          const speed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
          const remaining = event.total - event.loaded;
          const estimatedTimeRemaining = speed > 0 ? remaining / speed : 0;

          const progress: UploadProgress = {
            loaded: event.loaded,
            total: event.total,
            percentage: (event.loaded / event.total) * 100,
            speed,
            estimatedTimeRemaining
          };

          onProgress(progress);

          lastLoaded = event.loaded;
          lastTime = now;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText
          }));
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Handle cancellation
      controller.signal.addEventListener('abort', () => {
        xhr.abort();
      });

      xhr.open('POST', url);

      // Set headers
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(formData);
    });
  }

  // ============================================================================
  // UPLOAD CONTROL
  // ============================================================================

  /**
   * Cancel upload
   */
  cancelUpload(uploadId: string): void {
    const state = this.activeUploads.get(uploadId);
    if (state) {
      state.controller.abort();
      this.activeUploads.delete(uploadId);
      this.log(`Upload cancelled: ${state.file.name}`);
    }
  }

  /**
   * Cancel all uploads
   */
  cancelAll(): void {
    this.activeUploads.forEach((state, uploadId) => {
      this.cancelUpload(uploadId);
    });
  }

  /**
   * Get upload progress
   */
  getProgress(uploadId: string): UploadProgress | null {
    const state = this.activeUploads.get(uploadId);
    return state ? state.progress : null;
  }

  /**
   * Get all active uploads
   */
  getActiveUploads(): Array<{ id: string; file: File; progress: UploadProgress }> {
    const uploads: Array<{ id: string; file: File; progress: UploadProgress }> = [];
    this.activeUploads.forEach((state, id) => {
      uploads.push({
        id,
        file: state.file,
        progress: state.progress
      });
    });
    return uploads;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate upload ID
   */
  private generateUploadId(file: File): string {
    return `${file.name}-${file.size}-${Date.now()}`;
  }

  /**
   * Format bytes to human-readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: any): void {
    if (this.debugManager) {
      this.debugManager.log(DebugLogType.UPLOAD, message, data);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[Upload] ${message}`, data || '');
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.cancelAll();
    this.log('MediaUploadManager destroyed');
  }
}

/**
 * Create upload manager instance
 */
export function createUploadManager(
  config: MinderConfig,
  apiClient: ApiClient,
  debugManager?: DebugManager
): MediaUploadManager {
  return new MediaUploadManager(config, apiClient, debugManager);
}
