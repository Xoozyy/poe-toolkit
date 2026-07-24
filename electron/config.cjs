const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_LEAGUE, DEFAULT_LEAGUE_POE2 } = require('./league.cjs');
const { normalizeCurrencyPairIds } = require('./currency.cjs');

const CONFIG_VERSION = 3;

const LAYOUT_PAGES = ['poe1', 'poe2', 'optional'];

function configPath() {
  return path.join(app.getPath('userData'), 'poe-toolkit-config.json');
}

function newSectionId(prefix = 'sec') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaultSection(page, toolIds = []) {
  return {
    id: `sec_${page}_apps`,
    name: 'Apps',
    toolIds: Array.isArray(toolIds) ? toolIds.map(String) : [],
  };
}

function defaultPageLayouts(toolOrders = {}) {
  return {
    poe1: { sections: [makeDefaultSection('poe1', toolOrders.poe1)] },
    poe2: { sections: [makeDefaultSection('poe2', toolOrders.poe2)] },
    optional: { sections: [makeDefaultSection('optional', toolOrders.optional)] },
  };
}

function normalizeSection(raw, page, index) {
  const fallbackId = `sec_${page}_${index}`;
  if (!raw || typeof raw !== 'object') {
    return makeDefaultSection(page, []);
  }
  const toolIds = [];
  const seen = new Set();
  for (const id of Array.isArray(raw.toolIds) ? raw.toolIds : []) {
    const sid = String(id);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    toolIds.push(sid);
  }
  return {
    id: String(raw.id || fallbackId),
    name: String(raw.name || 'Apps').trim() || 'Apps',
    toolIds,
  };
}

