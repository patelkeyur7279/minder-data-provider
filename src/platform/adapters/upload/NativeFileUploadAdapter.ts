/**
 * NativeFileUploadAdapter - React Native file upload implementation
 * 
 * Uses React Native's file picker libraries.
 * 
 * @module NativeFileUploadAdapter
 */

import {
  FileUploadAdapter,
  FileUploadConfig,
  FileMetadata,
  FilePickerOptions,
  UploadResult,
} from './FileUploadAdapter.js';

/**
 * React Native File Upload Adapter
 */
export class NativeFileUploadAdapter extends FileUploadAdapter {
  constructor(config: FileUploadConfig) {
    super(config);
  }

  /**
   * Pick files using react-native-document-picker or expo-document-picker
   */
  async pickFiles(options: FilePickerOptions = {}): Promise<FileMetadata[]> {
    try {
      // Try Expo first
      const result = await this.pickWithExpo(options);
      if (result) return result;
    } catch (error) {
      // Expo not available
    }

    try {
      // Try react-native-document-picker
      const result = await this.pickWithReactNative(options);
      if (result) return result;
    } catch (error) {
      // react-native-document-picker not available
    }

    throw new Error('No file picker library available. Install expo-document-picker or react-native-document-picker');
  }

  /**
   * Pick files with Expo DocumentPicker
   */
  private async pickWithExpo(options: FilePickerOptions): Promise<FileMetadata[] | null> {
    try {
      const loadPicker = new Function('return import("expo-document-picker")');
      const DocumentPicker = await loadPicker();

      const result = await DocumentPicker.getDocumentAsync({
        type: options.accept ? (Array.isArray(options.accept) ? options.accept : [options.accept]) : '*/*',
        multiple: options.multiple ?? this.config.multiple,
      });

      if (result.type === 'cancel') {
        return [];
      }

      // Expo returns different structure for single vs multiple
      const files = Array.isArray(result.output) ? result.output : [result];

      return files.map((file: any) => ({
        name: file.name,
        size: file.size,
        type: file.mimeType || 'application/octet-stream',
        uri: file.uri,
      }));
    } catch (error) {
      return null;
    }
  }

  /**
   * Pick files with react-native-document-picker
   */
  private async pickWithReactNative(options: FilePickerOptions): Promise<FileMetadata[] | null> {
    try {
      const loadPicker = new Function('return import("react-native-document-picker")');
      const DocumentPicker = await loadPicker();

      const result = options.multiple
        ? await DocumentPicker.pickMultiple({
            type: options.accept ? (Array.isArray(options.accept) ? options.accept : [options.accept]) : [DocumentPicker.types.allFiles],
          })
        : await DocumentPicker.pick({
            type: options.accept ? (Array.isArray(options.accept) ? options.accept : [options.accept]) : [DocumentPicker.types.allFiles],
          });

      const files = Array.isArray(result) ? result : [result];

      return files.map((file: any) => ({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uri: file.uri,
      }));
    } catch (error) {
      if ((error as any).code === 'DOCUMENT_PICKER_CANCELED') {
        return [];
      }
      return null;
    }
  }

  /**
   * Upload file (override for React Native)
   */
  async uploadFile(file: FileMetadata): Promise<UploadResult> {
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
      const result = await this.uploadNative(file, metadata);
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
   * Upload using React Native fetch with FormData
   */
  private async uploadNative(
    file: FileMetadata,
    metadata: FileMetadata
  ): Promise<UploadResult> {
    const formData = new FormData();

    // Add file (React Native FormData accepts uri)
    (formData as any).append(this.config.fieldName, {
      uri: file.uri,
      name: file.name,
      type: file.type,
    });

    // Add additional fields
    if (this.config.formData) {
      Object.entries(this.config.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await fetch(this.config.url, {
      method: this.config.method,
      headers: {
        ...this.config.headers,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
      url: data.url || data.file?.url,
      file: metadata,
    };
  }

  /**
   * Check if file picker is available
   */
  static async isSupported(): Promise<boolean> {
    try {
      // Check for Expo
      const loadExpo = new Function('return import("expo-document-picker")');
      await loadExpo();
      return true;
    } catch {
      try {
        // Check for react-native-document-picker
        const loadRN = new Function('return import("react-native-document-picker")');
        await loadRN();
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Create Native file upload adapter
 */
export function createNativeFileUpload(config: FileUploadConfig): NativeFileUploadAdapter {
  return new NativeFileUploadAdapter(config);
}
