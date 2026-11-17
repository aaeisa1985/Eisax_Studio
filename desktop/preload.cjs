const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eisaxDesktop', {
  open: () => ipcRenderer.invoke('office:open'),
  fullscreen: (value) => ipcRenderer.invoke('office:fullscreen', value),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('office:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('office:fullscreen-changed', listener);
  },
  save: (projectId, format, title, saveAs) => ipcRenderer.invoke('office:save', { projectId, format, title, saveAs }),
});
