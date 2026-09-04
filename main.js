const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const LAYOUT_FILE = path.join(app.getPath('userData'), 'desktop-layout.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#030712',
    title: 'JARVIS 3D Spatial Desktop 2.0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Automatically maximize when ready
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    win.focus();
  });

  // Attempt to load from Vite dev server first; fallback to built or local HTML
  const devServerUrl = 'http://localhost:5173';
  const distFile = path.join(__dirname, 'dist', 'index.html');
  const localFile = path.join(__dirname, 'index.html');

  fetch(devServerUrl)
    .then(() => {
      console.log(`[Main] Connecting to Vite dev server at ${devServerUrl}`);
      win.loadURL(devServerUrl);
    })
    .catch(() => {
      if (fs.existsSync(distFile)) {
        console.log(`[Main] Loading production bundle: ${distFile}`);
        win.loadFile(distFile);
      } else {
        console.log(`[Main] Loading source HTML: ${localFile}`);
        win.loadFile(localFile);
      }
    });
}

// ----------------------------------------------------------------------
// IPC Handler: Desktop & Subfolder Items Retrieval (3D Spatial Explorer)
// ----------------------------------------------------------------------
async function scanFolder(targetFolder) {
  const desktopPath = app.getPath('desktop');
  const folderPath = targetFolder && fs.existsSync(targetFolder) ? path.resolve(targetFolder) : path.resolve(desktopPath);

  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });

    const SYSTEM_IGNORES = new Set(['desktop.ini', 'thumbs.db', '.ds_store', 'ntuser.dat', 'ntuser.ini']);
    const EXECUTABLE_EXTS = new Set(['.exe', '.lnk', '.bat', '.cmd', '.app', '.sh', '.ps1', '.msi']);

    const items = [];
    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();
      if (SYSTEM_IGNORES.has(lowerName) || entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      let type = 'document';

      if (entry.isDirectory()) {
        type = 'folder';
      } else if (EXECUTABLE_EXTS.has(ext)) {
        type = 'executable';
      }

      items.push({
        name: entry.name,
        path: fullPath,
        type: type,
        extension: ext
      });
    }

    const isRootDesktop = folderPath.toLowerCase() === desktopPath.toLowerCase();
    const parentPath = path.dirname(folderPath);

    return {
      success: true,
      items,
      currentPath: folderPath,
      parentPath: isRootDesktop ? null : parentPath,
      isRootDesktop,
      folderName: isRootDesktop ? 'DESKTOP' : path.basename(folderPath)
    };
  } catch (err) {
    console.error(`[Main] Failed to read directory "${folderPath}":`, err);
    return {
      success: false,
      items: [],
      currentPath: folderPath,
      parentPath: null,
      isRootDesktop: true,
      folderName: 'DESKTOP',
      error: err.message
    };
  }
}

ipcMain.handle('get-desktop-items', async () => {
  const result = await scanFolder(app.getPath('desktop'));
  return result.items;
});

ipcMain.handle('get-folder-items', async (event, folderPath) => {
  return await scanFolder(folderPath);
});

// ----------------------------------------------------------------------
// IPC Handler: Launch / Open File via OS Shell
// ----------------------------------------------------------------------
ipcMain.handle('open-file', async (event, targetPath) => {
  if (!targetPath) {
    return { success: false, error: 'Path is required' };
  }

  try {
    const errorMsg = await shell.openPath(targetPath);
    if (errorMsg) {
      console.error(`[Main] shell.openPath error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err) {
    console.error(`[Main] Exception while opening path "${targetPath}":`, err);
    return { success: false, error: err.message };
  }
});

// ----------------------------------------------------------------------
// IPC Handler: Read File Content (for in-app Markdown rendering)
// ----------------------------------------------------------------------
ipcMain.handle('read-file-content', async (event, targetPath) => {
  if (!targetPath) {
    return { success: false, error: 'Path is required' };
  }

  try {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'File does not exist' };
    }
    const content = await fs.promises.readFile(targetPath, 'utf-8');
    return {
      success: true,
      content,
      fileName: path.basename(targetPath),
      filePath: targetPath
    };
  } catch (err) {
    console.error(`[Main] Failed to read file content for "${targetPath}":`, err);
    return { success: false, error: err.message };
  }
});

// ----------------------------------------------------------------------
// IPC Handler: Persistent Node Layout (Load & Save)
// ----------------------------------------------------------------------
ipcMain.handle('load-layout', async () => {
  try {
    if (fs.existsSync(LAYOUT_FILE)) {
      const data = await fs.promises.readFile(LAYOUT_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[Main] Could not read desktop-layout.json, starting fresh layout:', err);
  }
  return {};
});

ipcMain.handle('save-layout', async (event, layoutData) => {
  try {
    await fs.promises.writeFile(LAYOUT_FILE, JSON.stringify(layoutData, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('[Main] Failed to save desktop-layout.json:', err);
    return { success: false, error: err.message };
  }
});

// ----------------------------------------------------------------------
// App Lifecycle & Camera Permission Setup
// ----------------------------------------------------------------------
app.whenReady().then(() => {
  // Automatically grant camera and media permissions requested by the renderer
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(true);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
