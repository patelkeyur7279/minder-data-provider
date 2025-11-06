/**
 * ExpoFileUploadAdapter - Expo file upload implementation
 * 
 * Uses Expo's document and image picker APIs.
 * 
 * @module ExpoFileUploadAdapter
 */

import {
  FileUploadAdapter,
  FileUploadConfig,
  FileMetadata,
  FilePickerOptions,
} from './FileUploadAdapter.js';
import { MinderUploadError, MinderAuthorizationError } from '../../../errors/index.js';

/**
 * Expo File Upload Adapter
 */
export class ExpoFileUploadAdapter extends FileUploadAdapter {
  constructor(config: FileUploadConfig) {
    super(config);
  }

  /**
   * Pick files using Expo DocumentPicker or ImagePicker
   */
  async pickFiles(options: FilePickerOptions = {}): Promise<FileMetadata[]> {
    // If accept includes images, use ImagePicker
    if (options.accept && this.isImageType(options.accept)) {
      return this.pickImages(options);
    }

    // Otherwise use DocumentPicker
    return this.pickDocuments(options);
  }

  /**
   * Pick images using expo-image-picker
   */
  private async pickImages(options: FilePickerOptions): Promise<FileMetadata[]> {
    try {
      const loadImagePicker = new Function('return import("expo-image-picker")');
      const ImagePicker = await loadImagePicker();

      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw new MinderAuthorizationError('Permission to access media library denied');
      }

      const result = options.multiple
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
          });

      if (result.canceled) {
        return [];
      }

      return result.assets.map((asset: any) => ({
        name: asset.fileName || `image_${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        type: asset.type === 'image' ? 'image/jpeg' : asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      }));
    } catch (error) {
      throw new MinderUploadError(`Failed to pick images: ${(error as Error).message}`);
    }
  }

  /**
   * Pick documents using expo-document-picker
   */
  private async pickDocuments(options: FilePickerOptions): Promise<FileMetadata[]> {
    try {
      const loadDocumentPicker = new Function('return import("expo-document-picker")');
      const DocumentPicker = await loadDocumentPicker();

      const result = await DocumentPicker.getDocumentAsync({
        type: options.accept ? (Array.isArray(options.accept) ? options.accept : [options.accept]) : '*/*',
        multiple: options.multiple ?? this.config.multiple,
        copyToCacheDirectory: true,
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
      throw new MinderUploadError(`Failed to pick documents: ${(error as Error).message}`);
    }
  }

  /**
   * Check if accept type is image
   */
  private isImageType(accept: string | string[]): boolean {
    const types = Array.isArray(accept) ? accept : [accept];
    return types.some((type) => type.startsWith('image/'));
  }

  /**
   * Pick image from camera
   */
  async pickFromCamera(): Promise<FileMetadata | null> {
    try {
      const loadImagePicker = new Function('return import("expo-image-picker")');
      const ImagePicker = await loadImagePicker();

      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new MinderAuthorizationError('Permission to access camera denied');
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
      });

      if (result.canceled) {
        return null;
      }

      const asset = result.assets[0];
      return {
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        type: asset.type === 'image' ? 'image/jpeg' : asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      };
    } catch (error) {
      throw new MinderUploadError(`Failed to capture image: ${(error as Error).message}`);
    }
  }

  /**
   * Check if Expo file picker is available
   */
  static async isSupported(): Promise<boolean> {
    try {
      const loadDocumentPicker = new Function('return import("expo-document-picker")');
      await loadDocumentPicker();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Expo file upload adapter
 */
export function createExpoFileUpload(config: FileUploadConfig): ExpoFileUploadAdapter {
  return new ExpoFileUploadAdapter(config);
}
