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
  unused: boolean;
  isCustom: boolean;
  isLink?: boolean;
  openUrl?: string | null;
}

export interface Recommendation {
  id: string;
  name: string;
  summary: string;
  downloadUrl: string;
  unused: boolean;
}

export interface LeagueLoginCopy {
  kicker: string;
  headline: string;
  meta: string;
  badge: string;
}

export interface LeagueInfo {
  nextName: string;
  currentName: string | null;
  startMs: number | null;
  /** Content funnel stage */
  stage: 'countdown' | 'login' | 'current';
  game?: 'poe1' | 'poe2';
  launchReason?: 'schedule' | 'poe.ninja' | 'preview' | null;
  loginCopy?: LeagueLoginCopy | null;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  poster: string;
  time: string | null;
  url: string;
  excerpt: string;
}

export interface AnnouncementsResult {
  ok: boolean;
  items: AnnouncementItem[];
  error?: string;
  highlightId?: string | null;
}

export interface CurrencyPairRate {
  id: string;
  label: string;
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
  rate: number | null;
  error?: string;
}

export interface CurrencyPairOption {
  id: string;
  label: string;
}

export interface CurrencyExchangeRate {
  ok: boolean;
  game?: 'poe1' | 'poe2';
  league: string;
  pageUrl?: string;
  rates?: CurrencyPairRate[];
  fetchedAt?: string;
  error?: string;
}

export interface EconomyLeague {
  id: string;
  name: string;
  url?: string;
}

export interface CurrencyLeagueOffer {
  game: 'poe1' | 'poe2';
  currentLeague: string;
  currentName: string;
  suggested: { id: string; name: string };
  /** True when shown from Settings test control */
  preview?: boolean;
}

export interface QueueReminderOffer {
  game: 'poe1' | 'poe2';
  leagueName: string;
  startMs: number;
  minutesBefore: number;
  preview?: boolean;
}

export interface CurrencyLeaguesResult {
  ok: boolean;
  game?: 'poe1' | 'poe2';
  league: string;
  leagues: EconomyLeague[];
  error?: string;
}

export interface StorageInfo {
  configPath: string;
}

export interface ToolsBundle {
  tools: ToolStatus[];
  recommendations: Recommendation[];
  error?: string;
  ok?: boolean;
  canceled?: boolean;
}

export type OrderPage = 'poe1' | 'poe2' | 'optional' | 'unused';

export type LayoutPage = 'poe1' | 'poe2' | 'optional';

export type ToolOrders = Record<OrderPage, string[]>;

export interface PageSection {
  id: string;
  name: string;
  toolIds: string[];
}

export interface PageLayout {
  sections: PageSection[];
}

export type PageLayouts = Record<LayoutPage, PageLayout>;

export type InfoLayout = 'compact' | 'normal';

export interface PoeToolkitApi {
  listTools: () => Promise<ToolStatus[]>;
  listRecommendations: () => Promise<Recommendation[]>;
  getLeague: (game?: 'poe1' | 'poe2') => Promise<LeagueInfo>;
  openLeagueWidget: () => Promise<{ ok: boolean }>;
  closeLeagueWidget: () => Promise<{ ok: boolean }>;
  listAnnouncements: () => Promise<AnnouncementsResult>;
  markAnnouncementRead: (id: string) => Promise<{ ok: boolean }>;
  getCurrencyExchange: (game?: 'poe1' | 'poe2') => Promise<CurrencyExchangeRate>;
  listCurrencyLeagues: (game?: 'poe1' | 'poe2') => Promise<CurrencyLeaguesResult>;
  listCurrencyPairs: () => Promise<{
    ok: boolean;
    pairs: CurrencyPairOption[];
    selectedIds: string[];
  }>;
  setCurrencyPairs: (
    ids: string[],
  ) => Promise<{
    ok: boolean;
    selectedIds: string[];
    pairs: CurrencyPairOption[];
    ratePoe1?: CurrencyExchangeRate;
    ratePoe2?: CurrencyExchangeRate;
    error?: string;
  }>;
  setCurrencyLeague: (
    leagueId: string,
    game?: 'poe1' | 'poe2',
  ) => Promise<{
    ok: boolean;
    game?: 'poe1' | 'poe2';
    league?: string;
    leagues?: EconomyLeague[];
    rate?: CurrencyExchangeRate;
    error?: string;
  }>;
  getCurrencyLeagueOffers: () => Promise<{
    ok: boolean;
    offers: CurrencyLeagueOffer[];
  }>;
  dismissCurrencyLeagueOffer: (
    game: 'poe1' | 'poe2',
    leagueId: string,
  ) => Promise<{ ok: boolean }>;
  getInfoLayout: () => Promise<InfoLayout>;
  setInfoLayout: (
    layout: InfoLayout,
  ) => Promise<{ ok: boolean; infoLayout: InfoLayout }>;
  getPreviewLeagueLaunch: () => Promise<boolean>;
  setPreviewLeagueLaunch: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; previewLeagueLaunch: boolean }>;
  getStreamerMode: () => Promise<boolean>;
  setStreamerMode: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; streamerMode: boolean }>;
  getCloseToTray: () => Promise<boolean>;
  setCloseToTray: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; closeToTray: boolean }>;
  getQueueReminder: () => Promise<{ enabled: boolean; minutes: number }>;
  setQueueReminder: (payload: {
    enabled?: boolean;
    minutes?: number;
  }) => Promise<{ ok: boolean; enabled: boolean; minutes: number }>;
  getQueueReminderDismissed: (
    game: 'poe1' | 'poe2',
  ) => Promise<{ ok: boolean; key: string | null }>;
  dismissQueueReminder: (
    game: 'poe1' | 'poe2',
    key: string,
  ) => Promise<{ ok: boolean }>;
  showNotification: (payload: {
    title: string;
    body: string;
  }) => Promise<{ ok: boolean }>;
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
    kind?: 'app' | 'link';
    name?: string;
    exePath?: string;
    url?: string;
    blurb?: string;
    downloadUrl?: string;
  }) => Promise<ToolsBundle>;
  updateCustom: (
    id: string,
    patch: {
      name?: string;
      blurb?: string;
      category?: ToolCategory;
      kind?: 'app' | 'link';
      url?: string;
      exePath?: string;
      downloadUrl?: string | null;
      pickExe?: boolean;
    },
  ) => Promise<
    ToolsBundle & {
      pageLayouts?: PageLayouts;
      toolOrders?: ToolOrders;
    }
  >;
  removeCustom: (id: string) => Promise<ToolsBundle>;
  getToolOrders: () => Promise<ToolOrders>;
  setToolOrder: (page: OrderPage, ids: string[]) => Promise<ToolOrders>;
  getPageLayouts: () => Promise<PageLayouts>;
  getPageLayout: (page: LayoutPage) => Promise<PageLayout>;
  setPageLayout: (
    page: LayoutPage,
    layout: PageLayout,
  ) => Promise<{ pageLayouts: PageLayouts; toolOrders: ToolOrders }>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximized: (cb: (maximized: boolean) => void) => () => void;
  isDev: boolean;
}

declare global {
  interface Window {
    poeToolkit?: PoeToolkitApi;
  }
}
