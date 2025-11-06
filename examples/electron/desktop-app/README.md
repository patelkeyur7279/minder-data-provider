# Minder Desktop App (Electron Example)

A complete desktop application demonstrating how to integrate **minder-data-provider** with Electron for building cross-platform desktop apps with native features.

## 🌟 Features

- **Desktop API Integration**: Full REST API support using minder-data-provider
- **Native File Operations**: Open/save file dialogs, read/write file system
- **Local Storage**: Persistent storage using Electron's native APIs
- **Custom Title Bar**: Frameless window with custom controls
- **IPC Communication**: Secure main-renderer communication via context bridge
- **Multi-View UI**: Dashboard, Users, Products, Files, and Settings views
- **Toast Notifications**: Desktop notifications for user feedback
- **Window Management**: Minimize, maximize, and close window controls
- **Platform Information**: Display Electron, Chrome, and Node versions
- **Error Handling**: Comprehensive error handling and user feedback

## 📋 Prerequisites

- Node.js 16.x or higher
- npm 8.x or higher
- macOS, Windows, or Linux

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd examples/electron/desktop-app
npm install
```

### 2. Link Minder Package (for local development)

If you're testing with a local version of minder-data-provider:

```bash
# From the root of minder-data-provider
npm link

# From the Electron example directory
npm link minder-data-provider
```

### 3. Run the Application

Development mode with auto-reload:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The app will launch in a native window with the minder desktop interface.

## 🏗️ Building for Distribution

Build installers for different platforms:

### macOS

```bash
npm run build:mac
```

Outputs: `dist/Minder Desktop App-1.0.0.dmg`

### Windows

```bash
npm run build:win
```

Outputs: `dist/Minder Desktop App Setup 1.0.0.exe`

### Linux

```bash
npm run build:linux
```

Outputs: `dist/minder-desktop-app-1.0.0.AppImage`

## 📁 Project Structure

```
desktop-app/
├── src/
│   ├── main.js        # Main process (Node.js)
│   └── preload.js     # Preload script (IPC bridge)
├── public/
│   ├── index.html     # Application UI
│   ├── styles.css     # Styling
│   └── renderer.js    # Renderer process logic
├── package.json       # Dependencies and scripts
└── README.md         # This file
```

## 🔧 Architecture

### Process Model

Electron uses a multi-process architecture:

```
┌─────────────────────┐
│   Main Process      │  Node.js environment
│   (main.js)         │  - Window management
│                     │  - Native APIs
│                     │  - File system
└──────────┬──────────┘
           │ IPC
┌──────────▼──────────┐
│   Preload Script    │  Bridge between processes
│   (preload.js)      │  - Context isolation
│                     │  - Security boundary
└──────────┬──────────┘
           │ Context Bridge
┌──────────▼──────────┐
│  Renderer Process   │  Chromium environment
│  (renderer.js)      │  - UI rendering
│                     │  - User interactions
└─────────────────────┘
```

### Security Features

- **Context Isolation**: Enabled to prevent renderer from accessing Node.js
- **Sandbox**: Renderer processes run in sandboxed environment
- **nodeIntegration**: Disabled for security
- **contextBridge**: Safe API exposure to renderer
- **CSP**: Content Security Policy for additional protection

### IPC Communication

All communication between main and renderer processes goes through secure IPC channels:

```javascript
// Renderer Process
const result = await window.electronAPI.api.get("/users");

// Main Process (via preload)
ipcMain.handle("api:get", async (event, url) => {
  return await minderClient.query.get(url);
});
```

## 🎯 Using Minder Data Provider

### Initialization (Main Process)

```javascript
const { createMinderClient } = require("minder-data-provider");

const minderClient = createMinderClient({
  platform: "electron",
  baseURL: "https://jsonplaceholder.typicode.com",
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
  },
});
```

### API Calls (Renderer Process)

```javascript
// GET request
const users = await window.electronAPI.api.get("/users");

// POST request
const newUser = await window.electronAPI.api.post("/users", {
  name: "John Doe",
  email: "john@example.com",
});

