const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs").promises;

// The Electron MAIN process is Node — import from the React-free `/node` entry
// (the main entry re-exports the hooks and would require React here).
const { minder, configureMinder } = require("minder-data-provider/node");

let mainWindow;

// Initialize Minder for main process
function initializeMinder() {
  // The /node configureMinder is the same unified, apiUrl-based
  // implementation as `minder-data-provider/config` (see CHANGELOG.md's M3
  // entry) — it is no longer the older `{ baseURL }`-only bag.
  configureMinder({
    apiUrl: "http://localhost:3001",
  });

  console.log("✅ Minder initialized for main process");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
    backgroundColor: "#f8f9fa",
    show: false,
    titleBarStyle: "hiddenInset",
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initializeMinder();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handlers - API Requests
//
// minder()'s real signature is `minder(route, data, options)` (positional
// data, THEN options — see src/core/minder.ts). The previous code passed
// `{ method: "GET"/"DELETE", ...options }` and `{ method: "POST"/"PUT", body:
// data, ...options }` as the *data* (2nd) argument instead of the *options*
// (3rd) argument. Since `minder()`'s auto method-detection treats any
// non-null/undefined data as "there is a body" and defaults to POST when it
// can't otherwise tell, every "GET" and "DELETE" call was silently sent as
// an HTTP POST, and every "POST"/"PUT" call sent a malformed body shaped
// like `{method, body: <real data>}` instead of `<real data>` itself. Fixed
// by passing `data` and `options` in their correct positions. Also: `minder()`
// never throws (it returns `{ success, error }` on failure instead — see the
// module's own doc comment) so the try/catch here never fired on API errors;
// results now propagate `response.success`/`response.error` instead of
// hardcoding `success: true`.
ipcMain.handle("api:get", async (event, url, options = {}) => {
  try {
    const response = await minder(url, undefined, { method: "GET", ...options });
    return { success: response.success, data: response.data, error: response.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("api:post", async (event, url, data, options = {}) => {
  try {
    const response = await minder(url, data, { method: "POST", ...options });
    return { success: response.success, data: response.data, error: response.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("api:put", async (event, url, data, options = {}) => {
  try {
    const response = await minder(url, data, { method: "PUT", ...options });
    return { success: response.success, data: response.data, error: response.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("api:delete", async (event, url, options = {}) => {
  try {
    const response = await minder(url, undefined, { method: "DELETE", ...options });
    return { success: response.success, data: response.data, error: response.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File System Operations
ipcMain.handle("file:open-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["jpg", "png", "gif", "jpeg"] },
      { name: "Documents", extensions: ["pdf", "doc", "docx"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);
    return {
      success: true,
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: path.extname(filePath),
    };
  }

  return { success: false };
});

ipcMain.handle("file:save-dialog", async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: "Text Files", extensions: ["txt"] },
      { name: "JSON Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!result.canceled) {
    return { success: true, path: result.filePath };
  }

  return { success: false };
});

ipcMain.handle("file:read", async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("file:write", async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Storage Operations
// NOTE: the original implementation referenced an undefined `minderClient`
// variable (main.js never constructs one — only the plain `minder`/
// `configureMinder` functions from `minder-data-provider/node` are
// imported), so every storage:* IPC call threw a ReferenceError at runtime.
// Fixed with a minimal JSON-file-backed store under Electron's userData dir
// (main process has no `localStorage`/`window`, so a Web Storage adapter
// doesn't apply here).
const storageFilePath = path.join(app.getPath("userData"), "storage.json");

async function readStorageFile() {
  try {
    return JSON.parse(await fs.readFile(storageFilePath, "utf-8"));
  } catch {
    return {};
  }
}

async function writeStorageFile(data) {
  await fs.writeFile(storageFilePath, JSON.stringify(data, null, 2), "utf-8");
}

ipcMain.handle("storage:get", async (event, key) => {
  try {
    const data = await readStorageFile();
    return { success: true, value: data[key] ?? null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("storage:set", async (event, key, value) => {
  try {
    const data = await readStorageFile();
    data[key] = value;
    await writeStorageFile(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("storage:remove", async (event, key) => {
  try {
    const data = await readStorageFile();
    delete data[key];
    await writeStorageFile(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("storage:clear", async () => {
  try {
    await writeStorageFile({});
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App Info
ipcMain.handle("app:get-info", () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
  };
});

// Notifications
ipcMain.handle("notification:show", (event, { title, body }) => {
  const { Notification } = require("electron");

  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return { success: true };
  }

  return { success: false, error: "Notifications not supported" };
});

// Window Controls
ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

console.log("🚀 Electron main process ready");
