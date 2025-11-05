'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload, X, File, Image, FileText, Film, Music, Archive,
  CheckCircle, AlertCircle, Loader2, Trash2, Eye, Download
} from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  uploadedUrl?: string;
  size: string;
  type: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
  videos: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  archives: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
};

const ALL_ALLOWED_TYPES = Object.values(ALLOWED_TYPES).flat();

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getFileIcon(type: string) {
  if (ALLOWED_TYPES.images.includes(type)) return Image;
  if (ALLOWED_TYPES.documents.includes(type)) return FileText;
  if (ALLOWED_TYPES.videos.includes(type)) return Film;
  if (ALLOWED_TYPES.audio.includes(type)) return Music;
  if (ALLOWED_TYPES.archives.includes(type)) return Archive;
  return File;
}

function getFileCategory(type: string): string {
  if (ALLOWED_TYPES.images.includes(type)) return 'image';
  if (ALLOWED_TYPES.documents.includes(type)) return 'document';
  if (ALLOWED_TYPES.videos.includes(type)) return 'video';
  if (ALLOWED_TYPES.audio.includes(type)) return 'audio';
  if (ALLOWED_TYPES.archives.includes(type)) return 'archive';
  return 'other';
}

export function FileUploadZone() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState<'all' | 'images' | 'documents' | 'videos' | 'audio'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Simulated upload function - in real app, this would use useMediaUpload from minder-data-provider
  const simulateUpload = useCallback(async (file: File, fileId: string) => {
    // Update to uploading
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'uploading' as const } : f
    ));

    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, progress: i } : f
      ));
    }

    // Simulate success/error (90% success rate)
    const success = Math.random() > 0.1;
    if (success) {
      setFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: 'success' as const,
          progress: 100,
          uploadedUrl: URL.createObjectURL(file)
        } : f
      ));
    } else {
      setFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: 'error' as const,
          error: 'Upload failed. Please try again.'
        } : f
      ));
    }
  }, []);

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const newFiles: UploadedFile[] = [];

    filesArray.forEach(file => {
      // Validate file type
      if (!ALL_ALLOWED_TYPES.includes(file.type)) {
        alert(`File type not allowed: ${file.name}`);
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        alert(`File too large: ${file.name}. Max size is 10MB.`);
        return;
      }

      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const uploadFile: UploadedFile = {
        id: fileId,
        file,
        progress: 0,
        status: 'pending',
        size: formatFileSize(file.size),
        type: file.type,
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, preview: e.target?.result as string } : f
          ));
        };
        reader.readAsDataURL(file);
      }

      newFiles.push(uploadFile);
    });

    setFiles(prev => [...prev, ...newFiles]);

    // Auto-upload with simulated upload
    newFiles.forEach(({ id, file }) => {
      simulateUpload(file, id);
    });
  }, [simulateUpload]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  }, [processFiles]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const handleClearAll = useCallback(() => {
    setFiles([]);
  }, []);

  const filteredFiles = files.filter(file => {
    if (filter === 'all') return true;
    const category = getFileCategory(file.type);
    if (filter === 'images') return category === 'image';
    if (filter === 'documents') return category === 'document';
    if (filter === 'videos') return category === 'video';
    if (filter === 'audio') return category === 'audio';
    return true;
  });

  const stats = {
    total: files.length,
    uploading: files.filter(f => f.status === 'uploading').length,
    success: files.filter(f => f.status === 'success').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50 scale-105'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <div className="p-12 text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 transition-colors ${
            isDragging ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <Upload className={`w-10 h-10 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {isDragging ? 'Drop files here' : 'Upload Files'}
          </h3>
          
          <p className="text-gray-600 mb-6">
            Drag and drop files here, or click to browse
          </p>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Choose Files
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept={ALL_ALLOWED_TYPES.join(',')}
          />

          <div className="mt-6 text-sm text-gray-500">
            <p className="mb-2">Supported formats:</p>
            <p>Images (JPEG, PNG, GIF, WebP, SVG)</p>
            <p>Documents (PDF, DOC, DOCX, TXT)</p>
            <p>Videos (MP4, WebM, OGG) • Audio (MP3, WAV, OGG)</p>
            <p>Archives (ZIP, RAR, 7Z)</p>
            <p className="mt-2 font-medium">Maximum file size: 10MB</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Files</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-600">{stats.uploading}</div>
            <div className="text-sm text-blue-700">Uploading</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-600">{stats.success}</div>
            <div className="text-sm text-green-700">Completed</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
            <div className="text-sm text-red-700">Failed</div>
          </div>
        </div>
      )}

      {/* Filter & Actions */}
      {files.length > 0 && (
        <div className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex gap-2">
            {(['all', 'images', 'documents', 'videos', 'audio'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      )}

      {/* Files Grid */}
      {filteredFiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map(file => {
            const FileIcon = getFileIcon(file.type);
            const isImage = file.type.startsWith('image/');

            return (
              <div
                key={file.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Preview */}
                <div className="relative h-48 bg-gray-100">
                  {isImage && file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <FileIcon className="w-16 h-16 text-gray-400" />
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2 right-2">
                    {file.status === 'uploading' && (
                      <div className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {file.progress}%
                      </div>
                    )}
                    {file.status === 'success' && (
                      <div className="bg-green-600 text-white p-1 rounded-full">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    )}
                    {file.status === 'error' && (
                      <div className="bg-red-600 text-white p-1 rounded-full">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="absolute top-2 left-2 bg-white/90 hover:bg-white p-1 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-700" />
                  </button>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h4 className="font-medium text-gray-900 truncate mb-1">
                    {file.file.name}
                  </h4>
                  <p className="text-sm text-gray-500 mb-3">{file.size}</p>

                  {/* Progress Bar */}
                  {file.status === 'uploading' && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error Message */}
                  {file.status === 'error' && file.error && (
                    <p className="text-sm text-red-600 mb-3">{file.error}</p>
                  )}

                  {/* Actions */}
                  {file.status === 'success' && (
                    <div className="flex gap-2">
                      {isImage && file.preview && (
                        <a
                          href={file.preview}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </a>
                      )}
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {files.length > 0 && filteredFiles.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No {filter} files uploaded</p>
        </div>
      )}
    </div>
  );
}
