const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let mainWindow = null;

const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
const devServerUrl = process.env.GALLERY_DRIFT_DEV_URL || 'http://localhost:4173';
const shouldUseDevServer = process.env.GALLERY_DRIFT_DEV === '1';

async function loadApp(win) {
  if (shouldUseDevServer) {
    try {
      await win.loadURL(devServerUrl);
      return;
    } catch (error) {
      if (!fs.existsSync(distIndexPath)) {
        throw error;
      }
    }
  }

  if (!fs.existsSync(distIndexPath)) {
    throw new Error(`Built file not found: ${distIndexPath}`);
  }

  await win.loadFile(distIndexPath);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.length > 1 ? displays[1] : primaryDisplay;
  const bounds = targetDisplay?.bounds || primaryDisplay.bounds;
  const { x, y, width, height } = bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    backgroundColor: '#05070b',
    autoHideMenuBar: true,
    frame: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.setFullScreen(true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  loadApp(mainWindow).catch(async (error) => {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Gallery Drift 启动失败',
      message: '应用窗口加载失败。',
      detail: error instanceof Error ? error.message : String(error)
    });
    app.quit();
  });
}

app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    dialog
      .showMessageBox({
        type: 'error',
        title: 'Gallery Drift 启动失败',
        message: '窗口创建失败。',
        detail: error instanceof Error ? error.message : String(error)
      })
      .finally(() => app.quit());
    return;
  }

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

ipcMain.handle('gallery-drift:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return false;
  }

  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return next;
});

ipcMain.handle('gallery-drift:is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});
