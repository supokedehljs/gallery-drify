const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galleryDrift', {
  toggleFullscreen: () => ipcRenderer.invoke('gallery-drift:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('gallery-drift:is-fullscreen')
});
