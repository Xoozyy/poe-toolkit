export {};

export type ToolCategory = 'poe1' | 'poe2' | 'optional';

export interface ToolStatus {
  id: string;
  name: string;
  category: ToolCategory;
  categoryLabel: string;
  blurb: string;
  downloadUrl: string | null;
  resolvedPath: string | null;
  source: 'custom' | 'scan' | 'none';
  ready: boolean;
  customPath: string | null;
  showDownloadPrompt: boolean;
  downloadDismissed: boolean;
  unused: boolean;
  isCustom: boolean;
  launchable: boolean;
}

export interface Recommendation {
  id: string;
  name: string;
  summary: string;
  downloadUrl: string;
  unused: boolean;
  isCustom: boolean;
}

export interface LeagueInfo {
  nextName: string;
  nextStartUtc: string;
  currentName: string;
  announcementUrl: string | null;
  live: boolean;
  startMs: number | null;
}

export interface AnnouncementItem {
  id: string;
  threadId: string | null;
  title: string;
  poster: string;
  time: string | null;
  forum: string;
  url: string;
  excerpt: string;
}

export interface AnnouncementsResult {
  ok: boolean;
  items: AnnouncementItem[];
  error?: string;
  fetchedAt?: string;
}

export interface CurrencyExchangeRate {
  ok: boolean;
  league: string;
  chaosPerDivine: number | null;
  chaosIconUrl?: string | null;
  divineIconUrl?: string | null;
  fetchedAt?: string;
  error?: string;
}

export interface StorageInfo {
  configPath: string;
  userDataPath: string;
  packaged: boolean;
}

export interface ToolsBundle {
  tools: ToolStatus[];
  recommendations: Recommendation[];
  error?: string;
  ok?: boolean;
  canceled?: boolean;
}

export interface PoeToolkitApi {
  listTools: () => Promise<ToolStatus[]>;
  listRecommendations: () => Promise<Recommendation[]>;
  getLeague: () => Promise<LeagueInfo>;
  listAnnouncements: () => Promise<AnnouncementsResult>;
  getCurrencyExchange: () => Promise<CurrencyExchangeRate>;
  getStorageInfo: () => Promise<StorageInfo>;
  openStorageFolder: () => Promise<{ ok: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  rescan: () => Promise<ToolStatus[]>;
  pickExe: (
    toolId: string,
  ) => Promise<{ tools: ToolStatus[]; error?: string } | ToolStatus[]>;
  clearPath: (toolId: string) => Promise<ToolStatus[]>;
  launch: (toolId: string) => Promise<{ ok: boolean; error?: string }>;
  openDownload: (toolId: string) => Promise<{ ok: boolean; error?: string }>;
  dismissDownload: (toolId: string) => Promise<ToolStatus[]>;
  resetDismissed: () => Promise<ToolStatus[]>;
  setUnused: (id: string, unused: boolean) => Promise<ToolsBundle>;
  addCustom: (payload: {
    category: ToolCategory;
    name?: string;
    exePath?: string;
    blurb?: string;
    downloadUrl?: string;
  }) => Promise<ToolsBundle>;
  removeCustom: (id: string) => Promise<ToolsBundle>;
  platform: string;
}

declare global {
  interface Window {
    poeToolkit?: PoeToolkitApi;
  }
}
