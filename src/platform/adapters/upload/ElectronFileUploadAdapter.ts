/**
 * ElectronFileUploadAdapter - Electron file upload implementation
 * 
 * Uses Electron's dialog API for file selection.
 * 
 * @module ElectronFileUploadAdapter
 */

import {
  FileUploadAdapter,
  FileUploadConfig,
  FileMetadata,
  FilePickerOptions,
} from './FileUploadAdapter.js';
import { MinderUploadError } from '../../../errors/index.js';

/**
 * Electron File Upload Adapter
 */
export class ElectronFileUploadAdapter extends FileUploadAdapter {
  constructor(config: FileUploadConfig) {
    super(config);
  }

  /**
   * Pick files using Electron dialog
   */
  async pickFiles(options: FilePickerOptions = {}): Promise<FileMetadata[]> {
    try {
      // Check if we're in renderer process
      const isRenderer = typeof window !== 'undefined' && (window as any).process?.type === 'renderer';

      if (isRenderer) {
        return this.pickFilesRenderer(options);
      } else {
        return this.pickFilesMain(options);
      }
    } catch (error) {
      throw new MinderUploadError(`Failed to pick files: ${(error as Error).message}`);
    }
  }

  /**
   * Pick files from renderer process (using IPC)
   */
  private async pickFilesRenderer(options: FilePickerOptions): Promise<FileMetadata[]> {
    try {
      // Use IPC to communicate with main process
      const { ipcRenderer } = await this.loadElectron();

      const result = await ipcRenderer.invoke('dialog:openFile', {
        properties: [
          'openFile',
          ...(options.multiple ? ['multiSelections'] : []),
        ],
        filters: options.accept ? this.createFilters(options.accept) : undefined,
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return [];
      }

      // Get file metadata
      const fs = await this.loadFS();
      const path = await this.loadPath();

      return result.filePaths.map((filePath: string) => {
        const stats = fs.statSync(filePath);
        return {
          name: path.basename(filePath),
          size: stats.size,
          type: this.getMimeType(filePath),
          path: filePath,
        };
      });
    } catch (error) {
      throw new MinderUploadError(`Renderer process file picker failed: ${(error as Error).message}`);
    }
  }

  /**
   * Pick files from main process
   */
  private async pickFilesMain(options: FilePickerOptions): Promise<FileMetadata[]> {
    try {
      const { dialog } = await this.loadElectron();
      const fs = await this.loadFS();
      const path = await this.loadPath();

      const result = await dialog.showOpenDialog({
        properties: [
          'openFile',
          ...(options.multiple ? ['multiSelections'] : []),
        ],
        filters: options.accept ? this.createFilters(options.accept) : undefined,
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return [];
      }

      return result.filePaths.map((filePath: string) => {
        const stats = fs.statSync(filePath);
        return {
          name: path.basename(filePath),
          size: stats.size,
          type: this.getMimeType(filePath),
          path: filePath,
        };
      });
    } catch (error) {
      throw new MinderUploadError(`Main process file picker failed: ${(error as Error).message}`);
    }
  }

  /**
   * Create file filters for dialog
   */
  private createFilters(accept: string | string[]): Array<{ name: string; extensions: string[] }> {
    const types = Array.isArray(accept) ? accept : [accept];
    const filters: Array<{ name: string; extensions: string[] }> = [];

    types.forEach((type) => {
      if (type === '*/*') {
        filters.push({ name: 'All Files', extensions: ['*'] });
      } else if (type.includes('/')) {
        const [category, ext] = type.split('/');
        if (ext === '*') {
          filters.push({ name: `${category} Files`, extensions: ['*'] });
        } else if (ext) {
          filters.push({ name: `${ext.toUpperCase()} Files`, extensions: [ext] });
        }
      } else if (type.startsWith('.')) {
        filters.push({ name: `${type.slice(1).toUpperCase()} Files`, extensions: [type.slice(1)] });
      }
    });

    return filters;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      
      // Text
      txt: 'text/plain',
      csv: 'text/csv',
      html: 'text/html',
      css: 'text/css',
      js: 'text/javascript',
      json: 'application/json',
      xml: 'application/xml',
      
      // Archives
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      
      // Media
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Load Electron module
   */
  private async loadElectron(): Promise<any> {
     
    const loadElectron = new Function('return require("electron")');
    return loadElectron();
  }

  /**
   * Load fs module
   */
  private async loadFS(): Promise<any> {
     
    const loadFS = new Function('return require("fs")');
    return loadFS();
  }

  /**
   * Load path module
   */
  private async loadPath(): Promise<any> {
     
    const loadPath = new Function('return require("path")');
    return loadPath();
  }

  /**
   * Check if Electron is available
   */
  static isSupported(): boolean {
    try {
      const isElectron = typeof window !== 'undefined' && (window as any).process?.type === 'renderer';
      const isNode = typeof process !== 'undefined' && process.versions?.electron;
      return isElectron || !!isNode;
    } catch {
      return false;
    }
  }
}

/**
 * Create Electron file upload adapter
 */
export function createElectronFileUpload(config: FileUploadConfig): ElectronFileUploadAdapter {
  return new ElectronFileUploadAdapter(config);
}
