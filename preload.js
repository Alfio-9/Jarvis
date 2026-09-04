const { contextBridge, ipcRenderer } = require('electron');

/**
 * Jarvis Desktop 2.0 - Secure IPC Bridge
 * Exposes safe APIs from the main Node.js process to the sandboxed renderer.
 */
contextBridge.exposeInMainWorld('jarvisAPI', {
  // Scans operating system Desktop directory
  getDesktopItems: () => ipcRenderer.invoke('get-desktop-items'),

  // Scans arbitrary directory for 3D hierarchical navigation
  getFolderItems: (folderPath) => ipcRenderer.invoke('get-folder-items', folderPath),

  // Launches an application or opens a file/folder via OS shell
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // Reads text file content for in-app Holographic Markdown Viewer
  readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),

  // Loads persisted 3D node coordinates
  loadLayout: () => ipcRenderer.invoke('load-layout'),

  // Persists 3D node coordinates across app sessions
  saveLayout: (layoutData) => ipcRenderer.invoke('save-layout', layoutData)
});
