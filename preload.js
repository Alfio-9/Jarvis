const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisAPI', {
    getDesktopItems: () => ipcRenderer.invoke('get-desktop-items'),
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    loadLayout: () => ipcRenderer.invoke('load-layout'),
    saveLayout: (layoutData) => ipcRenderer.invoke('save-layout', layoutData)
});