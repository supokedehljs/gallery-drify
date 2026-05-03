const { app, BrowserWindow, ipcMain, screen, dialog, Menu, Tray, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mainWindow = null;
let tray = null;

const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
const devServerUrl = process.env.GALLERY_DRIFT_DEV_URL || 'http://localhost:4173';
const shouldUseDevServer = process.env.GALLERY_DRIFT_DEV === '1';
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);
const videoExtensions = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv']);
const windowStatePath = path.join(app.getPath('userData'), 'gallery-drift-window-state.json');
const startupStatePath = path.join(app.getPath('userData'), 'gallery-drift-startup.json');
const DEFAULT_ALWAYS_ON_TOP = true;
const iconPngPath = path.join(__dirname, 'assets', 'icon.png');
const iconIcoPath = path.join(__dirname, 'assets', 'icon.ico');

function getAppIconPath() {
  return process.platform === 'win32' ? iconIcoPath : iconPngPath;
}

function getTrayIcon() {
  return nativeImage.createFromPath(iconPngPath);
}

function readStartupState() {
  try {
    if (!fs.existsSync(startupStatePath)) {
      return { openAtLogin: false };
    }

    return { openAtLogin: Boolean(readJsonFile(startupStatePath).openAtLogin) };
  } catch {
    return { openAtLogin: false };
  }
}

function writeStartupState(openAtLogin) {
  try {
    fs.writeFileSync(startupStatePath, JSON.stringify({ openAtLogin: Boolean(openAtLogin) }, null, 2), 'utf8');
  } catch {
  }
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  writeStartupState(enabled);
  return { openAtLogin: Boolean(enabled) };
}

function normalizeLibraryPath(input) {
  if (!input) {
    return '';
  }

  return path.resolve(input.trim());
}