function normalizePageLayout(raw, page, fallbackIds = []) {
  const sectionsRaw =
    raw && typeof raw === 'object' && Array.isArray(raw.sections)
      ? raw.sections
      : null;
  if (!sectionsRaw || sectionsRaw.length === 0) {
    return { sections: [makeDefaultSection(page, fallbackIds)] };
  }
  const seenIds = new Set();
  const sections = [];
  for (let i = 0; i < sectionsRaw.length; i += 1) {
    const section = normalizeSection(sectionsRaw[i], page, i);
    section.toolIds = section.toolIds.filter((id) => {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    if (!section.id || sections.some((s) => s.id === section.id)) {
      section.id = newSectionId(`sec_${page}`);
    }
    sections.push(section);
  }
  if (sections.length === 0) {
    return { sections: [makeDefaultSection(page, fallbackIds)] };
  }
  return { sections };
}

function normalizePageLayouts(raw, toolOrders = {}) {
  const defaults = defaultPageLayouts(toolOrders);
  const out = {};
  for (const page of LAYOUT_PAGES) {
    const fallbackIds = Array.isArray(toolOrders[page]) ? toolOrders[page] : [];
    out[page] = normalizePageLayout(
      raw && typeof raw === 'object' ? raw[page] : null,
      page,
      fallbackIds,
    );
  }
  return out;
}

function flatIdsFromLayout(layout) {
  if (!layout || !Array.isArray(layout.sections)) return [];
  const ids = [];
  const seen = new Set();
  for (const section of layout.sections) {
    for (const id of section.toolIds || []) {
      const sid = String(id);
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      ids.push(sid);
    }
  }
  return ids;
}

function syncToolOrdersFromLayouts(config) {
  for (const page of LAYOUT_PAGES) {
    config.toolOrders[page] = flatIdsFromLayout(config.pageLayouts[page]);
  }
  return config;
}

function ensureToolInPageLayout(config, page, toolId) {
  if (!LAYOUT_PAGES.includes(page)) return config;
  const sid = String(toolId);
  const layout = config.pageLayouts[page];
  if (!layout || !Array.isArray(layout.sections) || layout.sections.length === 0) {
    config.pageLayouts[page] = { sections: [makeDefaultSection(page, [sid])] };
    syncToolOrdersFromLayouts(config);
    return config;
  }
  for (const section of layout.sections) {
    if (section.toolIds.includes(sid)) return config;
  }
  layout.sections[0].toolIds.push(sid);
  syncToolOrdersFromLayouts(config);
  return config;
}

function removeToolFromPageLayouts(config, toolId) {
  const sid = String(toolId);
  let changed = false;
  for (const page of LAYOUT_PAGES) {
    const layout = config.pageLayouts[page];
    if (!layout) continue;
    for (const section of layout.sections) {
      const next = section.toolIds.filter((id) => id !== sid);
      if (next.length !== section.toolIds.length) {
        section.toolIds = next;
        changed = true;
      }
    }
  }
  if (changed) syncToolOrdersFromLayouts(config);
  return config;
}

function defaultConfig() {
  const toolOrders = {
    poe1: [],
    poe2: [],
    optional: [],
    unused: [],
  };
  return {
    version: CONFIG_VERSION,
    customPaths: {},
    dismissedDownloads: [],
    unusedIds: [],
    customApps: [],
    readAnnouncementIds: [],
    toolOrders,
    pageLayouts: defaultPageLayouts(toolOrders),
    league: { ...DEFAULT_LEAGUE },
    leaguePoe2: { ...DEFAULT_LEAGUE_POE2 },
    /** poe.ninja economy league for currency exchange; null = auto-pick */
    currencyLeague: null,
    currencyLeaguePoe2: null,
    /** League + announcements layout: compact strip or full stacked */
    infoLayout: 'compact',
    /** Force LOGIN! launch banner for testing before real go-live */
    previewLeagueLaunch: false,
    /** Remind before official start that in-game queue may be open */
    queueReminderEnabled: true,
    /** Minutes before launch to show the queue reminder */
    queueReminderMinutes: 90,
    /** Dismissed queue reminder keys: `${game}:${startMs}` */
    queueReminderDismissed: { poe1: null, poe2: null },
    /** Hide paths / personal filesystem details while streaming */
    streamerMode: false,
    /** X button hides to tray instead of quitting */
    closeToTray: true,
    /** Enabled currency exchange pairs (multi-select) */
    currencyPairIds: ['chaos-divine'],
    /** Last dismissed "switch to new league" offer per game */
    currencyLeagueOfferDismissed: { poe1: null, poe2: null },
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
    const toolOrders = normalizeToolOrders(parsed.toolOrders);
    const config = {
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
      toolOrders,
      pageLayouts: normalizePageLayouts(parsed.pageLayouts, toolOrders),
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
      queueReminderEnabled:
        parsed.queueReminderEnabled == null
          ? true
          : Boolean(parsed.queueReminderEnabled),
      queueReminderMinutes: normalizeQueueReminderMinutes(
        parsed.queueReminderMinutes,
      ),
      queueReminderDismissed: normalizeOfferDismissed(
        parsed.queueReminderDismissed,
      ),
      streamerMode: Boolean(parsed.streamerMode),
      closeToTray:
        parsed.closeToTray == null ? true : Boolean(parsed.closeToTray),
      currencyPairIds: normalizeCurrencyPairIds(parsed.currencyPairIds),
      currencyLeagueOfferDismissed: normalizeOfferDismissed(
        parsed.currencyLeagueOfferDismissed,
      ),
    };
    syncToolOrdersFromLayouts(config);
    return config;
  } catch {
    return defaultConfig();
  }
}

function normalizeOfferDismissed(raw) {
  const empty = { poe1: null, poe2: null };
  if (!raw || typeof raw !== 'object') return empty;
  return {
    poe1:
      raw.poe1 == null || raw.poe1 === '' ? null : String(raw.poe1),
    poe2:
      raw.poe2 == null || raw.poe2 === '' ? null : String(raw.poe2),
  };
}

function normalizeQueueReminderMinutes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 90;
  return Math.min(180, Math.max(30, Math.round(n)));
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
  ensureToolInPageLayout(config, appDef.category, appDef.id);
  writeConfig(config);
  return { config, app: appDef };
}

function updateCustomApp(id, patch = {}) {
  const config = readConfig();
  const sid = String(id);
  const appDef = config.customApps.find((a) => a.id === sid);
  if (!appDef) return { ok: false, error: 'Custom app not found.', config };

  const prevCategory = appDef.category;
  const nextKind =
    patch.kind === 'link' || patch.kind === 'app'
      ? patch.kind
      : appDef.kind === 'link'
        ? 'link'
        : 'app';

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (name) appDef.name = name;
  }
  if (patch.blurb != null) {
    appDef.blurb = String(patch.blurb).trim() || appDef.blurb;
  }
  if (
    patch.category === 'poe1' ||
    patch.category === 'poe2' ||
    patch.category === 'optional'
  ) {
    appDef.category = patch.category;
  }

  if (nextKind === 'link') {
    const url =
      patch.url != null ? String(patch.url).trim() : appDef.url || '';
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Enter a valid http(s) URL.', config };
    }
    appDef.kind = 'link';
    appDef.url = url;
    appDef.exePath = null;
    appDef.downloadUrl = null;
  } else {
    appDef.kind = 'app';
    appDef.url = null;
    if (patch.exePath != null) {
      const exePath = String(patch.exePath).trim();
      appDef.exePath = exePath || null;
    }
    if (patch.downloadUrl !== undefined) {
      const downloadUrl =
        patch.downloadUrl == null || patch.downloadUrl === ''
          ? null
          : String(patch.downloadUrl).trim();
      appDef.downloadUrl =
        downloadUrl && /^https?:\/\//i.test(downloadUrl) ? downloadUrl : null;
    }
  }

  if (appDef.category !== prevCategory) {
    removeToolFromPageLayouts(config, sid);
    ensureToolInPageLayout(config, appDef.category, sid);
    // Drop from unused? keep unused state as-is
  }

  writeConfig(config);
  return { ok: true, config, app: appDef };
}

