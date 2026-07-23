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
  getCurrencyLeague,
  setCurrencyLeague,
  getInfoLayout,
  setInfoLayout,
  getPreviewLeagueLaunch,
  setPreviewLeagueLaunch,
  getStreamerMode,
  setStreamerMode,
  getCurrencyPairIds,
  setCurrencyPairIds,
  configPath,
  setUnused,
  addCustomApp,
  removeCustomApp,
  markAnnouncementRead,
  getReadAnnouncementIds,
  getToolOrders,
  setToolOrder,
} = require('./config.cjs');
const { getLeagueInfo } = require('./league.cjs');
const { fetchAnnouncements } = require('./announcements.cjs');
const {
  fetchCurrencyExchange,
  fetchEconomyLeagues,
  pickDefaultLeague,
  listCurrencyPairs,
  normalizeGame,
} = require('./currency.cjs');

/**
 * Resolve which economy league to use for exchange rates.
 * Saved preference wins when still listed; otherwise auto-pick and persist.
 */
async function resolveCurrencyLeague(game = 'poe1') {
  const g = normalizeGame(game);
  const listed = await fetchEconomyLeagues(g);
  const leagues = listed.leagues || [];
  const saved = getCurrencyLeague(g);
  const stillListed =
    saved && leagues.some((entry) => entry.id === saved) ? saved : null;
  const league = stillListed || pickDefaultLeague(leagues);
  if (league !== saved) {
    setCurrencyLeague(league, g);
  }
  return {
    game: g,
    league,
    leagues,
    leaguesOk: listed.ok,
    leaguesError: listed.error,
  };
}

const isDev = !app.isPackaged;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let leagueWidget = null;

async function resolveLeagueInfo(game = 'poe1') {
  const listed = await fetchEconomyLeagues(game);
  return getLeagueInfo(getLeague(game), {
    game,
    economyLeagues: listed.leagues || [],
    forcePreview: game === 'poe1' ? getPreviewLeagueLaunch() : false,
  });
}

function loadRenderer(win, page) {
  if (isDev) {
    const base = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
    win.loadURL(page === 'widget' ? `${base}/widget.html` : base);
  } else if (page === 'widget') {
    win.loadFile(path.join(__dirname, '..', 'dist', 'widget.html'));
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 1100,
    minHeight: 820,
    title: 'PoE Toolkit',
    frame: false,
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const sendMaximized = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximized);
  mainWindow.on('unmaximize', sendMaximized);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer(mainWindow, 'main');
}

