import React, { useState, useEffect, useRef } from "react";
import { useWebSocket } from "minder-data-provider";

// 🔌 COMPLETE WEBSOCKET & REAL-TIME SYSTEM
// Demonstrates all real-time communication capabilities

interface Message {
  id: string;
  type: "chat" | "notification" | "system" | "user-action";
  content: string;
  sender: string;
  timestamp: number;
  metadata?: any;
}

interface OnlineUser {
  id: string;
  name: string;
  status: "online" | "away" | "busy";
  lastSeen: number;
}

export function WebSocketRealTimeExample() {
  // 🎣 WebSocket hook for real-time communication
  const ws = useWebSocket();

  // 📝 Component state
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");
  const [messageInput, setMessageInput] = useState("");
  const [currentUser] = useState({
    id: Math.random().toString(36).substr(2, 9),
    name: `User_${Math.floor(Math.random() * 1000)}`,
  });

  // 📊 Connection statistics
  const [stats, setStats] = useState({
    messagesReceived: 0,
    messagesSent: 0,
    reconnections: 0,
    lastPing: null as number | null,
    connectionTime: null as number | null,
  });

  // 🔄 Auto-scroll reference
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 🔌 WEBSOCKET CONNECTION MANAGEMENT
  useEffect(() => {
    console.log("🔌 Initializing WebSocket connection...");

    // Connect to WebSocket
    const connectWebSocket = async () => {
      try {
        await ws.connect();
        setConnectionStatus("connected");
        setStats((prev) => ({
          ...prev,
          connectionTime: Date.now(),
          reconnections: prev.reconnections + 1,
        }));

        console.log("✅ WebSocket connected successfully");

        // Send user join notification
        ws.send("user-join", {
          user: currentUser,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("❌ WebSocket connection failed:", error);
        setConnectionStatus("error");
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      console.log("🔌 Cleaning up WebSocket connection...");
      ws.send("user-leave", {
        user: currentUser,
        timestamp: Date.now(),
      });
      ws.disconnect();
    };
  }, []);

  // 📨 MESSAGE LISTENERS - Subscribe to different message types
  useEffect(() => {
    // Chat messages
    const unsubscribeChat = ws.subscribe("chat-message", (data: any) => {
      console.log("💬 Chat message received:", data);

      const message: Message = {
        id: Math.random().toString(36).substr(2, 9),
        type: "chat",
        content: data.content,
        sender: data.sender?.name || "Unknown",
        timestamp: data.timestamp || Date.now(),
        metadata: data.metadata,
      };

      setMessages((prev) => [...prev, message]);
      setStats((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
      }));
    });

    // System notifications
    const unsubscribeNotification = ws.subscribe(
      "notification",
      (data: any) => {
        console.log("🔔 Notification received:", data);

        const notification: Message = {
          id: Math.random().toString(36).substr(2, 9),
          type: "notification",
          content: data.message,
          sender: "System",
          timestamp: data.timestamp || Date.now(),
          metadata: { level: data.level || "info" },
        };

        setMessages((prev) => [...prev, notification]);
        setStats((prev) => ({
          ...prev,
          messagesReceived: prev.messagesReceived + 1,
        }));
      }
    );

    // User presence updates
    const unsubscribePresence = ws.subscribe("user-presence", (data: any) => {
      console.log("👥 User presence update:", data);

      if (data.users) {
        setOnlineUsers(data.users);
      }

      // Add system message for user join/leave
      if (data.action && data.user) {
        const systemMessage: Message = {
          id: Math.random().toString(36).substr(2, 9),
          type: "system",
          content: `${data.user.name} ${
            data.action === "join" ? "joined" : "left"
          } the chat`,
          sender: "System",
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, systemMessage]);
      }
    });

    // User actions (typing, reactions, etc.)
    const unsubscribeUserAction = ws.subscribe("user-action", (data: any) => {
      console.log("⚡ User action:", data);

      if (data.action === "typing" && data.user.id !== currentUser.id) {
        // Handle typing indicators
        console.log(`${data.user.name} is typing...`);
      }
    });

    // Ping/Pong for connection health
    const unsubscribePong = ws.subscribe("pong", (data: any) => {
      setStats((prev) => ({ ...prev, lastPing: Date.now() }));
    });

    // Connection status updates
    const unsubscribeStatus = ws.subscribe("connection-status", (data: any) => {
      setConnectionStatus(data.status);
      console.log("🔌 Connection status:", data.status);
    });

    // Return cleanup function
    return () => {
      unsubscribeChat?.();
      unsubscribeNotification?.();
      unsubscribePresence?.();
      unsubscribeUserAction?.();
      unsubscribePong?.();
      unsubscribeStatus?.();
    };
  }, [currentUser.id]);

  // 📜 AUTO-SCROLL TO BOTTOM
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 💬 SEND CHAT MESSAGE
  const sendMessage = () => {
    if (!messageInput.trim() || !ws.isConnected()) return;

    const messageData = {
      content: messageInput.trim(),
      sender: currentUser,
      timestamp: Date.now(),
      metadata: {
        messageId: Math.random().toString(36).substr(2, 9),
        clientId: currentUser.id,
      },
    };

    // Send via WebSocket
    ws.send("chat-message", messageData);

    // Add to local messages immediately (optimistic update)
    const localMessage: Message = {
      id: messageData.metadata.messageId,
      type: "chat",
      content: messageData.content,
      sender: `${currentUser.name} (You)`,
      timestamp: messageData.timestamp,
      metadata: { ...messageData.metadata, isOwn: true },
    };

    setMessages((prev) => [...prev, localMessage]);
    setStats((prev) => ({ ...prev, messagesSent: prev.messagesSent + 1 }));

    // Clear input
    setMessageInput("");

    console.log("💬 Message sent:", messageData);
  };

  // ⚡ SEND USER ACTION (Typing indicator)
  const sendTypingIndicator = () => {
    if (!ws.isConnected()) return;

    ws.send("user-action", {
      action: "typing",
      user: currentUser,
      timestamp: Date.now(),
    });
  };

  // 🔔 SEND NOTIFICATION
  const sendNotification = (level: "info" | "warning" | "error" = "info") => {
    if (!ws.isConnected()) return;

    const notifications = {
      info: "This is an info notification",
      warning: "This is a warning notification",
      error: "This is an error notification",
    };

    ws.send("notification", {
      message: notifications[level],
      level,
      sender: currentUser,
      timestamp: Date.now(),
    });

    console.log(`🔔 ${level} notification sent`);
  };

  // 📊 SEND PING - Test connection health
  const sendPing = () => {
    if (!ws.isConnected()) return;

    ws.send("ping", {
      timestamp: Date.now(),
      clientId: currentUser.id,
    });

    console.log("🏓 Ping sent");
  };

  // 🔄 RECONNECT - Manual reconnection
  const handleReconnect = async () => {
    try {
      setConnectionStatus("connecting");
      await ws.connect();
      console.log("🔄 Manual reconnection successful");
    } catch (error) {
      console.error("❌ Manual reconnection failed:", error);
      setConnectionStatus("error");
    }
  };

  // 🎨 GET MESSAGE STYLE - Different styles for message types
  const getMessageStyle = (message: Message) => {
    const baseStyle = "message-item";

    switch (message.type) {
      case "chat":
        return `${baseStyle} ${
          message.metadata?.isOwn ? "own-message" : "other-message"
        }`;
      case "system":
        return `${baseStyle} system-message`;
      case "notification":
        return `${baseStyle} notification-message ${
          message.metadata?.level || "info"
        }`;
      default:
        return baseStyle;
    }
  };

  // ⏰ FORMAT TIMESTAMP
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 📊 CONNECTION UPTIME
  const getConnectionUptime = () => {
    if (!stats.connectionTime) return "Not connected";

    const uptime = Date.now() - stats.connectionTime;
    const minutes = Math.floor(uptime / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className='websocket-realtime'>
      <h2>🔌 WebSocket & Real-Time Communication</h2>

      {/* 📊 CONNECTION STATUS */}
      <div className='connection-status-panel'>
        <h3>📊 Connection Status</h3>
        <div className='status-grid'>
          <div className='status-item'>
            <strong>Status:</strong>
            <span className={`status-indicator ${connectionStatus}`}>
              {connectionStatus === "connected"
                ? "🟢 Connected"
                : connectionStatus === "connecting"
                ? "🟡 Connecting..."
                : connectionStatus === "error"
                ? "🔴 Error"
                : "⚫ Disconnected"}
            </span>
          </div>
          <div className='status-item'>
            <strong>Uptime:</strong> {getConnectionUptime()}
          </div>
          <div className='status-item'>
            <strong>Messages Sent:</strong> {stats.messagesSent}
          </div>
          <div className='status-item'>
            <strong>Messages Received:</strong> {stats.messagesReceived}
          </div>
          <div className='status-item'>
            <strong>Reconnections:</strong> {stats.reconnections}
          </div>
          <div className='status-item'>
            <strong>Last Ping:</strong>{" "}
            {stats.lastPing ? formatTimestamp(stats.lastPing) : "None"}
          </div>
        </div>

        {/* Connection controls */}
        <div className='connection-controls'>
          <button
            onClick={handleReconnect}
            disabled={connectionStatus === "connected"}
            className='btn-reconnect'>
            🔄 Reconnect
          </button>
          <button
            onClick={sendPing}
            disabled={!ws.isConnected()}
            className='btn-ping'>
            🏓 Send Ping
          </button>
          <button
            onClick={ws.disconnect}
            disabled={!ws.isConnected()}
            className='btn-disconnect'>
            🔌 Disconnect
          </button>
        </div>
      </div>

      {/* 👥 ONLINE USERS */}
      <div className='online-users-panel'>
        <h3>👥 Online Users ({onlineUsers.length})</h3>
        <div className='users-list'>
          {onlineUsers.length === 0 ? (
            <div className='no-users'>No users online</div>
          ) : (
            onlineUsers.map((user) => (
              <div key={user.id} className='user-item'>
                <span className={`user-status ${user.status}`}>
                  {user.status === "online"
                    ? "🟢"
                    : user.status === "away"
                    ? "🟡"
                    : "🔴"}
                </span>
                <span className='user-name'>{user.name}</span>
                <span className='user-last-seen'>
                  {user.lastSeen ? formatTimestamp(user.lastSeen) : "Now"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 💬 CHAT INTERFACE */}
      <div className='chat-interface-panel'>
        <h3>💬 Real-Time Chat</h3>

        {/* Messages display */}
        <div className='messages-container'>
          {messages.length === 0 ? (
            <div className='no-messages'>
              💭 No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={getMessageStyle(message)}>
                <div className='message-header'>
                  <span className='message-sender'>{message.sender}</span>
                  <span className='message-time'>
                    {formatTimestamp(message.timestamp)}
                  </span>
                  <span className='message-type-icon'>
                    {message.type === "chat"
                      ? "💬"
                      : message.type === "system"
                      ? "⚙️"
                      : message.type === "notification"
                      ? "🔔"
                      : "⚡"}
                  </span>
                </div>
                <div className='message-content'>{message.content}</div>
                {message.metadata && (
                  <div className='message-metadata'>
                    {JSON.stringify(message.metadata, null, 2)}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div className='message-input-container'>
          <input
            type='text'
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              sendTypingIndicator();
            }}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            placeholder='Type a message...'
            disabled={!ws.isConnected()}
            className='message-input'
          />
          <button
            onClick={sendMessage}
            disabled={!messageInput.trim() || !ws.isConnected()}
            className='btn-send'>
            📤 Send
          </button>
        </div>
      </div>

      {/* 🔔 NOTIFICATION CONTROLS */}
      <div className='notification-controls-panel'>
        <h3>🔔 Notification System</h3>
        <div className='notification-buttons'>
          <button
            onClick={() => sendNotification("info")}
            disabled={!ws.isConnected()}
            className='btn-notification info'>
            ℹ️ Info Notification
          </button>
          <button
            onClick={() => sendNotification("warning")}
            disabled={!ws.isConnected()}
            className='btn-notification warning'>
            ⚠️ Warning Notification
          </button>
          <button
            onClick={() => sendNotification("error")}
            disabled={!ws.isConnected()}
            className='btn-notification error'>
            ❌ Error Notification
          </button>
        </div>
      </div>

      {/* 📚 WEBSOCKET FEATURES */}
      <div className='feature-explanation'>
        <h3>📚 WebSocket Features</h3>
        <ul>
          <li>
            <strong>🔌 useWebSocket():</strong> Hook for WebSocket connection
            management
          </li>
          <li>
            <strong>📨 Message Subscription:</strong> Subscribe to specific
            message types with callbacks
          </li>
          <li>
            <strong>🔄 Auto-Reconnection:</strong> Automatic reconnection with
            exponential backoff
          </li>
          <li>
            <strong>🏓 Heartbeat/Ping:</strong> Connection health monitoring
            with ping/pong
          </li>
          <li>
            <strong>👥 Presence System:</strong> Real-time user presence and
            status updates
          </li>
          <li>
            <strong>💬 Real-Time Chat:</strong> Instant messaging with typing
            indicators
          </li>
          <li>
            <strong>🔔 Notifications:</strong> System-wide notification
            broadcasting
          </li>
          <li>
            <strong>⚡ User Actions:</strong> Real-time user activity tracking
          </li>
          <li>
            <strong>📊 Connection Stats:</strong> Detailed connection and
            message statistics
          </li>
          <li>
            <strong>🔒 Authentication:</strong> Token-based WebSocket
            authentication
          </li>
        </ul>
      </div>

      {/* 🎛️ REAL-TIME STRATEGIES */}
      <div className='strategies-panel'>
        <h3>🎛️ Real-Time Communication Strategies</h3>
        <div className='strategies-grid'>
          <div className='strategy-item'>
            <h4>🚀 Performance Strategy</h4>
            <ul>
              <li>Message batching for high frequency updates</li>
              <li>Connection pooling for multiple channels</li>
              <li>Efficient JSON serialization</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>🔒 Security Strategy</h4>
            <ul>
              <li>Token-based authentication</li>
              <li>Message validation and sanitization</li>
              <li>Rate limiting and abuse prevention</li>
            </ul>
          </div>
          <div className='strategy-item'>
            <h4>📱 Reliability Strategy</h4>
            <ul>
              <li>Automatic reconnection with backoff</li>
              <li>Message queuing during disconnection</li>
              <li>Graceful degradation to polling</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
