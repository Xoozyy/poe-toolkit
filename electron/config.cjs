const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_LEAGUE, DEFAULT_LEAGUE_POE2 } = require('./league.cjs');
const { normalizeCurrencyPairIds } = require('./currency.cjs');

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
    leaguePoe2: { ...DEFAULT_LEAGUE_POE2 },
    /** poe.ninja economy league for currency exchange; null = auto-pick */
    currencyLeague: null,
    currencyLeaguePoe2: null,
    /** League + announcements layout: compact strip or full stacked */
    infoLayout: 'compact',
    /** Force LOGIN! launch banner for testing before real go-live */
    previewLeagueLaunch: false,
    /** Hide paths / personal filesystem details while streaming */
    streamerMode: false,
    /** Enabled currency exchange pairs (multi-select) */
    currencyPairIds: ['chaos-divine'],
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
    .map((appDef) => {
      const url =
        typeof appDef.url === 'string' && /^https?:\/\//i.test(appDef.url.trim())
          ? appDef.url.trim()
          : null;
      const kind = appDef.kind === 'link' || url ? 'link' : 'app';
      return {
        id: String(appDef.id),
        name: String(appDef.name || (kind === 'link' ? 'Web link' : 'Custom app')),
        blurb: String(
          appDef.blurb ||
            (kind === 'link' ? 'Website shortcut' : 'Custom application'),
        ),
        category:
          appDef.category === 'poe2' || appDef.category === 'optional'
            ? appDef.category
            : 'poe1',
        kind,
        exePath:
          kind === 'app' && appDef.exePath ? String(appDef.exePath) : null,
        url: kind === 'link' ? url : null,
        downloadUrl: appDef.downloadUrl ? String(appDef.downloadUrl) : null,
      };
    })
    .filter((appDef) => (appDef.kind === 'link' ? Boolean(appDef.url) : true));
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
      leaguePoe2: {
        ...DEFAULT_LEAGUE_POE2,
        ...(parsed.leaguePoe2 && typeof parsed.leaguePoe2 === 'object'
          ? parsed.leaguePoe2
          : {}),
      },
      currencyLeague:
        parsed.currencyLeague == null || parsed.currencyLeague === ''
          ? null
          : String(parsed.currencyLeague),
      currencyLeaguePoe2:
        parsed.currencyLeaguePoe2 == null || parsed.currencyLeaguePoe2 === ''
          ? null
          : String(parsed.currencyLeaguePoe2),
      infoLayout: parsed.infoLayout === 'normal' ? 'normal' : 'compact',
      previewLeagueLaunch: Boolean(parsed.previewLeagueLaunch),
      streamerMode: Boolean(parsed.streamerMode),
      currencyPairIds: normalizeCurrencyPairIds(parsed.currencyPairIds),
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

function addCustomApp({ name, category, exePath, blurb, downloadUrl, url, kind }) {
  const config = readConfig();
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const isLink =
    kind === 'link' ||
    (typeof url === 'string' && /^https?:\/\//i.test(url.trim()));
  const linkUrl = isLink && typeof url === 'string' ? url.trim() : null;
  const appDef = {
    id,
    name: String(
      name ||
        (isLink
          ? 'Web link'
          : path.basename(exePath || 'Custom app', '.exe')),
    ),
    blurb: String(blurb || (isLink ? 'Website shortcut' : 'Custom application')),
    category:
      category === 'poe2' || category === 'optional' ? category : 'poe1',
    kind: isLink ? 'link' : 'app',
    exePath: !isLink && exePath ? String(exePath) : null,
    url: linkUrl,
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

function getLeague(game = 'poe1') {
  const config = readConfig();
  return game === 'poe2' ? config.leaguePoe2 : config.league;
}

function getCurrencyLeague(game = 'poe1') {
  const config = readConfig();
  return game === 'poe2' ? config.currencyLeaguePoe2 : config.currencyLeague;
}

function setCurrencyLeague(league, game = 'poe1') {
  const config = readConfig();
  const value = league == null || league === '' ? null : String(league);
  if (game === 'poe2') {
    config.currencyLeaguePoe2 = value;
    writeConfig(config);
    return config.currencyLeaguePoe2;
  }
  config.currencyLeague = value;
  writeConfig(config);
  return config.currencyLeague;
}

function getInfoLayout() {
  return readConfig().infoLayout === 'normal' ? 'normal' : 'compact';
}

function setInfoLayout(layout) {
  const config = readConfig();
  config.infoLayout = layout === 'normal' ? 'normal' : 'compact';
  writeConfig(config);
  return config.infoLayout;
}

function getPreviewLeagueLaunch() {
  return Boolean(readConfig().previewLeagueLaunch);
}

function setPreviewLeagueLaunch(enabled) {
  const config = readConfig();
  config.previewLeagueLaunch = Boolean(enabled);
  writeConfig(config);
  return config.previewLeagueLaunch;
}

function getStreamerMode() {
  return Boolean(readConfig().streamerMode);
}

function setStreamerMode(enabled) {
  const config = readConfig();
  config.streamerMode = Boolean(enabled);
  writeConfig(config);
  return config.streamerMode;
}

function getCurrencyPairIds() {
  return normalizeCurrencyPairIds(readConfig().currencyPairIds);
}

function setCurrencyPairIds(ids) {
  const config = readConfig();
  config.currencyPairIds = normalizeCurrencyPairIds(ids);
  writeConfig(config);
  return config.currencyPairIds;
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
  setCustomPath,
  dismissDownload,
  resetDismissed,
  setUnused,
  addCustomApp,
  removeCustomApp,
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
  markAnnouncementRead,
  getReadAnnouncementIds,
  getToolOrders,
  setToolOrder,
  configPath,
};
