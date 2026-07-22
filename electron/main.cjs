const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  dialog,
} = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { CATALOG, RECOMMENDATIONS } = require('./catalog.cjs');
const {
  listTools,
  listRecommendations,
  pathExists,
  findAnyToolDef,
} = require('./scan.cjs');
const {
  setCustomPath,
  dismissDownload,
  resetDismissed,
  readConfig,
  getLeague,
  configPath,
  setUnused,
  addCustomApp,
  removeCustomApp,
} = require('./config.cjs');
const { getLeagueInfo } = require('./league.cjs');
const { fetchAnnouncements } = require('./announcements.cjs');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 1100,
    minHeight: 820,
    title: 'PoE Toolkit',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0c1014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function findCatalogTool(id) {
  return CATALOG.find((t) => t.id === id);
}

function findRecommendation(id) {
  return RECOMMENDATIONS.find((t) => t.id === id);
}

async function pickExeDialog(event, title) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: title || 'Locate executable',
    filters: [{ name: 'Executables', extensions: ['exe'] }, { name: 'All', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

function registerIpc() {
  ipcMain.handle('tools:list', () => listTools());
  ipcMain.handle('tools:rescan', () => listTools());
  ipcMain.handle('recommendations:list', () => listRecommendations());
  ipcMain.handle('league:get', () => getLeagueInfo(getLeague()));
  ipcMain.handle('announcements:list', () => fetchAnnouncements(2));
  ipcMain.handle('storage:getInfo', () => ({
    configPath: configPath(),
    userDataPath: app.getPath('userData'),
    packaged: app.isPackaged,
  }));
  ipcMain.handle('storage:openFolder', async () => {
    const folder = app.getPath('userData');
    const err = await shell.openPath(folder);
    return err ? { ok: false, error: err } : { ok: true };
  });
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Invalid URL' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('tools:pickExe', async (event, toolId) => {
    const found = findAnyToolDef(toolId);
    const title = found ? `Locate ${found.tool.name}` : 'Locate executable';
    const chosen = await pickExeDialog(event, title);
    if (!chosen) return listTools();
    if (!pathExists(chosen)) {
      return { error: 'Selected file does not exist.', tools: listTools() };
    }
    setCustomPath(toolId, chosen);
    return { tools: listTools() };
  });

  ipcMain.handle('tools:clearPath', (_event, toolId) => {
    setCustomPath(toolId, null);
    return listTools();
  });

  ipcMain.handle('tools:launch', async (_event, toolId) => {
    const tools = listTools();
    const tool = tools.find((t) => t.id === toolId);
    if (!tool?.ready || !tool.resolvedPath) {
      return { ok: false, error: 'Executable not found. Set a path first.' };
    }

    const openErr = await shell.openPath(tool.resolvedPath);
    if (!openErr) {
      return { ok: true };
    }

    try {
      const child = spawn(tool.resolvedPath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(tool.resolvedPath),
        windowsHide: false,
      });
      child.on('error', () => {});
      child.unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: openErr || String(err) };
    }
  });

  ipcMain.handle('tools:openDownload', async (_event, toolId) => {
    const catalog = findCatalogTool(toolId);
    const rec = findRecommendation(toolId);
    const custom = readConfig().customApps.find((a) => a.id === toolId);
    const url = catalog?.downloadUrl || rec?.downloadUrl || custom?.downloadUrl;
    if (!url) {
      return { ok: false, error: 'No download URL configured.' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('tools:dismissDownload', (_event, toolId) => {
    dismissDownload(toolId);
    return listTools();
  });

  ipcMain.handle('tools:resetDismissed', () => {
    resetDismissed();
    return listTools();
  });

  ipcMain.handle('tools:setUnused', (_event, id, unused) => {
    setUnused(id, Boolean(unused));
    return {
      tools: listTools(),
      recommendations: listRecommendations(),
    };
  });

  ipcMain.handle('tools:addCustom', async (event, payload) => {
    const category =
      payload?.category === 'poe2' || payload?.category === 'optional'
        ? payload.category
        : 'poe1';
    let exePath = payload?.exePath || null;
    if (!exePath) {
      exePath = await pickExeDialog(event, 'Choose application executable');
      if (!exePath) {
        return {
          ok: false,
          canceled: true,
          tools: listTools(),
          recommendations: listRecommendations(),
        };
      }
    }
    if (!pathExists(exePath)) {
      return {
        ok: false,
        error: 'Selected file does not exist.',
        tools: listTools(),
        recommendations: listRecommendations(),
      };
    }
    const name =
      (payload?.name && String(payload.name).trim()) ||
      path.basename(exePath, path.extname(exePath));
    addCustomApp({
      name,
      category,
      exePath,
      blurb: payload?.blurb || 'Custom application',
      downloadUrl: payload?.downloadUrl || null,
    });
    return {
      ok: true,
      tools: listTools(),
      recommendations: listRecommendations(),
    };
  });

  ipcMain.handle('tools:removeCustom', (_event, id) => {
    removeCustomApp(id);
    return {
      tools: listTools(),
      recommendations: listRecommendations(),
    };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  readConfig();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
