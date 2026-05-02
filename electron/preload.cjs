const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galleryDrift', {
  toggleFullscreen: () => ipcRenderer.invoke('gallery-drift:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('gallery-drift:is-fullscreen'),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke('gallery-drift:move-window', deltaX, deltaY),
  loadImages: (libraryPath) => ipcRenderer.invoke('gallery-drift:load-images', libraryPath),
  deleteItem: (libraryPath, itemId) => ipcRenderer.invoke('gallery-drift:delete-item', libraryPath, itemId),
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('gallery-drift:open-settings', listener);

    return () => {
      ipcRenderer.removeListener('gallery-drift:open-settings', listener);
    };
  }
});
