'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from 'minder-data-provider/websocket';
import { Send, Users, Circle, MessageCircle, Clock, Check, CheckCheck } from 'lucide-react';

interface Message {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  roomId: string;
}

interface User {
  id: string;
  username: string;
  online: boolean;
  typing: boolean;
  lastSeen?: Date;
}

interface Room {
  id: string;
  name: string;
  description: string;
  userCount: number;
}

const ROOMS: Room[] = [
  { id: 'general', name: 'General', description: 'General discussion', userCount: 0 },
  { id: 'tech', name: 'Tech Talk', description: 'Technology discussions', userCount: 0 },
  { id: 'random', name: 'Random', description: 'Random chat', userCount: 0 },
  { id: 'support', name: 'Support', description: 'Get help here', userCount: 0 },
];

export function ChatRoom() {
  const [currentRoom, setCurrentRoom] = useState<string>('general');
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [username, setUsername] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { connect, disconnect, send, subscribe, isConnected } = useWebSocket();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (isUsernameSet) {
      setConnectionStatus('connecting');
      connect();

      // Subscribe to events
      const unsubscribers = [
        subscribe('connected', () => {
          setConnectionStatus('connected');
          // Join current room
          send('join_room', { roomId: currentRoom, username });
        }),

        subscribe('disconnected', () => {
          setConnectionStatus('disconnected');
        }),

        subscribe('message', (data: Message) => {
          setMessages(prev => [...prev, {
            ...data,
            timestamp: new Date(data.timestamp),
          }]);
        }),

        subscribe('user_joined', (data: { userId: string; username: string; roomId: string }) => {
          if (data.roomId === currentRoom) {
            setUsers(prev => [...prev, {
              id: data.userId,
              username: data.username,
              online: true,
              typing: false,
            }]);
          }
        }),

        subscribe('user_left', (data: { userId: string; roomId: string }) => {
          if (data.roomId === currentRoom) {
            setUsers(prev => prev.filter(u => u.id !== data.userId));
          }
        }),

        subscribe('user_typing', (data: { username: string; isTyping: boolean; roomId: string }) => {
          if (data.roomId === currentRoom) {
            setTypingUsers(prev => {
              if (data.isTyping && !prev.includes(data.username)) {
                return [...prev, data.username];
              } else if (!data.isTyping) {
                return prev.filter(u => u !== data.username);
              }
              return prev;
            });
          }
        }),

        subscribe('room_users', (data: { users: User[]; roomId: string }) => {
          if (data.roomId === currentRoom) {
            setUsers(data.users);
          }
        }),

        subscribe('message_status', (data: { messageId: string; status: Message['status'] }) => {
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId ? { ...msg, status: data.status } : msg
          ));
        }),
      ];

      return () => {
        unsubscribers.forEach(unsub => unsub?.());
        disconnect();
      };
    }
  }, [isUsernameSet, currentRoom, username, connect, disconnect, send, subscribe]);

  // Handle room change
  const handleRoomChange = useCallback((roomId: string) => {
    if (roomId === currentRoom) return;

    // Leave current room
    send('leave_room', { roomId: currentRoom, username });
    
    // Clear messages and users
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
    
    // Join new room
    setCurrentRoom(roomId);
    send('join_room', { roomId, username });
  }, [currentRoom, username, send]);

  // Handle sending message
  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message: Message = {
      id: messageId,
      userId: username,
      username,
      text: inputMessage,
      timestamp: new Date(),
      status: 'sending',
      roomId: currentRoom,
    };

    // Optimistically add message
    setMessages(prev => [...prev, message]);

    // Send to server
    send('send_message', {
      messageId,
      roomId: currentRoom,
      text: inputMessage,
      username,
    });

    setInputMessage('');

    // Stop typing indicator
    send('typing', { roomId: currentRoom, username, isTyping: false });
  }, [inputMessage, username, currentRoom, send]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    send('typing', { roomId: currentRoom, username, isTyping: true });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      send('typing', { roomId: currentRoom, username, isTyping: false });
    }, 2000);
  }, [currentRoom, username, send]);

  // Username setup screen
  if (!isUsernameSet) {
    return (
      <div className="flex items-center justify-center min-h-[600px] bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <MessageCircle className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Join Chat Rooms</h2>
            <p className="text-gray-600 mt-2">Enter your username to start chatting</p>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) {
              setIsUsernameSet(true);
            }
          }}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
              autoFocus
              required
              minLength={2}
              maxLength={20}
            />
            <button
              type="submit"
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Start Chatting
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden" style={{ height: '700px' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {ROOMS.find(r => r.id === currentRoom)?.name}
            </h2>
            <p className="text-blue-100 text-sm">
              {ROOMS.find(r => r.id === currentRoom)?.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500' :
              'bg-red-500'
            }`}>
              <Circle className="w-2 h-2 fill-white" />
              <span className="text-sm capitalize">{connectionStatus}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full">
              <Users className="w-4 h-4" />
              <span className="text-sm">{users.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex" style={{ height: 'calc(100% - 72px)' }}>
        {/* Sidebar - Room List */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Rooms</h3>
            <div className="space-y-1">
              {ROOMS.map(room => (
                <button
                  key={room.id}
                  onClick={() => handleRoomChange(room.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    currentRoom === room.id
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">#{room.name}</span>
                    {currentRoom === room.id && (
                      <Circle className="w-2 h-2 fill-current" />
                    )}
                  </div>
                  <p className={`text-xs mt-1 ${
                    currentRoom === room.id ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {room.description}
                  </p>
                </button>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 mt-6">
              Online Users ({users.length})
            </h3>
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-2 h-2 rounded-full ${
                    user.online ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-sm text-gray-700">{user.username}</span>
                  {user.typing && (
                    <span className="text-xs text-gray-500 italic">typing...</span>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-gray-500 px-3">No users online</p>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageCircle className="w-16 h-16 mb-4" />
                <p className="text-lg font-medium">No messages yet</p>
                <p className="text-sm">Be the first to say something!</p>
              </div>
            )}

            {messages.map((message) => {
              const isOwnMessage = message.username === username;
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                    {!isOwnMessage && (
                      <p className="text-xs font-semibold text-gray-600 mb-1 px-1">
                        {message.username}
                      </p>
                    )}
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isOwnMessage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <p className="break-words">{message.text}</p>
                    </div>
                    <div className={`flex items-center gap-2 px-1 mt-1 ${
                      isOwnMessage ? 'justify-end' : 'justify-start'
                    }`}>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                      {isOwnMessage && message.status && (
                        <span className="text-xs">
                          {message.status === 'sending' && <Check className="w-3 h-3 text-gray-400" />}
                          {message.status === 'sent' && <Check className="w-3 h-3 text-blue-400" />}
                          {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                          {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-600" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="px-4 py-2 text-sm text-gray-500 italic">
              {typingUsers.length === 1
                ? `${typingUsers[0]} is typing...`
                : `${typingUsers.slice(0, 2).join(', ')} ${
                    typingUsers.length > 2 ? `and ${typingUsers.length - 2} others` : ''
                  } are typing...`}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-200 p-4">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:border-blue-500 transition-colors"
                disabled={connectionStatus !== 'connected'}
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || connectionStatus !== 'connected'}
                className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Connected as <span className="font-semibold">{username}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
