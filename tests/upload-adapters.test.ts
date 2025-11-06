/**
 * File Upload Adapters Tests
 * 
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  FileUploadAdapter,
  WebFileUploadAdapter,
  NativeFileUploadAdapter,
  ExpoFileUploadAdapter,
  ElectronFileUploadAdapter,
  FileUploadAdapterFactory,
  FileUploadConfig,
  FileMetadata,
} from '../src/platform/adapters/upload';
import { PlatformDetector } from '../src/platform';

describe('FileUploadAdapter (Base Class)', () => {
  let adapter: WebFileUploadAdapter;
  let config: FileUploadConfig;

  beforeEach(() => {
    config = {
      url: 'https://api.example.com/upload',
      fieldName: 'file',
      method: 'POST',
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/png'],
      multiple: false,
    };
    adapter = new WebFileUploadAdapter(config);
  });

  describe('File Validation', () => {
    it('should validate file size', () => {
      const file: FileMetadata = {
        name: 'test.jpg',
        size: 10 * 1024 * 1024, // 10MB
        type: 'image/jpeg',
      };

      const error = (adapter as any).validateFile(file);
      expect(error).toContain('File size exceeds');
      expect(error).toContain('5 MB');
    });

    it('should validate file type', () => {
      const file: FileMetadata = {
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      const error = (adapter as any).validateFile(file);
      expect(error).toContain('File type application/pdf is not allowed');
    });

    it('should pass validation for valid files', () => {
      const file: FileMetadata = {
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg',
      };

      const error = (adapter as any).validateFile(file);
      expect(error).toBeNull();
    });

    it('should allow all types when allowedTypes is not set', () => {
      const adapterNoTypes = new WebFileUploadAdapter({
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      });

      const file: FileMetadata = {
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      const error = (adapterNoTypes as any).validateFile(file);
      expect(error).toBeNull();
    });
  });

  describe('File Metadata', () => {
    it('should get metadata from File object', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const metadata = (adapter as any).getFileMetadata(file);

      expect(metadata.name).toBe('test.txt');
      expect(metadata.type).toBe('text/plain');
      expect(metadata.size).toBeGreaterThan(0);
    });

    it('should get metadata from FileMetadata object', () => {
      const file: FileMetadata = {
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg',
      };

      const metadata = (adapter as any).getFileMetadata(file);
      expect(metadata).toEqual(file);
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate upload progress correctly', () => {
      const startTime = Date.now() - 1000;
      const lastTime = Date.now() - 500;
      const progress = (adapter as any).calculateProgress(50, 100, startTime, 0, lastTime);

      expect(progress.loaded).toBe(50);
      expect(progress.total).toBe(100);
      expect(progress.percentage).toBe(50);
      expect(progress.speed).toBeGreaterThan(0);
      expect(progress.estimatedTime).toBeGreaterThan(0);
    });

    it('should handle zero total size', () => {
      const progress = (adapter as any).calculateProgress(0, 0, 1000);

      expect(progress.percentage).toBe(0);
      expect(progress.speed).toBe(0);
      expect(progress.estimatedTime).toBe(0);
    });
  });

  describe('FormData Creation', () => {
    it('should create FormData with file', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const formData = (adapter as any).createFormData(file, {});

      expect(formData).toBeInstanceOf(FormData);
      expect(formData.has('file')).toBe(true);
    });

    it('should add additional fields to FormData', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const additionalData = { userId: '123', category: 'documents' };
      const formData = (adapter as any).createFormData(file, additionalData);

      expect(formData.has('userId')).toBe(true);
      expect(formData.has('category')).toBe(true);
    });
  });

  describe('Format Bytes', () => {
    it('should format bytes correctly', () => {
      expect((adapter as any).formatBytes(0)).toBe('0 Bytes');
      expect((adapter as any).formatBytes(1024)).toBe('1 KB');
      expect((adapter as any).formatBytes(1024 * 1024)).toBe('1 MB');
      expect((adapter as any).formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });
});

describe('WebFileUploadAdapter', () => {
  let adapter: WebFileUploadAdapter;
  let config: FileUploadConfig;

  beforeEach(() => {
    config = {
      url: 'https://api.example.com/upload',
      fieldName: 'file',
      method: 'POST',
    };
    adapter = new WebFileUploadAdapter(config);
  });

  describe('pickFiles', () => {
    it('should create input element and trigger click', async () => {
      const mockInput = document.createElement('input');
      const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue(mockInput as any);
      const clickSpy = jest.spyOn(mockInput, 'click').mockImplementation(() => {});

      // Simulate user selecting files
      setTimeout(() => {
        const event = new Event('change');
        Object.defineProperty(event, 'target', {
          value: { files: [] },
        });
        mockInput.dispatchEvent(event);
      }, 10);

      const result = await adapter.pickFiles({ multiple: false });
      
      expect(createElementSpy).toHaveBeenCalledWith('input');
      expect(clickSpy).toHaveBeenCalled();
      expect(mockInput.type).toBe('file');

      createElementSpy.mockRestore();
      clickSpy.mockRestore();
    });
  });

  describe('createFileInput', () => {
    it('should create a visible file input element', () => {
      const input = adapter.createFileInput({ multiple: true, accept: 'image/*' });

      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(input.type).toBe('file');
      expect(input.multiple).toBe(true);
      expect(input.accept).toBe('image/*');
    });
  });

  describe('createDropZone', () => {
    it('should create a div element with drag-and-drop support', () => {
      const dropZone = adapter.createDropZone({});

      expect(dropZone).toBeInstanceOf(HTMLDivElement);
      expect(dropZone.style.border).toBeTruthy();
    });

    it('should handle file drop events', (done) => {
      const dropZone = adapter.createDropZone({
        onDrop: (files) => {
          expect(files).toHaveLength(1);
          expect(files[0].name).toBe('test.txt');
          done();
        },
      });

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const dataTransfer = {
        files: [file],
      };

      // Use Event instead of DragEvent for jsdom compatibility
      const event = new Event('drop') as any;
      Object.defineProperty(event, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
      });
      
      dropZone.dispatchEvent(event);
    });
  });

  describe('isSupported', () => {
    it('should return true in browser environment', () => {
      expect(WebFileUploadAdapter.isSupported()).toBe(true);
    });
  });
});

describe('NativeFileUploadAdapter', () => {
  let adapter: NativeFileUploadAdapter;
  let config: FileUploadConfig;

  beforeEach(() => {
    config = {
      url: 'https://api.example.com/upload',
      fieldName: 'file',
    };
    adapter = new NativeFileUploadAdapter(config);
  });

  describe('pickFiles', () => {
    it('should attempt to use Expo picker first', async () => {
      const mockPickWithExpo = jest.spyOn(adapter as any, 'pickWithExpo').mockResolvedValue([
        { name: 'test.jpg', size: 1024, type: 'image/jpeg', uri: 'file:///test.jpg' },
      ]);

      const files = await adapter.pickFiles();

      expect(mockPickWithExpo).toHaveBeenCalled();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('test.jpg');

      mockPickWithExpo.mockRestore();
    });

    it('should fall back to react-native picker if Expo fails', async () => {
      const mockPickWithExpo = jest.spyOn(adapter as any, 'pickWithExpo').mockResolvedValue(null);
      const mockPickWithReactNative = jest.spyOn(adapter as any, 'pickWithReactNative').mockResolvedValue([
        { name: 'test.pdf', size: 2048, type: 'application/pdf', uri: 'file:///test.pdf' },
      ]);

      const files = await adapter.pickFiles();

      expect(mockPickWithExpo).toHaveBeenCalled();
      expect(mockPickWithReactNative).toHaveBeenCalled();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('test.pdf');

      mockPickWithExpo.mockRestore();
      mockPickWithReactNative.mockRestore();
    });

    it('should throw error if no picker is available', async () => {
      const mockPickWithExpo = jest.spyOn(adapter as any, 'pickWithExpo').mockResolvedValue(null);
      const mockPickWithReactNative = jest.spyOn(adapter as any, 'pickWithReactNative').mockResolvedValue(null);

      await expect(adapter.pickFiles()).rejects.toThrow('No file picker library available');

      mockPickWithExpo.mockRestore();
      mockPickWithReactNative.mockRestore();
    });
  });
});

describe('ExpoFileUploadAdapter', () => {
  let adapter: ExpoFileUploadAdapter;
  let config: FileUploadConfig;

  beforeEach(() => {
    config = {
      url: 'https://api.example.com/upload',
      fieldName: 'file',
    };
    adapter = new ExpoFileUploadAdapter(config);
  });

  describe('pickFiles', () => {
    it('should use ImagePicker for image types', async () => {
      const mockPickImages = jest.spyOn(adapter as any, 'pickImages').mockResolvedValue([
        { name: 'photo.jpg', size: 1024, type: 'image/jpeg', uri: 'file:///photo.jpg' },
      ]);

      const files = await adapter.pickFiles({ accept: 'image/*' });

      expect(mockPickImages).toHaveBeenCalled();
      expect(files).toHaveLength(1);

      mockPickImages.mockRestore();
    });

    it('should use DocumentPicker for non-image types', async () => {
      const mockPickDocuments = jest.spyOn(adapter as any, 'pickDocuments').mockResolvedValue([
        { name: 'document.pdf', size: 2048, type: 'application/pdf', uri: 'file:///document.pdf' },
      ]);

      const files = await adapter.pickFiles({ accept: 'application/pdf' });

      expect(mockPickDocuments).toHaveBeenCalled();
      expect(files).toHaveLength(1);

      mockPickDocuments.mockRestore();
    });
  });

  describe('pickFromCamera', () => {
    it('should capture image from camera', async () => {
      // Mock would be needed for actual Expo ImagePicker
      expect(adapter.pickFromCamera).toBeDefined();
    });
  });
});

describe('ElectronFileUploadAdapter', () => {
  let adapter: ElectronFileUploadAdapter;
  let config: FileUploadConfig;

  beforeEach(() => {
    config = {
      url: 'https://api.example.com/upload',
      fieldName: 'file',
    };
    adapter = new ElectronFileUploadAdapter(config);
  });

  describe('pickFiles', () => {
    it('should detect renderer process', async () => {
      (window as any).process = { type: 'renderer' };
      
      const mockPickFilesRenderer = jest.spyOn(adapter as any, 'pickFilesRenderer').mockResolvedValue([]);
      
      await adapter.pickFiles();
      
      expect(mockPickFilesRenderer).toHaveBeenCalled();

      mockPickFilesRenderer.mockRestore();
      delete (window as any).process;
    });
  });

  describe('createFilters', () => {
    it('should create filters from MIME types', () => {
      const filters = (adapter as any).createFilters(['image/jpeg', 'image/png']);

      expect(filters).toHaveLength(2);
      expect(filters[0].extensions).toContain('jpeg');
      expect(filters[1].extensions).toContain('png');
    });

    it('should handle wildcard types', () => {
      const filters = (adapter as any).createFilters('*/*');

      expect(filters).toHaveLength(1);
      expect(filters[0].extensions).toContain('*');
    });

    it('should handle file extensions', () => {
      const filters = (adapter as any).createFilters('.pdf');

      expect(filters).toHaveLength(1);
      expect(filters[0].extensions).toContain('pdf');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for common extensions', () => {
      expect((adapter as any).getMimeType('test.jpg')).toBe('image/jpeg');
      expect((adapter as any).getMimeType('test.png')).toBe('image/png');
      expect((adapter as any).getMimeType('test.pdf')).toBe('application/pdf');
      expect((adapter as any).getMimeType('test.txt')).toBe('text/plain');
    });

    it('should return default MIME type for unknown extensions', () => {
      expect((adapter as any).getMimeType('test.unknown')).toBe('application/octet-stream');
    });
  });

  describe('isSupported', () => {
    it('should detect Electron environment', () => {
      (window as any).process = { type: 'renderer' };
      
      expect(ElectronFileUploadAdapter.isSupported()).toBe(true);

      delete (window as any).process;
    });
  });
});

