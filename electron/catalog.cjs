/**
 * Built-in tool catalog. Easy to extend later.
 * pathHints are absolute or env-expanded candidates (best-effort).
 */

const PROGRAM_FILES = process.env['ProgramFiles'] || 'C:\\Program Files';
const PROGRAM_FILES_X86 =
  process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const LOCAL_APPDATA = process.env.LOCALAPPDATA || '';
const APPDATA = process.env.APPDATA || '';
const USERPROFILE = process.env.USERPROFILE || '';

/** @typedef {'poe1' | 'poe2'} ToolCategory */

/**
 * @typedef {object} ToolDef
 * @property {string} id
 * @property {string} name
 * @property {ToolCategory} category
 * @property {string[]} exeNames
 * @property {string[]} pathHints
 * @property {string} [downloadUrl]
 * @property {string} blurb
 */

/**
 * @typedef {object} RecommendationDef
 * @property {string} id
 * @property {string} name
 * @property {string} summary
 * @property {string} downloadUrl
 */

/** @type {ToolDef[]} */
const CATALOG = [
  {
    id: 'poe1',
    name: 'Path of Exile 1',
    category: 'poe1',
    blurb: 'Grinding Gear Games',
    exeNames: ['PathOfExile_x64.exe', 'PathOfExile.exe', 'PathOfExileSteam.exe'],
    pathHints: [
      `${PROGRAM_FILES}\\Grinding Gear Games\\Path of Exile\\PathOfExile_x64.exe`,
      `${PROGRAM_FILES_X86}\\Grinding Gear Games\\Path of Exile\\PathOfExile_x64.exe`,
      `${PROGRAM_FILES}\\Steam\\steamapps\\common\\Path of Exile\\PathOfExile_x64.exe`,
      `${PROGRAM_FILES_X86}\\Steam\\steamapps\\common\\Path of Exile\\PathOfExile_x64.exe`,
      `D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExile_x64.exe`,
      `E:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExile_x64.exe`,
    ],
    downloadUrl: 'https://www.pathofexile.com/download',
  },
  {
    id: 'poe2',
    name: 'Path of Exile 2',
    category: 'poe2',
    blurb: 'Grinding Gear Games',
    exeNames: [
      'PathOfExile.exe',
      'PathOfExile_x64.exe',
      'PathOfExileSteam.exe',
    ],
    pathHints: [
      `${PROGRAM_FILES_X86}\\Grinding Gear Games\\Path of Exile 2 - poe2_production\\PathOfExile.exe`,
      `${PROGRAM_FILES}\\Grinding Gear Games\\Path of Exile 2 - poe2_production\\PathOfExile.exe`,
      `${PROGRAM_FILES_X86}\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe`,
      `${PROGRAM_FILES}\\Grinding Gear Games\\Path of Exile 2\\PathOfExile_x64.exe`,
      `${PROGRAM_FILES}\\Steam\\steamapps\\common\\Path of Exile 2\\PathOfExile_x64.exe`,
      `${PROGRAM_FILES_X86}\\Steam\\steamapps\\common\\Path of Exile 2\\PathOfExile_x64.exe`,
      `D:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExile_x64.exe`,
      `E:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExile_x64.exe`,
    ],
    downloadUrl: 'https://pathofexile2.com/',
  },
  {
    id: 'exiled-exchange-2',
    name: 'Exiled Exchange 2',
    category: 'poe2',
    blurb: 'Price check overlay for Path of Exile 2 (Awakened fork)',
    exeNames: [
      'Exiled Exchange 2.exe',
      'exiled-exchange-2.exe',
      'Exiled-Exchange-2.exe',
    ],
    pathHints: [
      `${PROGRAM_FILES}\\Exiled Exchange 2\\Exiled Exchange 2.exe`,
      `${PROGRAM_FILES_X86}\\Exiled Exchange 2\\Exiled Exchange 2.exe`,
      `${LOCAL_APPDATA}\\Programs\\Exiled Exchange 2\\Exiled Exchange 2.exe`,
      `${LOCAL_APPDATA}\\Programs\\exiled-exchange-2\\Exiled Exchange 2.exe`,
      `${USERPROFILE}\\AppData\\Local\\Programs\\Exiled Exchange 2\\Exiled Exchange 2.exe`,
      `${USERPROFILE}\\AppData\\Local\\Programs\\exiled-exchange-2\\exiled-exchange-2.exe`,
    ],
    downloadUrl: 'https://kvan7.github.io/Exiled-Exchange-2/download',
  },
  {
    id: 'awakened-poe-trade',
    name: 'Awakened PoE Trade',
    category: 'poe1',
    blurb: 'Price check overlay for Path of Exile',
    exeNames: ['Awakened PoE Trade.exe'],
    pathHints: [
      `${PROGRAM_FILES}\\Awakened PoE Trade\\Awakened PoE Trade.exe`,
      `${PROGRAM_FILES_X86}\\Awakened PoE Trade\\Awakened PoE Trade.exe`,
      `${LOCAL_APPDATA}\\Programs\\Awakened PoE Trade\\Awakened PoE Trade.exe`,
      `${USERPROFILE}\\AppData\\Local\\Programs\\Awakened PoE Trade\\Awakened PoE Trade.exe`,
    ],
    downloadUrl: 'https://snosme.github.io/awakened-poe-trade/download',
  },
  {
    id: 'chaos-recipe-enhancer',
    name: 'Chaos Recipe Enhancer',
    category: 'poe1',
    blurb: 'Chaos / Regal recipe helper',
    exeNames: [
      'ChaosRecipeEnhancer.exe',
      'Chaos Recipe Enhancer.exe',
      'CRE.exe',
    ],
    pathHints: [
      `${LOCAL_APPDATA}\\ChaosRecipeEnhancer\\current\\ChaosRecipeEnhancer.exe`,
      `${USERPROFILE}\\AppData\\Local\\ChaosRecipeEnhancer\\current\\ChaosRecipeEnhancer.exe`,
      `${LOCAL_APPDATA}\\ChaosRecipeEnhancer\\ChaosRecipeEnhancer.exe`,
      `${LOCAL_APPDATA}\\Programs\\ChaosRecipeEnhancer\\ChaosRecipeEnhancer.exe`,
      `${PROGRAM_FILES}\\ChaosRecipeEnhancer\\ChaosRecipeEnhancer.exe`,
    ],
    downloadUrl: 'https://github.com/ChaosRecipeEnhancer/ChaosRecipeEnhancer/releases',
  },
  {
    id: 'pob-community',
    name: 'Path of Building',
    category: 'poe1',
    blurb: 'Community fork · PoE1 offline build planner',
    exeNames: ['Path of Building.exe', 'PathOfBuilding.exe'],
    pathHints: [
      `${PROGRAM_FILES}\\Path of Building Community\\Path of Building.exe`,
      `${LOCAL_APPDATA}\\Path of Building Community\\Path of Building.exe`,
      `${LOCAL_APPDATA}\\Programs\\Path of Building Community\\Path of Building.exe`,
      `${APPDATA}\\Path of Building Community\\Path of Building.exe`,
    ],
    downloadUrl: 'https://pathofbuilding.community/',
  },
  {
    id: 'pob-community-poe2',
    name: 'Path of Building (PoE2)',
    category: 'poe2',
    blurb: 'Community fork · PoE2 offline build planner',
    exeNames: [
      'Path of Building.exe',
      'PathOfBuilding.exe',
      'Path of Building-PoE2.exe',
    ],
    pathHints: [
      `${APPDATA}\\Path of Building Community (PoE2)\\Path of Building.exe`,
      `${APPDATA}\\Path of Building Community (PoE2)\\PathOfBuilding.exe`,
      `${USERPROFILE}\\AppData\\Roaming\\Path of Building Community (PoE2)\\Path of Building.exe`,
      `${PROGRAM_FILES}\\Path of Building Community (PoE2)\\Path of Building.exe`,
      `${LOCAL_APPDATA}\\Path of Building Community (PoE2)\\Path of Building.exe`,
      `${LOCAL_APPDATA}\\Programs\\Path of Building Community (PoE2)\\Path of Building.exe`,
      `${PROGRAM_FILES}\\PathOfBuildingCommunity-PoE2\\Path of Building.exe`,
    ],
    downloadUrl: 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/releases',
  },
  {
    id: 'poe-lurker',
    name: 'PoE Lurker',
    category: 'poe1',
    blurb: 'Trade whisper & stash helper',
    exeNames: ['PoELurker.exe', 'PoE Lurker.exe'],
    pathHints: [
      `${LOCAL_APPDATA}\\PoELurker\\PoELurker.exe`,
      `${LOCAL_APPDATA}\\Programs\\PoELurker\\PoELurker.exe`,
      `${PROGRAM_FILES}\\PoELurker\\PoELurker.exe`,
    ],
    downloadUrl: 'https://github.com/C1rdec/Poe-Lurker',
  },
];

/** Optional utilities - shown on Recommendations page (no launch/scan). */
/** @type {RecommendationDef[]} */
const RECOMMENDATIONS = [
  {
    id: 'x-mouse-button',
    name: 'X-Mouse Button Control',
    summary:
      'Remap mouse buttons per application. Useful for binding extra buttons to flasks, skills, or PoE overlays without fighting the game’s default binds.',
    downloadUrl: 'https://www.highrez.co.uk/downloads/xmousebuttoncontrol.htm',
  },
  {
    id: 'yolomouse',
    name: 'YoloMouse',
    summary:
      'Replace in-game cursors with custom ones (size, color, style). Helps visibility in busy PoE combat and keeps a consistent pointer across games.',
    downloadUrl: 'https://yolomouse.com/',
  },
];

/** @type {Record<ToolCategory | 'optional', string>} */
const CATEGORY_LABELS = {
  poe1: 'Path of Exile 1',
  poe2: 'Path of Exile 2',
  optional: 'Optional',
};

module.exports = { CATALOG, RECOMMENDATIONS, CATEGORY_LABELS };
