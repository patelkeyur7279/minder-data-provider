const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Import minder-data-provider for Electron
const { minder, configureMinder } = require('minder-data-provider');

let mainWindow;

// Initialize Minder for main process
function initializeMinder() {
  configureMinder({
    baseURL: 'http://localhost:3001',
    platform: 'electron',
    debug: true
  });

  console.log('✅ Minder initialized for main process');
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
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    },
    backgroundColor: '#f8f9fa',
    show: false,
    titleBarStyle: 'hiddenInset'
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, '../public/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initializeMinder();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers - API Requests
ipcMain.handle('api:get', async (event, url, options = {}) => {
  try {
    const response = await minder(url, { method: 'GET', ...options });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api:post', async (event, url, data, options = {}) => {
  try {
    const response = await minder(url, { method: 'POST', body: data, ...options });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api:put', async (event, url, data, options = {}) => {
  try {
    const response = await minder(url, { method: 'PUT', body: data, ...options });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api:delete', async (event, url, options = {}) => {
  try {
    const response = await minder(url, { method: 'DELETE', ...options });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File System Operations
ipcMain.handle('file:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg'] },
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);
    return {
      success: true,
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: path.extname(filePath)
    };
  }

  return { success: false };
});

ipcMain.handle('file:save-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    return { success: true, path: result.filePath };
  }

  return { success: false };
});

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:write', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Storage Operations (using Electron Store)
ipcMain.handle('storage:get', async (event, key) => {
  try {
    const value = await minderClient.storage.getItem(key);
    return { success: true, value };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage:set', async (event, key, value) => {
  try {
    await minderClient.storage.setItem(key, value);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage:remove', async (event, key) => {
  try {
    await minderClient.storage.removeItem(key);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage:clear', async () => {
  try {
    await minderClient.storage.clear();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App Info
ipcMain.handle('app:get-info', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome
  };
});

// Notifications
ipcMain.handle('notification:show', (event, { title, body }) => {
  const { Notification } = require('electron');
  
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return { success: true };
  }
  
  return { success: false, error: 'Notifications not supported' };
});

// Window Controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

console.log('🚀 Electron main process ready');
