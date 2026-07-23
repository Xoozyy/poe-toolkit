const fs = require('fs');
const path = require('path');
const { CATALOG, RECOMMENDATIONS, CATEGORY_LABELS } = require('./catalog.cjs');
const { readConfig } = require('./config.cjs');

function pathExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve the best exe path for a catalog tool.
 * Priority: custom path (if valid) → first existing pathHint → null.
 */
function resolveToolPath(tool, customPaths) {
  const custom = customPaths[tool.id];
  if (custom && pathExists(custom)) {
    return { resolvedPath: custom, source: 'custom' };
  }

  for (const hint of tool.pathHints || []) {
    if (pathExists(hint)) {
      return { resolvedPath: hint, source: 'scan' };
    }
  }

  const dirsTried = new Set();
  for (const hint of tool.pathHints || []) {
    const dir = path.dirname(hint);
    if (dirsTried.has(dir)) continue;
    dirsTried.add(dir);
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const exeName of tool.exeNames || []) {
        if (entries.includes(exeName)) {
          const candidate = path.join(dir, exeName);
          if (pathExists(candidate)) {
            return { resolvedPath: candidate, source: 'scan' };
          }
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  return { resolvedPath: null, source: 'none' };
}

function toToolStatus(tool, config, extras = {}) {
  const unused = config.unusedIds.includes(tool.id);
  const downloadDismissed = config.dismissedDownloads.includes(tool.id);
  const isLink = Boolean(extras.isLink);
  const { resolvedPath, source } = extras.resolvedPath
    ? { resolvedPath: extras.resolvedPath, source: extras.source || 'custom' }
    : resolveToolPath(tool, config.customPaths);
  const ready = Boolean(resolvedPath);
  const category = tool.category;
  return {
    id: tool.id,
    name: tool.name,
    category,
    categoryLabel: CATEGORY_LABELS[category] || category,
    blurb: tool.blurb || '',
    downloadUrl: tool.downloadUrl || null,
    resolvedPath,
    source,
    ready,
    customPath:
      extras.isCustom
        ? tool.exePath || null
        : config.customPaths[tool.id] || null,
    showDownloadPrompt:
      !isLink &&
      !ready &&
      Boolean(tool.downloadUrl) &&
      !downloadDismissed &&
      !unused,
    unused,
    isCustom: Boolean(extras.isCustom),
    isLink,
    openUrl: extras.openUrl || null,
  };
}

function listTools() {
  const config = readConfig();
  const catalogTools = CATALOG.map((tool) => toToolStatus(tool, config));
  const customTools = config.customApps.map((appDef) => {
    const isLink = appDef.kind === 'link' && Boolean(appDef.url);
    return toToolStatus(
      {
        id: appDef.id,
        name: appDef.name,
        category: appDef.category,
        blurb: appDef.blurb,
        downloadUrl: appDef.downloadUrl,
        pathHints: [],
        exeNames: [],
        exePath: appDef.exePath,
      },
      config,
      {
        isCustom: true,
        isLink,
        openUrl: isLink ? appDef.url : null,
        resolvedPath: isLink
          ? appDef.url
          : appDef.exePath && pathExists(appDef.exePath)
            ? appDef.exePath
            : null,
        source: isLink
          ? 'custom'
          : appDef.exePath && pathExists(appDef.exePath)
            ? 'custom'
            : 'none',
      },
    );
  });
  return [...catalogTools, ...customTools];
}

function listRecommendations() {
  const config = readConfig();
  return RECOMMENDATIONS.map((item) => ({
    ...item,
    unused: config.unusedIds.includes(item.id),
  }));
}

function findAnyToolDef(id) {
  const catalog = CATALOG.find((t) => t.id === id);
  if (catalog) return { kind: 'catalog', tool: catalog };
  const config = readConfig();
  const custom = config.customApps.find((a) => a.id === id);
  if (custom) return { kind: 'custom', tool: custom };
  return null;
}

module.exports = {
  listTools,
  listRecommendations,
  pathExists,
  findAnyToolDef,
};
