'use client';

import React from 'react';
import { ChatRoom } from '@/components/features/ChatRoom';
import { MessageCircle, Wifi, Users, Zap } from 'lucide-react';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-600 p-3 rounded-lg">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Real-time Chat</h1>
              <p className="text-gray-600">WebSocket-powered instant messaging</p>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Wifi className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Live Connection</h3>
                  <p className="text-sm text-gray-500">Real-time WebSocket</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Multiple Rooms</h3>
                  <p className="text-sm text-gray-500">Join any room</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Instant Updates</h3>
                  <p className="text-sm text-gray-500">Zero latency</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <MessageCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Typing Indicator</h3>
                  <p className="text-sm text-gray-500">See who's typing</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Component */}
        <ChatRoom />

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">WebSocket Features Demonstrated</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">✅ Implemented Features:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Real-time message delivery</li>
                <li>• Multiple chat rooms</li>
                <li>• User presence tracking</li>
                <li>• Typing indicators</li>
                <li>• Message status (sending/sent/delivered/read)</li>
                <li>• Auto-reconnection handling</li>
                <li>• Online/offline status</li>
                <li>• User list per room</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">🔧 Technical Stack:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• <code className="bg-gray-100 px-2 py-0.5 rounded">useWebSocket</code> hook from minder-data-provider</li>
                <li>• Event-based communication</li>
                <li>• Optimistic UI updates</li>
                <li>• Connection state management</li>
                <li>• Auto-scroll to latest messages</li>
                <li>• Responsive design</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="font-medium text-blue-900 mb-2">💡 Try It Out:</h4>
            <p className="text-sm text-blue-700">
              Open this page in multiple browser windows or tabs with different usernames to see real-time chat in action! 
              Messages, typing indicators, and user presence will sync across all windows instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
