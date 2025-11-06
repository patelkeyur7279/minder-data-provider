const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process
// to use ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // API methods
  api: {
    get: (url, options) => ipcRenderer.invoke("api:get", url, options),
    post: (url, data, options) =>
      ipcRenderer.invoke("api:post", url, data, options),
    put: (url, data, options) =>
      ipcRenderer.invoke("api:put", url, data, options),
    delete: (url, options) => ipcRenderer.invoke("api:delete", url, options),
  },

  // File operations
  file: {
    openDialog: () => ipcRenderer.invoke("file:open-dialog"),
    saveDialog: (defaultPath) =>
      ipcRenderer.invoke("file:save-dialog", defaultPath),
    read: (filePath) => ipcRenderer.invoke("file:read", filePath),
    write: (filePath, content) =>
      ipcRenderer.invoke("file:write", filePath, content),
  },

  // Storage operations
  storage: {
    get: (key) => ipcRenderer.invoke("storage:get", key),
    set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
    remove: (key) => ipcRenderer.invoke("storage:remove", key),
    clear: () => ipcRenderer.invoke("storage:clear"),
  },

  // App operations
  app: {
    getInfo: () => ipcRenderer.invoke("app:get-info"),
  },

  // Notifications
  notification: {
    show: (options) => ipcRenderer.invoke("notification:show", options),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },

  // Platform info
  platform: process.platform,
  versions: process.versions,
});

console.log("✅ Preload script loaded - API exposed to renderer");
