'use client';

import React from 'react';
import { FileUploadZone } from '@/components/features/FileUploadZone';
import { Upload, FileCheck, Image, File, Zap } from 'lucide-react';

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-600 p-3 rounded-lg">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">File Upload</h1>
              <p className="text-gray-600">Drag & drop with progress tracking</p>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Upload className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Drag & Drop</h3>
                  <p className="text-sm text-gray-500">Easy uploads</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Progress Tracking</h3>
                  <p className="text-sm text-gray-500">Live updates</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Image className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Image Preview</h3>
                  <p className="text-sm text-gray-500">Instant thumbnails</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <FileCheck className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Validation</h3>
                  <p className="text-sm text-gray-500">Type & size checks</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Component */}
        <FileUploadZone />

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">File Upload Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">✅ Implemented Features:</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Drag & Drop:</strong> Drag files directly into the upload zone</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Progress Tracking:</strong> Real-time upload progress for each file</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Image Previews:</strong> Instant thumbnail generation for images</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Multiple Files:</strong> Upload multiple files simultaneously</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>File Type Icons:</strong> Smart icons based on file type</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Filtering:</strong> Filter by file category (images, documents, etc.)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Validation:</strong> File type and size validation (10MB limit)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Status Indicators:</strong> Visual status (pending, uploading, success, error)</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-3">📋 Supported File Types:</h4>
              <div className="text-sm text-gray-600 space-y-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h5 className="font-medium text-blue-900 mb-1">Images</h5>
                  <p className="text-blue-700">JPEG, PNG, GIF, WebP, SVG</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <h5 className="font-medium text-green-900 mb-1">Documents</h5>
                  <p className="text-green-700">PDF, DOC, DOCX, TXT</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <h5 className="font-medium text-purple-900 mb-1">Media</h5>
                  <p className="text-purple-700">MP4, WebM, MP3, WAV, OGG</p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <h5 className="font-medium text-orange-900 mb-1">Archives</h5>
                  <p className="text-orange-700">ZIP, RAR, 7Z</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
            <h4 className="font-medium text-purple-900 mb-2">🔧 Technical Implementation:</h4>
            <p className="text-sm text-purple-700 mb-2">
              This component demonstrates file upload capabilities using modern web APIs:
            </p>
            <ul className="text-sm text-purple-700 space-y-1 ml-4">
              <li>• Drag & Drop API for intuitive file selection</li>
              <li>• FileReader API for client-side image preview generation</li>
              <li>• Progress simulation (ready for <code className="bg-purple-200 px-1 rounded">useMediaUpload</code> integration)</li>
              <li>• Responsive grid layout with Tailwind CSS</li>
              <li>• Smart file type detection and categorization</li>
            </ul>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="font-medium text-blue-900 mb-2">💡 Try It Out:</h4>
            <p className="text-sm text-blue-700">
              Drag files from your desktop or click "Choose Files" to upload. The upload is simulated with
              a 90% success rate to demonstrate both success and error states. Filter files by category
              using the buttons above the file grid!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
