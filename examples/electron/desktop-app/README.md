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

- Node.js 20.x or higher
- npm 8.x or higher
- macOS, Windows, or Linux

## 🤖 Headless CI Proof (`npm run ci:smoke`)

This example proves the **electron platform adapter** (`minder-data-provider/electron`)
end-to-end, headlessly, so it can run unattended in CI:

```
smoke/main.js       Electron main process: creates a hidden (show:false) BrowserWindow,
                     watches for a result over IPC, enforces a 30s internal timeout,
                     prints the marker (or an error) and exits 0/1.
smoke/preload.js     Runs in the renderer process. Initializes minder via the
                     `minder-data-provider/electron` entry (configureMinder + minder()),
                     fetches GET /users, and reports back over IPC.
smoke/lib/electron-smoke-client.js   The data-layer piece (no Electron APIs) — unit
                     tested directly with `npm test`.
smoke/mock-upstream.mjs   Plain Node http server standing in for a real API, same
                     pattern as examples/edge-worker/mock-upstream.mjs.
smoke/run-ci-smoke.mjs    Orchestrator: starts the mock upstream, launches Electron
                     (via xvfb-run on headless Linux, plain otherwise), checks the
                     exit code AND stdout for the marker, always tears the upstream down.
```

Run it:

```bash
npm install
npm run build     # syntax-checks the app + confirms the electron entry resolves
npm run ci:smoke  # starts the mock upstream, runs the Electron smoke test, exits 0/1
```

On success, stdout contains a single verifiable line:

```
MINDER_ELECTRON_SMOKE_OK users=1 Ada
```

**What this proves headlessly (no real display needed):**
- The `minder-data-provider/electron` entry resolves and initializes correctly in a real
  Electron renderer (`contextIsolation: true`, `nodeIntegration: false`).
- `configureMinder` + `minder()` successfully perform a real HTTP round-trip from inside
  Electron to a local upstream.
- Main-process <-> renderer IPC reporting works end-to-end.
- A hidden (`show: false`) `BrowserWindow` boots and renders under Xvfb on headless Linux
  (`xvfb-run -a npx electron smoke/main.js --no-sandbox --disable-gpu`) or directly on
  macOS/Windows/a Linux desktop with a real display — `ci:smoke` auto-detects which is
  needed (Linux + no `DISPLAY` -> wraps with `xvfb-run`; the CI runner needs the `xvfb`
  package installed for that leg).

**What still needs a real display / manual check:**
- Visual rendering correctness of the actual app UI (`public/index.html`, `styles.css`) —
  the smoke window is headless and loads a content-free page, not the real app.
- Native OS chrome (custom title bar, window controls, `Notification.isSupported()` on a
  real desktop session, native open/save dialogs).
- Packaged installers (`npm run build:mac` / `:win` / `:linux`, and `npm run package`)
  are unaffected by CI smoke and still require a real build machine per target OS.

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

### Runtime

- `minder-data-provider`: `file:../../../` - Data provider library, linked to this repo's
  own working tree (not a published version) so the example always exercises current code.

### Development

- `electron`: ^43.0.0 - Desktop framework. Bumped from the previously pinned ^33.0.0, which
  is well outside Electron's supported window (Electron supports roughly the latest 3
  stable major releases; 43 is current as of this update, per the `electron` package's own
  npm registry metadata).
- `electron-builder`: ^24.9.1 - Build tool for packaging (`npm run package`, `build:mac`,
  `build:win`, `build:linux`)
- `react`, `react-dom`, `@tanstack/react-query` - **not used directly by this example's UI.**
  `minder-data-provider/electron` re-exports the full web/React hook surface (`useMinder`,
  etc.) alongside the plain `minder`/`configureMinder` functions the smoke harness actually
  calls; requiring the entry point eagerly resolves that whole module graph, so these peer
  packages must be present even though nothing here renders with React. Versions match this
  repo's own `peerDependencies` ranges.

> Note: the old bare `npm run build` (electron-builder, no target) was renamed to
> `npm run package` to make room for a `build` script with the CI-contract meaning used
> across this repo's examples (validate + prepare for `ci:smoke`). `build:mac` / `build:win`
> / `build:linux` are unchanged.

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
