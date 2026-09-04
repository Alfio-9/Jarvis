const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const LAYOUT_FILE = path.join(app.getPath('userData'), 'desktop-layout.json');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        backgroundColor: '#030712',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    win.loadFile('index.html');
    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
        win.focus();
    });
}

// Read items from the OS Desktop
ipcMain.handle('get-desktop-items', async () => {
    const desktopPath = app.getPath('desktop');
    try {
        const files = await fs.promises.readdir(desktopPath, { withFileTypes: true });
        
        // File di sistema e file nascosti da escludere dall'interfaccia 3D
        const IGNORED_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

        return files
            .filter(file => !IGNORED_FILES.has(file.name.toLowerCase()) && !file.name.startsWith('.'))
            .map(file => {
                const ext = path.extname(file.name).toLowerCase();
                let type = 'document';

                if (file.isDirectory()) {
                    type = 'folder';
                } else if (['.exe', '.app', '.bat', '.sh', '.lnk', '.ink'].includes(ext)) {
                    type = 'executable';
                }

                return {
                    name: file.name,
                    path: path.join(desktopPath, file.name),
                    type: type,
                    extension: ext
                };
            });
    } catch (error) {
        console.error('Error reading desktop directory:', error);
        return [];
    }
});

// Launch OS File/Application
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error('Failed to open file:', error);
        return { success: false, error: error.message };
    }
});

// Load persistent node layout
ipcMain.handle('load-layout', async () => {
    try {
        if (fs.existsSync(LAYOUT_FILE)) {
            const data = await fs.promises.readFile(LAYOUT_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load layout:', error);
    }
    return {};
});

// Save persistent node layout
ipcMain.handle('save-layout', async (event, layoutData) => {
    try {
        await fs.promises.writeFile(LAYOUT_FILE, JSON.stringify(layoutData, null, 2), 'utf8');
        return { success: true };
    } catch (error) {
        console.error('Failed to save layout:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});