// PUT request
const updated = await window.electronAPI.api.put("/users/1", {
  name: "Jane Doe",
});

// DELETE request
const deleted = await window.electronAPI.api.delete("/users/1");
```

### File Operations

```javascript
// Open file dialog
const { filePath } = await window.electronAPI.file.openDialog();

// Read file
const content = await window.electronAPI.file.read(filePath);

// Save file dialog
const { filePath } = await window.electronAPI.file.saveDialog();

// Write file
await window.electronAPI.file.write(filePath, content);
```

### Storage Operations

```javascript
// Save data
await window.electronAPI.storage.set("key", "value");

// Retrieve data
const value = await window.electronAPI.storage.get("key");

// Remove data
await window.electronAPI.storage.remove("key");

// Clear all data
await window.electronAPI.storage.clear();
```

### Notifications

```javascript
await window.electronAPI.notification.show("Title", "Notification message");
```

### Window Controls

```javascript
// Minimize window
window.electronAPI.window.minimize();

// Maximize/restore window
window.electronAPI.window.maximize();

// Close window
window.electronAPI.window.close();
```

## 🎨 Available Views

### Dashboard

- Real-time stats (users, products, posts count)
- Platform information
- Quick actions (refresh, test API)

### Users

- User list from API
- Detailed user information
- Refresh functionality

### Products

- Product grid with images
- Price and category display
- Auto-refresh on view switch

### Files

- Open/save file dialogs
- File content viewer/editor
- File path display
- Read/write operations

### Settings

- API base URL configuration
- Storage management
- App version information
- Clear all data option

## 🔍 Development Tips

### DevTools

Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS) to open Chrome DevTools in development mode.

### Hot Reload

For hot reload during development, consider using `electron-reloader`:

```bash
npm install --save-dev electron-reloader
```

Add to `main.js`:

```javascript
if (process.env.NODE_ENV === "development") {
  require("electron-reloader")(module);
}
```

### Debugging

Main process logs appear in the terminal where you ran `npm start`.
Renderer process logs appear in DevTools Console.

## 🐛 Troubleshooting

### App won't start

- Check Node.js version: `node --version` (should be 16+)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check for port conflicts if running mock API

### API calls fail

- Ensure mock API is running on port 3001
- Check API base URL in Settings
- Verify network connectivity
- Check DevTools console for errors

### Build fails

- Ensure electron-builder is installed
- Check platform-specific requirements
- Verify package.json configuration
- Try cleaning build cache: `rm -rf dist`

### IPC communication errors

- Verify preload script is loading
- Check console for `electronAPI is not available` errors
- Ensure context isolation is enabled
- Validate IPC channel names match

## 📦 Dependencies

### Production

- `electron`: ^28.0.0 - Desktop framework
- `minder-data-provider`: ^2.0.0 - Data provider library

### Development

- `electron-builder`: ^24.9.1 - Build tool for packaging

## 🔐 Security Considerations

1. **Never disable context isolation** in production
2. **Validate all IPC inputs** in main process
3. **Sanitize file paths** before file operations
4. **Use allowlist** for external URLs
5. **Keep Electron updated** for security patches
6. **Enable sandbox** for renderer processes
7. **Validate user input** before API calls

## 📝 License

MIT - See LICENSE file in root directory

## 🤝 Contributing

See CONTRIBUTING.md in root directory

## 📚 Learn More

- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Security](https://www.electronjs.org/docs/tutorial/security)
- [Minder Data Provider Docs](../../docs/API_REFERENCE.md)
- [IPC Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

## ✅ Next Steps

1. Customize the UI to match your brand
2. Add more API endpoints and views
3. Implement auto-update functionality
4. Add system tray integration
5. Create custom keyboard shortcuts
6. Add dark/light theme toggle
7. Implement offline support
8. Add database integration (SQLite)

## 🎉 Success!

Your Electron desktop app is now ready! This example demonstrates the full integration of minder-data-provider with Electron's native capabilities, providing a solid foundation for building production-ready desktop applications.

For questions or issues, please check the main repository's issue tracker.