function readJsonFile(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function readWindowState() {
  try {
    if (!fs.existsSync(windowStatePath)) {
      return null;
    }

    return readJsonFile(windowStatePath);
  } catch {
    return null;
  }
}

function writeWindowState(win) {
  try {
    if (!win || win.isDestroyed() || win.isFullScreen()) {
      return;
    }

    const bounds = win.getBounds();
    const state = {
      ...bounds,
      isAlwaysOnTop: win.isAlwaysOnTop()
    };

    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
  }
}

function isThumbnailFileName(fileName) {
  const normalized = fileName.toLowerCase();
  return normalized.includes('_thumbnail') || normalized.includes('_ thumbnail');
}

function resolveImagePath(infoDir, metadata, ext) {
  const preferredFilename = `${metadata.name}.${metadata.ext}`;
  const preferredPath = path.join(infoDir, preferredFilename);

  if (fs.existsSync(preferredPath) && !isThumbnailFileName(preferredFilename)) {
    return preferredPath;
  }

  const fallback = fs
    .readdirSync(infoDir)
    .find((fileName) => fileName.toLowerCase().endsWith(`.${ext}`) && !isThumbnailFileName(fileName));

  return fallback ? path.join(infoDir, fallback) : null;
}

function readLibraryImages(libraryPathInput) {
  const libraryPath = normalizeLibraryPath(libraryPathInput);
  if (!libraryPath) {
    throw new Error('Missing libraryPath.');
  }

  const imagesRoot = path.join(libraryPath, 'images');
  if (!fs.existsSync(imagesRoot)) {
    throw new Error(`Eagle 图片目录不存在：${imagesRoot}`);
  }

  return fs
    .readdirSync(imagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.info'))
    .map((entry) => {
      try {
        const infoDir = path.join(imagesRoot, entry.name);
        const metadataPath = path.join(infoDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
          return null;
        }

        const metadata = readJsonFile(metadataPath);
        const ext = metadata.ext?.toLowerCase();
        if (metadata.isDeleted || !ext || (!imageExtensions.has(ext) && !videoExtensions.has(ext))) {
          return null;
        }

        const imagePath = resolveImagePath(infoDir, metadata, ext);
        if (!imagePath) {
          return null;
        }

        return {
          id: metadata.id,
          name: metadata.name,
          ext: metadata.ext,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          btime: metadata.btime ?? 0,
          url: metadata.url ?? '',
          annotation: metadata.annotation ?? metadata.comments ?? metadata.description ?? '',
          mediaType: videoExtensions.has(ext) ? 'video' : 'image',
          src: pathToFileURL(imagePath).href
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.btime ?? 0) - (a.btime ?? 0));
}

function deleteLibraryItem(libraryPathInput, itemId) {
  const libraryPath = normalizeLibraryPath(libraryPathInput);
  if (!libraryPath || !itemId) {
    throw new Error('Missing libraryPath or itemId.');
  }

  const imagesRoot = path.join(libraryPath, 'images');
  const entries = fs.readdirSync(imagesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.info')) {
      continue;
    }

    const infoDir = path.join(imagesRoot, entry.name);
    const metadataPath = path.join(infoDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      continue;
    }

    try {
      const metadata = readJsonFile(metadataPath);
      if (metadata.id === itemId) {
        fs.rmSync(infoDir, { recursive: true, force: true });
        return { success: true };
      }
    } catch {
    }
  }

  throw new Error('Item not found.');
}

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

function showContextMenu(win) {
  const menu = Menu.buildFromTemplate([
    {
      label: '设置',
      click: () => {
        win.webContents.send('gallery-drift:open-settings');
      }
    },
    {
      label: win.isAlwaysOnTop() ? '取消置顶' : '置顶',
      click: () => {
        win.setAlwaysOnTop(!win.isAlwaysOnTop());
        writeWindowState(win);
      }
    },
    {
      label: win.isFullScreen() ? '退出全屏' : '进入全屏',
      click: () => {
        win.setFullScreen(!win.isFullScreen());
      }
    },
    {
      label: '重新加载',
      click: () => {
        win.webContents.reload();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        win.close();
      }
    }
  ]);

  menu.popup({ window: win });
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(getTrayIcon());
  tray.setToolTip('Gallery Drift');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示窗口',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
      {
        label: '退出',
        click: () => {
          app.quit();
        }
      }
    ])
  );
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea || primaryDisplay.bounds;
  const savedState = readWindowState();
  const width = savedState?.width ?? Math.min(1280, workArea.width);
  const height = savedState?.height ?? Math.min(800, workArea.height);
  const x = savedState?.x ?? Math.round(workArea.x + (workArea.width - width) / 2);
  const y = savedState?.y ?? Math.round(workArea.y + (workArea.height - height) / 2);

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    icon: getAppIconPath(),
    backgroundColor: '#05070b',
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: savedState?.isAlwaysOnTop ?? DEFAULT_ALWAYS_ON_TOP,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setSkipTaskbar(true);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.setFullScreen(true);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'f') {
      event.preventDefault();
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.webContents.on('context-menu', () => {
    if (mainWindow) {
      showContextMenu(mainWindow);
    }
  });

  mainWindow.on('move', () => {
    writeWindowState(mainWindow);
  });

  mainWindow.on('resize', () => {
    writeWindowState(mainWindow);
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
  Menu.setApplicationMenu(null);
  setOpenAtLogin(readStartupState().openAtLogin);
  createTray();

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

ipcMain.handle('gallery-drift:move-window', (event, deltaX, deltaY) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return false;
  }

  if (win.isFullScreen()) {
    win.setFullScreen(false);
  }

  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + Number(deltaX || 0)), Math.round(y + Number(deltaY || 0)), false);
  return true;
});

ipcMain.handle('gallery-drift:load-images', (_event, libraryPath) => {
  return { images: readLibraryImages(libraryPath) };
});

ipcMain.handle('gallery-drift:delete-item', (_event, libraryPath, itemId) => {
  return deleteLibraryItem(libraryPath, itemId);
});

ipcMain.handle('gallery-drift:get-startup-setting', () => {
  return readStartupState();
});

ipcMain.handle('gallery-drift:set-startup-setting', (_event, enabled) => {
  return setOpenAtLogin(enabled);
});