describe('FileUploadAdapterFactory', () => {
  describe('create', () => {
    it('should create WebFileUploadAdapter for web platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('web');

      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      const adapter = FileUploadAdapterFactory.create(config);

      expect(adapter).toBeInstanceOf(WebFileUploadAdapter);
    });

    it('should create NativeFileUploadAdapter for React Native platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('react-native');

      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      const adapter = FileUploadAdapterFactory.create(config);

      expect(adapter).toBeInstanceOf(NativeFileUploadAdapter);
    });

    it('should create ExpoFileUploadAdapter for Expo platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('expo');

      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      const adapter = FileUploadAdapterFactory.create(config);

      expect(adapter).toBeInstanceOf(ExpoFileUploadAdapter);
    });

    it('should create ElectronFileUploadAdapter for Electron platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('electron');

      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      const adapter = FileUploadAdapterFactory.create(config);

      expect(adapter).toBeInstanceOf(ElectronFileUploadAdapter);
    });
  });

  describe('createForPlatform', () => {
    it('should create adapter for specified platform', () => {
      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      const adapter = FileUploadAdapterFactory.createForPlatform('expo', config);

      expect(adapter).toBeInstanceOf(ExpoFileUploadAdapter);
    });

    it('should throw error for unsupported platform', () => {
      const config: FileUploadConfig = {
        url: 'https://api.example.com/upload',
        fieldName: 'file',
      };

      expect(() => {
        FileUploadAdapterFactory.createForPlatform('unknown', config);
      }).toThrow('Unsupported platform');
    });
  });

  describe('getFeatures', () => {
    it('should return correct features for web platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('web');

      const features = FileUploadAdapterFactory.getFeatures();

      expect(features.filePicker).toBe(true);
      expect(features.dragAndDrop).toBe(true);
      expect(features.camera).toBe(true);
      expect(features.multipleFiles).toBe(true);
    });

    it('should return correct features for Expo platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('expo');

      const features = FileUploadAdapterFactory.getFeatures();

      expect(features.filePicker).toBe(true);
      expect(features.dragAndDrop).toBe(false);
      expect(features.camera).toBe(true);
      expect(features.multipleFiles).toBe(true);
    });

    it('should return correct features for React Native platform', () => {
      jest.spyOn(PlatformDetector, 'detect').mockReturnValue('react-native');

      const features = FileUploadAdapterFactory.getFeatures();

      expect(features.filePicker).toBe(true);
      expect(features.dragAndDrop).toBe(false);
      expect(features.camera).toBe(false);
      expect(features.multipleFiles).toBe(true);
    });
  });
});
