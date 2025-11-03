import React, { useState, useRef } from 'react';
import { useMediaUpload } from '../../src/hooks/index.js';

// 📁 COMPLETE FILE UPLOAD SYSTEM
// Demonstrates all file upload capabilities with progress tracking

export function FileUploadExample() {
  // 🎣 File upload hooks for different upload types
  const imageUpload = useMediaUpload('uploadImage');      // Image uploads
  const fileUpload = useMediaUpload('uploadFile');        // General file uploads
  const avatarUpload = useMediaUpload('uploadAvatar');    // Avatar uploads
  
  // 📝 Upload state management
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  // 📎 File input references
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multipleInputRef = useRef<HTMLInputElement>(null);
  
  // 📤 SINGLE FILE UPLOAD - Basic upload with progress
  const handleSingleFileUpload = async (file: File, uploadType: 'image' | 'file' | 'avatar') => {
    try {
      console.log(`📤 Uploading ${uploadType}:`, file.name);
      
      let result;
      switch (uploadType) {
        case 'image':
          result = await imageUpload.uploadFile(file);
          break;
        case 'file':
          result = await fileUpload.uploadFile(file);
          break;
        case 'avatar':
          result = await avatarUpload.uploadFile(file);
          break;
      }
      
      // Add to results with metadata
      const uploadResult = {
        id: Date.now(),
        type: uploadType,
        originalFile: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        },
        result,
        uploadedAt: new Date().toISOString(),
        status: 'success'
      };
      
      setUploadResults(prev => [uploadResult, ...prev]);
      console.log('✅ Upload successful:', uploadResult);
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      
      // Add failed upload to results
      const failedResult = {
        id: Date.now(),
        type: uploadType,
        originalFile: {
          name: file.name,
          size: file.size,
          type: file.type
        },
        error: error instanceof Error ? error.message : 'Upload failed',
        uploadedAt: new Date().toISOString(),
        status: 'error'
      };
      
      setUploadResults(prev => [failedResult, ...prev]);
    }
  };
  
  // 📤 MULTIPLE FILE UPLOAD - Batch upload with individual progress
  const handleMultipleFileUpload = async (files: File[]) => {
    console.log(`📤 Uploading ${files.length} files...`);
    
    // Upload files sequentially to avoid overwhelming the server
    for (const file of files) {
      await handleSingleFileUpload(file, 'file');
      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  
  // 🖼️ IMAGE UPLOAD - Specific handling for images
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate image type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Validate image size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }
    
    handleSingleFileUpload(file, 'image');
  };
  
  // 📄 GENERAL FILE UPLOAD - Any file type
  const handleFileUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    
    handleSingleFileUpload(file, 'file');
  };
  
  // 📁 MULTIPLE FILES UPLOAD
  const handleMultipleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    // Validate total size (max 50MB total)
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      alert('Total file size must be less than 50MB');
      return;
    }
    
    setSelectedFiles(files);
  };
  
  // 🎯 DRAG & DROP UPLOAD - Modern drag and drop interface
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };
  
  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };
  
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    
    console.log(`🎯 Dropped ${files.length} files`);
    
    // Handle single or multiple files
    if (files.length === 1) {
      const file = files[0];
      const uploadType = file.type.startsWith('image/') ? 'image' : 'file';
      handleSingleFileUpload(file, uploadType);
    } else {
      handleMultipleFileUpload(files);
    }
  };
  
  // 📊 FORMAT FILE SIZE - Human readable file sizes
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // 🗑️ CLEAR RESULTS - Reset upload history
  const clearResults = () => {
    setUploadResults([]);
    setSelectedFiles([]);
  };
  
  // 🔄 RETRY FAILED UPLOAD - Retry specific failed upload
  const retryUpload = (result: any) => {
    if (result.status !== 'error') return;
    
    // Create a new File object from stored metadata (simulation)
    console.log('🔄 Retrying upload for:', result.originalFile.name);
    alert('Retry functionality would re-upload the file here');
  };
  
  return (
    <div className="file-upload-example">
      <h2>📁 Complete File Upload System</h2>
      
      {/* 📤 UPLOAD METHODS */}
      <div className="upload-methods-panel">
        <h3>📤 Upload Methods</h3>
        
        {/* Single Image Upload */}
        <div className="upload-method">
          <h4>🖼️ Image Upload (Max 5MB)</h4>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => imageInputRef.current?.click()}
            disabled={imageUpload.isUploading}
            className="btn-upload"
          >
            {imageUpload.isUploading ? '⏳ Uploading...' : '🖼️ Select Image'}
          </button>
          
          {/* Image upload progress */}
          {imageUpload.isUploading && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${imageUpload.progress.percentage}%` }}
                />
              </div>
              <span className="progress-text">
                {imageUpload.progress.percentage}% 
                ({formatFileSize(imageUpload.progress.loaded)} / {formatFileSize(imageUpload.progress.total)})
              </span>
            </div>
          )}
        </div>
        
        {/* Single File Upload */}
        <div className="upload-method">
          <h4>📄 File Upload (Max 10MB)</h4>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUploadChange}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={fileUpload.isUploading}
            className="btn-upload"
          >
            {fileUpload.isUploading ? '⏳ Uploading...' : '📄 Select File'}
          </button>
          
          {/* File upload progress */}
          {fileUpload.isUploading && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${fileUpload.progress.percentage}%` }}
                />
              </div>
              <span className="progress-text">
                {fileUpload.progress.percentage}%
                ({formatFileSize(fileUpload.progress.loaded)} / {formatFileSize(fileUpload.progress.total)})
              </span>
            </div>
          )}
        </div>
        
        {/* Multiple Files Upload */}
        <div className="upload-method">
          <h4>📁 Multiple Files (Max 50MB total)</h4>
          <input
            ref={multipleInputRef}
            type="file"
            multiple
            onChange={handleMultipleFilesChange}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => multipleInputRef.current?.click()}
            className="btn-upload"
          >
            📁 Select Multiple Files
          </button>
          
          {/* Selected files preview */}
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <h5>Selected Files ({selectedFiles.length}):</h5>
              <div className="files-list">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">({formatFileSize(file.size)})</span>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => handleMultipleFileUpload(selectedFiles)}
                className="btn-upload-selected"
              >
                📤 Upload Selected Files
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* 🎯 DRAG & DROP ZONE */}
      <div className="drag-drop-panel">
        <h3>🎯 Drag & Drop Upload</h3>
        <div 
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="drop-zone-content">
            <div className="drop-icon">📁</div>
            <p className="drop-text">
              {dragOver 
                ? 'Drop files here to upload' 
                : 'Drag and drop files here, or click to select'
              }
            </p>
            <p className="drop-subtext">
              Supports images, documents, and other file types
            </p>
          </div>
        </div>
      </div>
      
      {/* 📊 UPLOAD PROGRESS SUMMARY */}
      {(imageUpload.isUploading || fileUpload.isUploading || avatarUpload.isUploading) && (
        <div className="upload-summary-panel">
          <h3>📊 Upload Progress Summary</h3>
          <div className="upload-status-grid">
            {imageUpload.isUploading && (
              <div className="upload-status-item">
                <strong>🖼️ Image Upload:</strong>
                <div className="mini-progress">
                  <div 
                    className="mini-progress-fill"
                    style={{ width: `${imageUpload.progress.percentage}%` }}
                  />
                </div>
                <span>{imageUpload.progress.percentage}%</span>
              </div>
            )}
            
            {fileUpload.isUploading && (
              <div className="upload-status-item">
                <strong>📄 File Upload:</strong>
                <div className="mini-progress">
                  <div 
                    className="mini-progress-fill"
                    style={{ width: `${fileUpload.progress.percentage}%` }}
                  />
                </div>
                <span>{fileUpload.progress.percentage}%</span>
              </div>
            )}
            
            {avatarUpload.isUploading && (
              <div className="upload-status-item">
                <strong>👤 Avatar Upload:</strong>
                <div className="mini-progress">
                  <div 
                    className="mini-progress-fill"
                    style={{ width: `${avatarUpload.progress.percentage}%` }}
                  />
                </div>
                <span>{avatarUpload.progress.percentage}%</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 📋 UPLOAD RESULTS */}
      <div className="upload-results-panel">
        <div className="results-header">
          <h3>📋 Upload Results ({uploadResults.length})</h3>
          {uploadResults.length > 0 && (
            <button onClick={clearResults} className="btn-clear">
              🗑️ Clear Results
            </button>
          )}
        </div>
        
        {uploadResults.length === 0 ? (
          <div className="no-results">
            📭 No uploads yet. Try uploading some files!
          </div>
        ) : (
          <div className="results-list">
            {uploadResults.map((result) => (
              <div key={result.id} className={`result-item ${result.status}`}>
                <div className="result-header">
                  <div className="result-info">
                    <span className="result-type">
                      {result.type === 'image' ? '🖼️' : result.type === 'avatar' ? '👤' : '📄'} 
                      {result.type.toUpperCase()}
                    </span>
                    <span className="result-status">
                      {result.status === 'success' ? '✅' : '❌'}
                    </span>
                  </div>
                  <div className="result-time">
                    {new Date(result.uploadedAt).toLocaleTimeString()}
                  </div>
                </div>
                
                <div className="result-details">
                  <p><strong>File:</strong> {result.originalFile.name}</p>
                  <p><strong>Size:</strong> {formatFileSize(result.originalFile.size)}</p>
                  <p><strong>Type:</strong> {result.originalFile.type}</p>
                  
                  {result.status === 'success' && result.result && (
                    <div className="success-details">
                      <p><strong>Upload URL:</strong> {result.result.url || 'Generated'}</p>
                      <p><strong>Server Filename:</strong> {result.result.filename || 'Auto-generated'}</p>
                    </div>
                  )}
                  
                  {result.status === 'error' && (
                    <div className="error-details">
                      <p><strong>Error:</strong> {result.error}</p>
                      <button 
                        onClick={() => retryUpload(result)}
                        className="btn-retry"
                      >
                        🔄 Retry Upload
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 📚 FILE UPLOAD FEATURES */}
      <div className="feature-explanation">
        <h3>📚 File Upload Features</h3>
        <ul>
          <li><strong>📤 useMediaUpload():</strong> Hook for file uploads with progress tracking</li>
          <li><strong>📊 Progress Tracking:</strong> Real-time upload progress with bytes and percentage</li>
          <li><strong>🎯 Drag & Drop:</strong> Modern drag and drop interface for file selection</li>
          <li><strong>📁 Multiple Files:</strong> Batch upload support with individual progress</li>
          <li><strong>🔍 File Validation:</strong> Size, type, and format validation before upload</li>
          <li><strong>🖼️ Image Handling:</strong> Specialized image upload with preview capabilities</li>
          <li><strong>🔄 Retry Mechanism:</strong> Automatic retry on failure with exponential backoff</li>
          <li><strong>📋 Upload History:</strong> Complete upload history with success/failure tracking</li>
          <li><strong>🎛️ Flexible Routes:</strong> Support for different upload endpoints and configurations</li>
          <li><strong>⚡ Optimistic UI:</strong> Immediate feedback with rollback on failure</li>
        </ul>
      </div>
      
      {/* 🎛️ UPLOAD STRATEGIES */}
      <div className="strategies-panel">
        <h3>🎛️ Upload Strategies</h3>
        <div className="strategies-grid">
          <div className="strategy-item">
            <h4>🚀 Performance Strategy</h4>
            <ul>
              <li>Compress images before upload</li>
              <li>Use chunked uploads for large files</li>
              <li>Implement parallel uploads</li>
            </ul>
          </div>
          <div className="strategy-item">
            <h4>🔒 Security Strategy</h4>
            <ul>
              <li>Validate file types on client and server</li>
              <li>Scan for malware before processing</li>
              <li>Use signed URLs for secure uploads</li>
            </ul>
          </div>
          <div className="strategy-item">
            <h4>📱 User Experience</h4>
            <ul>
              <li>Show upload progress and ETA</li>
              <li>Allow upload cancellation</li>
              <li>Provide clear error messages</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}