function removeCustomApp(id) {
  const config = readConfig();
  const before = config.customApps.length;
  config.customApps = config.customApps.filter((a) => a.id !== id);
  config.unusedIds = config.unusedIds.filter((x) => x !== id);
  delete config.customPaths[id];
  removeToolFromPageLayouts(config, id);
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

function getCurrencyLeagueOfferDismissed(game = 'poe1') {
  const dismissed = normalizeOfferDismissed(
    readConfig().currencyLeagueOfferDismissed,
  );
  return game === 'poe2' ? dismissed.poe2 : dismissed.poe1;
}

function setCurrencyLeagueOfferDismissed(leagueId, game = 'poe1') {
  const config = readConfig();
  config.currencyLeagueOfferDismissed = normalizeOfferDismissed(
    config.currencyLeagueOfferDismissed,
  );
  const value = leagueId == null || leagueId === '' ? null : String(leagueId);
  if (game === 'poe2') config.currencyLeagueOfferDismissed.poe2 = value;
  else config.currencyLeagueOfferDismissed.poe1 = value;
  writeConfig(config);
  return config.currencyLeagueOfferDismissed;
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

function getQueueReminderSettings() {
  const config = readConfig();
  return {
    enabled:
      config.queueReminderEnabled == null
        ? true
        : Boolean(config.queueReminderEnabled),
    minutes: normalizeQueueReminderMinutes(config.queueReminderMinutes),
  };
}

function setQueueReminderSettings({ enabled, minutes } = {}) {
  const config = readConfig();
  if (enabled != null) config.queueReminderEnabled = Boolean(enabled);
  if (minutes != null) {
    config.queueReminderMinutes = normalizeQueueReminderMinutes(minutes);
  }
  writeConfig(config);
  return getQueueReminderSettings();
}

function getQueueReminderDismissed(game = 'poe1') {
  const dismissed = normalizeOfferDismissed(readConfig().queueReminderDismissed);
  return game === 'poe2' ? dismissed.poe2 : dismissed.poe1;
}

function setQueueReminderDismissed(key, game = 'poe1') {
  const config = readConfig();
  config.queueReminderDismissed = normalizeOfferDismissed(
    config.queueReminderDismissed,
  );
  const value = key == null || key === '' ? null : String(key);
  if (game === 'poe2') config.queueReminderDismissed.poe2 = value;
  else config.queueReminderDismissed.poe1 = value;
  writeConfig(config);
  return config.queueReminderDismissed;
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

function getCloseToTray() {
  const config = readConfig();
  return config.closeToTray == null ? true : Boolean(config.closeToTray);
}

function setCloseToTray(enabled) {
  const config = readConfig();
  config.closeToTray = Boolean(enabled);
  writeConfig(config);
  return config.closeToTray;
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
  const config = readConfig();
  syncToolOrdersFromLayouts(config);
  return config.toolOrders;
}

function setToolOrder(page, ids) {
  const config = readConfig();
  const key =
    page === 'poe2' || page === 'optional' || page === 'unused' ? page : 'poe1';
  const nextIds = Array.isArray(ids) ? ids.map(String) : [];
  config.toolOrders[key] = nextIds;
  if (LAYOUT_PAGES.includes(key)) {
    const layout = normalizePageLayout(config.pageLayouts[key], key, nextIds);
    // Preserve section names/ids; redistribute ids into existing sections by previous membership when possible
    const prev = layout.sections;
    const assigned = new Set();
    const rebuilt = prev.map((section) => ({
      ...section,
      toolIds: section.toolIds.filter((id) => {
        if (!nextIds.includes(id) || assigned.has(id)) return false;
        assigned.add(id);
        return true;
      }),
    }));
    const missing = nextIds.filter((id) => !assigned.has(id));
    if (rebuilt.length === 0) {
      config.pageLayouts[key] = { sections: [makeDefaultSection(key, nextIds)] };
    } else {
      rebuilt[0].toolIds = [...rebuilt[0].toolIds, ...missing];
      config.pageLayouts[key] = { sections: rebuilt };
    }
    syncToolOrdersFromLayouts(config);
  }
  writeConfig(config);
  return config.toolOrders;
}

function getPageLayouts() {
  const config = readConfig();
  return config.pageLayouts;
}

function getPageLayout(page) {
  const key = LAYOUT_PAGES.includes(page) ? page : 'poe1';
  return getPageLayouts()[key];
}

function setPageLayout(page, layout) {
  const config = readConfig();
  const key = LAYOUT_PAGES.includes(page) ? page : 'poe1';
  const fallbackIds = flatIdsFromLayout(
    config.pageLayouts[key] || defaultPageLayouts(config.toolOrders)[key],
  );
  config.pageLayouts[key] = normalizePageLayout(layout, key, fallbackIds);
  syncToolOrdersFromLayouts(config);
  writeConfig(config);
  return {
    pageLayouts: config.pageLayouts,
    toolOrders: config.toolOrders,
  };
}

module.exports = {
  readConfig,
  setCustomPath,
  dismissDownload,
  resetDismissed,
  setUnused,
  addCustomApp,
  updateCustomApp,
  removeCustomApp,
  getLeague,
  getCurrencyLeague,
  setCurrencyLeague,
  getCurrencyLeagueOfferDismissed,
  setCurrencyLeagueOfferDismissed,
  getInfoLayout,
  setInfoLayout,
  getPreviewLeagueLaunch,
  setPreviewLeagueLaunch,
  getQueueReminderSettings,
  setQueueReminderSettings,
  getQueueReminderDismissed,
  setQueueReminderDismissed,
  getStreamerMode,
  setStreamerMode,
  getCloseToTray,
  setCloseToTray,
  getCurrencyPairIds,
  setCurrencyPairIds,
  markAnnouncementRead,
  getReadAnnouncementIds,
  getToolOrders,
  setToolOrder,
  getPageLayouts,
  getPageLayout,
  setPageLayout,
  configPath,
};
