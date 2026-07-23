const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poeToolkit', {
  listTools: () => ipcRenderer.invoke('tools:list'),
  listRecommendations: () => ipcRenderer.invoke('recommendations:list'),
  getLeague: (game) => ipcRenderer.invoke('league:get', game),
  openLeagueWidget: () => ipcRenderer.invoke('league:openWidget'),
  closeLeagueWidget: () => ipcRenderer.invoke('league:closeWidget'),
  listAnnouncements: () => ipcRenderer.invoke('announcements:list'),
  markAnnouncementRead: (id) => ipcRenderer.invoke('announcements:markRead', id),
  getCurrencyExchange: (game) => ipcRenderer.invoke('currency:getExchange', game),
  listCurrencyLeagues: (game) =>
    ipcRenderer.invoke('currency:listLeagues', game),
  listCurrencyPairs: () => ipcRenderer.invoke('currency:listPairs'),
  setCurrencyPairs: (ids) => ipcRenderer.invoke('currency:setPairs', ids),
  setCurrencyLeague: (leagueId, game) =>
    ipcRenderer.invoke('currency:setLeague', leagueId, game),
  getInfoLayout: () => ipcRenderer.invoke('ui:getInfoLayout'),
  setInfoLayout: (layout) => ipcRenderer.invoke('ui:setInfoLayout', layout),
  getPreviewLeagueLaunch: () => ipcRenderer.invoke('ui:getPreviewLeagueLaunch'),
  setPreviewLeagueLaunch: (enabled) =>
    ipcRenderer.invoke('ui:setPreviewLeagueLaunch', enabled),
  getStreamerMode: () => ipcRenderer.invoke('ui:getStreamerMode'),
  setStreamerMode: (enabled) => ipcRenderer.invoke('ui:setStreamerMode', enabled),
  getStorageInfo: () => ipcRenderer.invoke('storage:getInfo'),
  openStorageFolder: () => ipcRenderer.invoke('storage:openFolder'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  rescan: () => ipcRenderer.invoke('tools:rescan'),
  pickExe: (toolId) => ipcRenderer.invoke('tools:pickExe', toolId),
  clearPath: (toolId) => ipcRenderer.invoke('tools:clearPath', toolId),
  launch: (toolId) => ipcRenderer.invoke('tools:launch', toolId),
  openDownload: (toolId) => ipcRenderer.invoke('tools:openDownload', toolId),
  dismissDownload: (toolId) => ipcRenderer.invoke('tools:dismissDownload', toolId),
  resetDismissed: () => ipcRenderer.invoke('tools:resetDismissed'),
  setUnused: (id, unused) => ipcRenderer.invoke('tools:setUnused', id, unused),
  addCustom: (payload) => ipcRenderer.invoke('tools:addCustom', payload),
  removeCustom: (id) => ipcRenderer.invoke('tools:removeCustom', id),
  getToolOrders: () => ipcRenderer.invoke('tools:getOrders'),
  setToolOrder: (page, ids) => ipcRenderer.invoke('tools:setOrder', page, ids),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (cb) => {
    const listener = (_event, maximized) => cb(Boolean(maximized));
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
});
