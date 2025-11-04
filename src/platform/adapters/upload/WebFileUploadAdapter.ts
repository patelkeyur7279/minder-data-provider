/**
 * WebFileUploadAdapter - Browser file upload implementation
 * 
 * Uses native HTML5 File API and FormData.
 * 
 * @module WebFileUploadAdapter
 */

import {
  FileUploadAdapter,
  FileUploadConfig,
  FileMetadata,
  FilePickerOptions,
} from './FileUploadAdapter.js';

/**
 * Web (Browser) File Upload Adapter
 */
export class WebFileUploadAdapter extends FileUploadAdapter {
  constructor(config: FileUploadConfig) {
    super(config);
  }

  /**
   * Pick files using HTML5 file input
   */
  async pickFiles(options: FilePickerOptions = {}): Promise<FileMetadata[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = options.multiple ?? this.config.multiple;

      if (options.accept) {
        input.accept = Array.isArray(options.accept)
          ? options.accept.join(',')
          : options.accept;
      }

      if (options.capture) {
        input.capture = options.capture;
      }

      input.onchange = (event) => {
        const files = Array.from((event.target as HTMLInputElement).files || []);
        
        if (files.length === 0) {
          resolve([]);
          return;
        }

        const maxFiles = options.maxFiles ?? this.config.maxFiles;
        const selectedFiles = files.slice(0, maxFiles);

        const metadata: FileMetadata[] = selectedFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        }));

        resolve(metadata);
      };

      input.onerror = () => {
        reject(new Error('File selection failed'));
      };

      input.click();
    });
  }

  /**
   * Create file input element for direct upload
   */
  createFileInput(options: {
    multiple?: boolean;
    accept?: string | string[];
    onChange?: (files: File[]) => void;
  }): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? this.config.multiple;

    if (options.accept) {
      input.accept = Array.isArray(options.accept)
        ? options.accept.join(',')
        : options.accept;
    }

    if (options.onChange) {
      input.onchange = (event) => {
        const files = Array.from((event.target as HTMLInputElement).files || []);
        options.onChange!(files);
      };
    }

    return input;
  }

  /**
   * Create drop zone element
   */
  createDropZone(options: {
    onDrop?: (files: File[]) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
  }): HTMLDivElement {
    const dropZone = document.createElement('div');
    dropZone.style.border = '2px dashed #ccc';
    dropZone.style.padding = '20px';
    dropZone.style.textAlign = 'center';

    dropZone.ondragover = (event) => {
      event.preventDefault();
      dropZone.style.borderColor = '#000';
      options.onDragOver?.(event);
    };

    dropZone.ondragleave = (event) => {
      event.preventDefault();
      dropZone.style.borderColor = '#ccc';
      options.onDragLeave?.(event);
    };

    dropZone.ondrop = (event) => {
      event.preventDefault();
      dropZone.style.borderColor = '#ccc';

      const files = Array.from(event.dataTransfer?.files || []);
      options.onDrop?.(files);
    };

    return dropZone;
  }

  /**
   * Check if File API is supported
   */
  static isSupported(): boolean {
    return typeof File !== 'undefined' && typeof FormData !== 'undefined';
  }
}

/**
 * Create Web file upload adapter
 */
export function createWebFileUpload(config: FileUploadConfig): WebFileUploadAdapter {
  return new WebFileUploadAdapter(config);
}
