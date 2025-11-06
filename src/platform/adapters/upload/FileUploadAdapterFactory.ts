/**
 * FileUploadAdapterFactory - Factory for creating platform-specific file upload adapters
 * 
 * Automatically selects the appropriate adapter based on the platform.
 * 
 * @module FileUploadAdapterFactory
 */

import { PlatformDetector } from '../../PlatformDetector.js';
import type { FileUploadAdapter, FileUploadConfig } from './FileUploadAdapter.js';
import { WebFileUploadAdapter } from './WebFileUploadAdapter.js';
import { NativeFileUploadAdapter } from './NativeFileUploadAdapter.js';
import { ExpoFileUploadAdapter } from './ExpoFileUploadAdapter.js';
import { ElectronFileUploadAdapter } from './ElectronFileUploadAdapter.js';
import { MinderPlatformError } from '../../../errors/index.js';

/**
 * File Upload Adapter Factory
 */
export class FileUploadAdapterFactory {
  /**
   * Create a file upload adapter for the current platform
   */
  static create(config: FileUploadConfig): FileUploadAdapter {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'expo':
        return new ExpoFileUploadAdapter(config);
      
      case 'react-native':
        return new NativeFileUploadAdapter(config);
      
      case 'electron':
        return new ElectronFileUploadAdapter(config);
      
      case 'web':
      case 'nextjs':
      case 'node':
      default:
        return new WebFileUploadAdapter(config);
    }
  }

  /**
   * Create an adapter for a specific platform
   */
  static createForPlatform(
    platformName: string,
    config: FileUploadConfig
  ): FileUploadAdapter {
    switch (platformName) {
      case 'expo':
        return new ExpoFileUploadAdapter(config);
      
      case 'react-native':
        return new NativeFileUploadAdapter(config);
      
      case 'electron':
        return new ElectronFileUploadAdapter(config);
      
      case 'web':
      case 'nextjs':
      case 'node':
        return new WebFileUploadAdapter(config);
      
      default:
        throw new MinderPlatformError(`Unsupported platform: ${platformName}`, platformName);
    }
  }

  /**
   * Check if file upload is supported on the current platform
   */
  static async isSupported(): Promise<boolean> {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'expo':
        return ExpoFileUploadAdapter.isSupported();
      
      case 'react-native':
        return NativeFileUploadAdapter.isSupported();
      
      case 'electron':
        return ElectronFileUploadAdapter.isSupported();
      
      case 'web':
      case 'nextjs':
        return WebFileUploadAdapter.isSupported();
      
      case 'node':
      default:
        return false;
    }
  }

  /**
   * Get available upload features for the current platform
   */
  static getFeatures(): {
    filePicker: boolean;
    dragAndDrop: boolean;
    camera: boolean;
    multipleFiles: boolean;
    chunkedUpload: boolean;
  } {
    const platform = PlatformDetector.detect();

    switch (platform) {
      case 'expo':
        return {
          filePicker: true,
          dragAndDrop: false,
          camera: true,
          multipleFiles: true,
          chunkedUpload: true,
        };
      
      case 'react-native':
        return {
          filePicker: true,
          dragAndDrop: false,
          camera: false,
          multipleFiles: true,
          chunkedUpload: true,
        };
      
      case 'electron':
        return {
          filePicker: true,
          dragAndDrop: true,
          camera: false,
          multipleFiles: true,
          chunkedUpload: true,
        };
      
      case 'web':
      case 'nextjs':
        return {
          filePicker: true,
          dragAndDrop: true,
          camera: true,
          multipleFiles: true,
          chunkedUpload: true,
        };
      
      default:
        return {
          filePicker: false,
          dragAndDrop: false,
          camera: false,
          multipleFiles: false,
          chunkedUpload: false,
        };
    }
  }
}

/**
 * Create a file upload adapter for the current platform
 */
export function createFileUploadAdapter(config: FileUploadConfig): FileUploadAdapter {
  return FileUploadAdapterFactory.create(config);
}
