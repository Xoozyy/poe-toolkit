const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_LEAGUE } = require('./league.cjs');

const CONFIG_VERSION = 2;

function configPath() {
  return path.join(app.getPath('userData'), 'poe-toolkit-config.json');
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    customPaths: {},
    dismissedDownloads: [],
    unusedIds: [],
    customApps: [],
    readAnnouncementIds: [],
    toolOrders: {
      poe1: [],
      poe2: [],
      optional: [],
      unused: [],
    },
    league: { ...DEFAULT_LEAGUE },
  };
}

function normalizeToolOrders(raw) {
  const empty = { poe1: [], poe2: [], optional: [], unused: [] };
  if (!raw || typeof raw !== 'object') return empty;
  for (const key of Object.keys(empty)) {
    empty[key] = Array.isArray(raw[key]) ? raw[key].map(String) : [];
  }
  return empty;
}

function normalizeCustomApps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((appDef) => appDef && typeof appDef === 'object' && appDef.id)
    .map((appDef) => ({
      id: String(appDef.id),
      name: String(appDef.name || 'Custom app'),
      blurb: String(appDef.blurb || 'Custom application'),
      category:
        appDef.category === 'poe2' || appDef.category === 'optional'
          ? appDef.category
          : 'poe1',
      exePath: appDef.exePath ? String(appDef.exePath) : null,
      downloadUrl: appDef.downloadUrl ? String(appDef.downloadUrl) : null,
    }));
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig(),
      ...parsed,
      customPaths: parsed.customPaths || {},
      dismissedDownloads: Array.isArray(parsed.dismissedDownloads)
        ? parsed.dismissedDownloads
        : [],
      unusedIds: Array.isArray(parsed.unusedIds) ? parsed.unusedIds.map(String) : [],
      customApps: normalizeCustomApps(parsed.customApps),
      readAnnouncementIds: Array.isArray(parsed.readAnnouncementIds)
        ? parsed.readAnnouncementIds.map(String)
        : [],
      toolOrders: normalizeToolOrders(parsed.toolOrders),
      league: {
        ...DEFAULT_LEAGUE,
        ...(parsed.league && typeof parsed.league === 'object'
          ? parsed.league
          : {}),
      },
    };
  } catch {
    return defaultConfig();
  }
}

function writeConfig(config) {
  const dir = path.dirname(configPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

function setCustomPath(toolId, exePath) {
  const config = readConfig();
  const custom = config.customApps.find((a) => a.id === toolId);
  if (custom) {
    custom.exePath = exePath || null;
    writeConfig(config);
    return config;
  }
  if (exePath) {
    config.customPaths[toolId] = exePath;
  } else {
    delete config.customPaths[toolId];
  }
  writeConfig(config);
  return config;
}

function dismissDownload(toolId) {
  const config = readConfig();
  if (!config.dismissedDownloads.includes(toolId)) {
    config.dismissedDownloads.push(toolId);
    writeConfig(config);
  }
  return config;
}

function resetDismissed() {
  const config = readConfig();
  config.dismissedDownloads = [];
  writeConfig(config);
  return config;
}

function setUnused(id, unused) {
  const config = readConfig();
  const sid = String(id);
  const has = config.unusedIds.includes(sid);
  if (unused && !has) {
    config.unusedIds.push(sid);
    writeConfig(config);
  } else if (!unused && has) {
    config.unusedIds = config.unusedIds.filter((x) => x !== sid);
    writeConfig(config);
  }
  return config;
}

function addCustomApp({ name, category, exePath, blurb, downloadUrl }) {
  const config = readConfig();
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const appDef = {
    id,
    name: String(name || path.basename(exePath || 'Custom app', '.exe')),
    blurb: String(blurb || 'Custom application'),
    category:
      category === 'poe2' || category === 'optional' ? category : 'poe1',
    exePath: exePath ? String(exePath) : null,
    downloadUrl: downloadUrl ? String(downloadUrl) : null,
  };
  config.customApps.push(appDef);
  writeConfig(config);
  return { config, app: appDef };
}

function removeCustomApp(id) {
  const config = readConfig();
  const before = config.customApps.length;
  config.customApps = config.customApps.filter((a) => a.id !== id);
  config.unusedIds = config.unusedIds.filter((x) => x !== id);
  delete config.customPaths[id];
  if (config.customApps.length !== before) {
    writeConfig(config);
  }
  return config;
}

function getLeague() {
  return readConfig().league;
}

function markAnnouncementRead(id) {
  const sid = String(id);
  const config = readConfig();
  if (!config.readAnnouncementIds.includes(sid)) {
    config.readAnnouncementIds = [sid, ...config.readAnnouncementIds].slice(0, 80);
    writeConfig(config);
  }
  return config;
}

function getReadAnnouncementIds() {
  return readConfig().readAnnouncementIds;
}

function getToolOrders() {
  return readConfig().toolOrders;
}

function setToolOrder(page, ids) {
  const config = readConfig();
  const key =
    page === 'poe2' || page === 'optional' || page === 'unused' ? page : 'poe1';
  config.toolOrders[key] = Array.isArray(ids) ? ids.map(String) : [];
  writeConfig(config);
  return config.toolOrders;
}

module.exports = {
  readConfig,
  writeConfig,
  setCustomPath,
  dismissDownload,
  resetDismissed,
  setUnused,
  addCustomApp,
  removeCustomApp,
  getLeague,
  markAnnouncementRead,
  getReadAnnouncementIds,
  getToolOrders,
  setToolOrder,
  configPath,
};