function createLeagueWidget() {
  if (leagueWidget && !leagueWidget.isDestroyed()) {
    leagueWidget.show();
    leagueWidget.focus();
    return leagueWidget;
  }

  leagueWidget = new BrowserWindow({
    width: 320,
    height: 118,
    minWidth: 280,
    minHeight: 100,
    maxWidth: 480,
    maxHeight: 180,
    title: 'League Countdown',
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
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

  leagueWidget.setAlwaysOnTop(true, 'floating');
  leagueWidget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  leagueWidget.once('ready-to-show', () => {
    if (leagueWidget && !leagueWidget.isDestroyed()) leagueWidget.show();
  });
  leagueWidget.on('closed', () => {
    leagueWidget = null;
  });

  loadRenderer(leagueWidget, 'widget');
  return leagueWidget;
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
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle('window:isMaximized', (event) => {
    return Boolean(BrowserWindow.fromWebContents(event.sender)?.isMaximized());
  });

  ipcMain.handle('tools:list', () => listTools());
  ipcMain.handle('tools:rescan', () => listTools());
  ipcMain.handle('recommendations:list', () => listRecommendations());
  ipcMain.handle('league:get', (_event, game) =>
    resolveLeagueInfo(game === 'poe2' ? 'poe2' : 'poe1'),
  );
  ipcMain.handle('league:openWidget', () => {
    createLeagueWidget();
    return { ok: true };
  });
  ipcMain.handle('league:closeWidget', () => {
    if (leagueWidget && !leagueWidget.isDestroyed()) {
      leagueWidget.close();
    }
    return { ok: true };
  });
  ipcMain.handle('ui:getPreviewLeagueLaunch', () => getPreviewLeagueLaunch());
  ipcMain.handle('ui:setPreviewLeagueLaunch', (_event, enabled) => {
    const previewLeagueLaunch = setPreviewLeagueLaunch(Boolean(enabled));
    return { ok: true, previewLeagueLaunch };
  });
  ipcMain.handle('ui:getStreamerMode', () => getStreamerMode());
  ipcMain.handle('ui:setStreamerMode', (_event, enabled) => {
    const streamerMode = setStreamerMode(Boolean(enabled));
    return { ok: true, streamerMode };
  });
  ipcMain.handle('announcements:list', async () => {
    const result = await fetchAnnouncements(5);
    const readIds = new Set(getReadAnnouncementIds());
    const items = result.items || [];
    const highlightId =
      items.find((item) => !readIds.has(String(item.id)))?.id ?? null;
    return { ...result, items, highlightId };
  });
  ipcMain.handle('announcements:markRead', (_event, id) => {
    if (id == null) return { ok: false };
    markAnnouncementRead(id);
    return { ok: true };
  });
  ipcMain.handle('currency:getExchange', async (_event, game) => {
    const g = normalizeGame(game);
    const { league, leagues } = await resolveCurrencyLeague(g);
    return fetchCurrencyExchange(league, leagues, getCurrencyPairIds(), g);
  });
  ipcMain.handle('currency:listLeagues', async (_event, game) => {
    const g = normalizeGame(game);
    const { league, leagues, leaguesOk, leaguesError } =
      await resolveCurrencyLeague(g);
    return {
      ok: leaguesOk,
      error: leaguesError,
      game: g,
      league,
      leagues,
    };
  });
  ipcMain.handle('currency:listPairs', () => ({
    ok: true,
    pairs: listCurrencyPairs(),
    selectedIds: getCurrencyPairIds(),
  }));
  ipcMain.handle('currency:setPairs', async (_event, ids) => {
    const selectedIds = setCurrencyPairIds(ids);
    const [poe1, poe2] = await Promise.all([
      resolveCurrencyLeague('poe1'),
      resolveCurrencyLeague('poe2'),
    ]);
    const [ratePoe1, ratePoe2] = await Promise.all([
      fetchCurrencyExchange(
        poe1.league,
        poe1.leagues,
        selectedIds,
        'poe1',
      ),
      fetchCurrencyExchange(
        poe2.league,
        poe2.leagues,
        selectedIds,
        'poe2',
      ),
    ]);
    return {
      ok: true,
      selectedIds,
      pairs: listCurrencyPairs(),
      ratePoe1,
      ratePoe2,
    };
  });
  ipcMain.handle('currency:setLeague', async (_event, leagueId, game) => {
    if (typeof leagueId !== 'string' || !leagueId.trim()) {
      return { ok: false, error: 'Invalid league' };
    }
    const g = normalizeGame(game);
    const listed = await fetchEconomyLeagues(g);
    const id = leagueId.trim();
    const known = (listed.leagues || []).some((entry) => entry.id === id);
    if (!known && listed.ok) {
      return { ok: false, error: 'League is not currently available on poe.ninja' };
    }
    setCurrencyLeague(id, g);
    const rate = await fetchCurrencyExchange(
      id,
      listed.leagues,
      getCurrencyPairIds(),
      g,
    );
    return {
      ok: true,
      game: g,
      league: id,
      leagues: listed.leagues,
      rate,
    };
  });
  ipcMain.handle('ui:getInfoLayout', () => getInfoLayout());
  ipcMain.handle('ui:setInfoLayout', (_event, layout) => {
    return { ok: true, infoLayout: setInfoLayout(layout) };
  });
  ipcMain.handle('storage:getInfo', () => ({
    configPath: configPath(),
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
    if (!tool?.ready) {
      return { ok: false, error: 'Not ready. Set a path or URL first.' };
    }

    if (tool.isLink || (tool.openUrl && /^https?:\/\//i.test(tool.openUrl))) {
      const url = tool.openUrl || tool.resolvedPath;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { ok: false, error: 'Invalid website URL.' };
      }
      await shell.openExternal(url);
      return { ok: true };
    }

    if (!tool.resolvedPath) {
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

    if (payload?.kind === 'link') {
      const url = typeof payload.url === 'string' ? payload.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) {
        return {
          ok: false,
          error: 'Enter a valid http(s) URL.',
          tools: listTools(),
          recommendations: listRecommendations(),
        };
      }
      let name =
        (payload?.name && String(payload.name).trim()) || '';
      if (!name) {
        try {
          name = new URL(url).hostname.replace(/^www\./i, '') || 'Web link';
        } catch {
          name = 'Web link';
        }
      }
      addCustomApp({
        name,
        category,
        kind: 'link',
        url,
        blurb: payload?.blurb || 'Website shortcut',
      });
      return {
        ok: true,
        tools: listTools(),
        recommendations: listRecommendations(),
      };
    }

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
      kind: 'app',
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

  ipcMain.handle('tools:getOrders', () => getToolOrders());
  ipcMain.handle('tools:setOrder', (_event, page, ids) => {
    return setToolOrder(page, ids);
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
