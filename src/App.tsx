import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnnouncementsResult,
  CurrencyExchangeRate,
  CurrencyPairOption,
  EconomyLeague,
  InfoLayout,
  LeagueInfo,
  OrderPage,
  Recommendation,
  StorageInfo,
  ToolCategory,
  ToolOrders,
  ToolStatus,
} from './types';
import { ToolCard } from './components/ToolCard';
import { RecommendationCard } from './components/RecommendationCard';
import { LeagueCountdown } from './components/LeagueCountdown';
import { obscureSensitive } from './lib/streamer';
import { AnnouncementsFeed } from './components/AnnouncementsFeed';
import { CurrencyExchange } from './components/CurrencyExchange';
import { TitleBar, useWindowChrome } from './components/TitleBar';
import { SortableGrid } from './components/SortableGrid';
import './App.css';

type Page = OrderPage;

const EMPTY_ORDERS: ToolOrders = {
  poe1: [],
  poe2: [],
  optional: [],
  unused: [],
};

const PAGE_COPY: Record<
  Page,
  { title: string; lede: string; nav: string }
> = {
  poe1: {
    nav: 'Path of Exile',
    title: 'Path of Exile',
    lede: 'Game and companions for PoE1. Set a path if scan misses an install.',
  },
  poe2: {
    nav: 'Path of Exile 2',
    title: 'Path of Exile 2',
    lede: 'Game and companions for PoE2. Set a path if scan misses an install.',
  },
  optional: {
    nav: 'Optional',
    title: 'Optional tools',
    lede: 'Not launched from here by default summaries, downloads, or your own apps.',
  },
  unused: {
    nav: 'Not in use',
    title: 'Not in use',
    lede: 'Hidden apps live here. Restore them anytime, or delete custom ones permanently.',
  },
};

const NAV_ORDER: Page[] = ['poe1', 'poe2', 'optional', 'unused'];

function normalizeTools(
  result: ToolStatus[] | { tools: ToolStatus[]; error?: string },
): { tools: ToolStatus[]; error?: string } {
  if (Array.isArray(result)) return { tools: result };
  return result;
}

function sortByOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const ai = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

type PageEntry =
  | { kind: 'tool'; id: string; tool: ToolStatus }
  | { kind: 'rec'; id: string; item: Recommendation };

export default function App() {
  const api = window.poeToolkit;
  const windowChrome = useWindowChrome(api ?? null);
  const [page, setPage] = useState<Page>('poe1');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [leaguePoe1, setLeaguePoe1] = useState<LeagueInfo | null>(null);
  const [leaguePoe2, setLeaguePoe2] = useState<LeagueInfo | null>(null);
  const [announcements, setAnnouncements] =
    useState<AnnouncementsResult | null>(null);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [currencyPoe1, setCurrencyPoe1] = useState<CurrencyExchangeRate | null>(
    null,
  );
  const [currencyPoe2, setCurrencyPoe2] = useState<CurrencyExchangeRate | null>(
    null,
  );
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyLeaguePoe1, setCurrencyLeaguePoe1] = useState<string>('Standard');
  const [currencyLeaguePoe2, setCurrencyLeaguePoe2] = useState<string>('Standard');
  const [currencyLeaguesPoe1, setCurrencyLeaguesPoe1] = useState<EconomyLeague[]>(
    [],
  );
  const [currencyLeaguesPoe2, setCurrencyLeaguesPoe2] = useState<EconomyLeague[]>(
    [],
  );
  const [currencyLeaguesLoading, setCurrencyLeaguesLoading] = useState(false);
  const [currencyPairs, setCurrencyPairs] = useState<CurrencyPairOption[]>([]);
  const [currencyPairIds, setCurrencyPairIds] = useState<string[]>([
    'chaos-divine',
  ]);
  const [infoLayout, setInfoLayout] = useState<InfoLayout>('compact');
  const [previewLeagueLaunch, setPreviewLeagueLaunch] = useState(false);
  const [streamerMode, setStreamerMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<'choose' | 'link'>('choose');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [orders, setOrders] = useState<ToolOrders>(EMPTY_ORDERS);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const applyBundle = useCallback(
    (bundle: { tools: ToolStatus[]; recommendations?: Recommendation[] }) => {
      setTools(bundle.tools);
      if (bundle.recommendations) setRecs(bundle.recommendations);
    },
    [],
  );

  const refreshAnnouncements = useCallback(async () => {
    if (!api) return;
    setAnnouncementsLoading(true);
    try {
      setAnnouncements(await api.listAnnouncements());
    } catch (err) {
      setAnnouncements({
        ok: false,
        items: [],
        error: String(err),
      });
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [api]);

  const refreshCurrency = useCallback(async () => {
    if (!api) return;
    setCurrencyLoading(true);
    try {
      const [rate1, rate2] = await Promise.all([
        api.getCurrencyExchange('poe1'),
        api.getCurrencyExchange('poe2'),
      ]);
      setCurrencyPoe1(rate1);
      setCurrencyPoe2(rate2);
      if (rate1?.league) setCurrencyLeaguePoe1(rate1.league);
      if (rate2?.league) setCurrencyLeaguePoe2(rate2.league);
    } catch (err) {
      const message = String(err);
      setCurrencyPoe1({ ok: false, game: 'poe1', league: 'Standard', error: message });
      setCurrencyPoe2({ ok: false, game: 'poe2', league: 'Standard', error: message });
    } finally {
      setCurrencyLoading(false);
    }
  }, [api]);

  const refreshCurrencyLeagues = useCallback(async () => {
    if (!api) return;
    setCurrencyLeaguesLoading(true);
    try {
      const [result1, result2] = await Promise.all([
        api.listCurrencyLeagues('poe1'),
        api.listCurrencyLeagues('poe2'),
      ]);
      setCurrencyLeaguesPoe1(result1.leagues || []);
      setCurrencyLeaguesPoe2(result2.leagues || []);
      if (result1.league) setCurrencyLeaguePoe1(result1.league);
      if (result2.league) setCurrencyLeaguePoe2(result2.league);
    } catch {
      setCurrencyLeaguesPoe1([]);
      setCurrencyLeaguesPoe2([]);
    } finally {
      setCurrencyLeaguesLoading(false);
    }
  }, [api]);

  const refreshCurrencyPairs = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.listCurrencyPairs();
      setCurrencyPairs(result.pairs || []);
      if (Array.isArray(result.selectedIds) && result.selectedIds.length > 0) {
        setCurrencyPairIds(result.selectedIds);
      }
    } catch {
      setCurrencyPairs([]);
    }
  }, [api]);

  const onCurrencyLeagueChange = useCallback(
    async (game: 'poe1' | 'poe2', leagueId: string) => {
      if (!api || !leagueId) return;
      if (game === 'poe2') setCurrencyLeaguePoe2(leagueId);
      else setCurrencyLeaguePoe1(leagueId);
      setCurrencyLoading(true);
      try {
        const result = await api.setCurrencyLeague(leagueId, game);
        if (!result.ok) {
          showToast(result.error || 'Could not change league');
          void refreshCurrencyLeagues();
          return;
        }
        if (game === 'poe2') {
          if (result.leagues) setCurrencyLeaguesPoe2(result.leagues);
          if (result.league) setCurrencyLeaguePoe2(result.league);
          if (result.rate) setCurrencyPoe2(result.rate);
          else void refreshCurrency();
        } else {
          if (result.leagues) setCurrencyLeaguesPoe1(result.leagues);
          if (result.league) setCurrencyLeaguePoe1(result.league);
          if (result.rate) setCurrencyPoe1(result.rate);
          else void refreshCurrency();
        }
      } catch (err) {
        showToast(String(err));
      } finally {
        setCurrencyLoading(false);
      }
    },
    [api, refreshCurrency, refreshCurrencyLeagues, showToast],
  );

  const onCurrencyPairToggle = useCallback(
    async (pairId: string, enabled: boolean) => {
      if (!api) return;
      const next = enabled
        ? [...new Set([...currencyPairIds, pairId])]
        : currencyPairIds.filter((id) => id !== pairId);
      if (next.length === 0) {
        showToast('Keep at least one currency pair enabled');
        return;
      }
      setCurrencyPairIds(next);
      setCurrencyLoading(true);
      try {
        const result = await api.setCurrencyPairs(next);
        if (!result.ok) {
          showToast(result.error || 'Could not update currency pairs');
          void refreshCurrencyPairs();
          return;
        }
        if (result.pairs) setCurrencyPairs(result.pairs);
        if (result.selectedIds) setCurrencyPairIds(result.selectedIds);
        if (result.ratePoe1) setCurrencyPoe1(result.ratePoe1);
        if (result.ratePoe2) setCurrencyPoe2(result.ratePoe2);
        if (!result.ratePoe1 || !result.ratePoe2) void refreshCurrency();
      } catch (err) {
        showToast(String(err));
      } finally {
        setCurrencyLoading(false);
      }
    },
    [api, currencyPairIds, refreshCurrency, refreshCurrencyPairs, showToast],
  );

  const refreshLeague = useCallback(async () => {
    if (!api) return;
    try {
      const [poe1Info, poe2Info] = await Promise.all([
        api.getLeague('poe1'),
        api.getLeague('poe2'),
      ]);
      setLeaguePoe1(poe1Info);
      setLeaguePoe2(poe2Info);
    } catch {
      /* keep last known */
    }
  }, [api]);

  const onInfoLayoutChange = useCallback(
    async (layout: InfoLayout) => {
      if (!api) return;
      setInfoLayout(layout);
      try {
        const result = await api.setInfoLayout(layout);
        if (result?.infoLayout) setInfoLayout(result.infoLayout);
      } catch (err) {
        showToast(String(err));
      }
    },
    [api, showToast],
  );

  const onPreviewLeagueLaunchChange = useCallback(
    async (enabled: boolean) => {
      if (!api) return;
      setPreviewLeagueLaunch(enabled);
      try {
        const result = await api.setPreviewLeagueLaunch(enabled);
        setPreviewLeagueLaunch(Boolean(result?.previewLeagueLaunch));
        await refreshLeague();
      } catch (err) {
        showToast(String(err));
        setPreviewLeagueLaunch(!enabled);
      }
    },
    [api, refreshLeague, showToast],
  );

  const onStreamerModeChange = useCallback(
    async (enabled: boolean) => {
      if (!api) return;
      setStreamerMode(enabled);
      try {
        const result = await api.setStreamerMode(enabled);
        setStreamerMode(Boolean(result?.streamerMode));
      } catch (err) {
        showToast(String(err));
        setStreamerMode(!enabled);
      }
    },
    [api, showToast],
  );

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        list,
        recommendations,
        league1,
        league2,
        toolOrders,
        layout,
        preview,
        streamer,
      ] = await Promise.all([
        api.listTools(),
        api.listRecommendations(),
        api.getLeague('poe1'),
        api.getLeague('poe2'),
        api.getToolOrders(),
        api.getInfoLayout(),
        api.getPreviewLeagueLaunch(),
        api.getStreamerMode(),
      ]);
      setTools(list);
      setRecs(recommendations);
      setLeaguePoe1(league1);
      setLeaguePoe2(league2);
      setOrders(toolOrders);
      setInfoLayout(layout === 'normal' ? 'normal' : 'compact');
      setPreviewLeagueLaunch(Boolean(preview));
      setStreamerMode(Boolean(streamer));
      void refreshAnnouncements();
      void refreshCurrency();
    } catch (err) {
      showToast(String(err));
    } finally {
      setLoading(false);
    }
  }, [api, showToast, refreshAnnouncements, refreshCurrency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      void refreshAnnouncements();
      void refreshCurrency();
      void refreshLeague();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [api, refreshAnnouncements, refreshCurrency, refreshLeague]);

  // Closer poll near launch so poe.ninja detection / schedule flip feels snappy
  useEffect(() => {
    if (!api) return;
    const nearLaunch = [leaguePoe1, leaguePoe2].some((info) => {
      if (!info?.startMs || info.stage === 'login') return false;
      return info.startMs - Date.now() <= 6 * 60 * 60 * 1000;
    });
    if (!nearLaunch) return;
    const id = window.setInterval(() => {
      void refreshLeague();
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, [api, leaguePoe1, leaguePoe2, refreshLeague]);

  // Countdown widget is only useful pre-launch (PoE1)
  useEffect(() => {
    if (!api || leaguePoe1?.stage !== 'login') return;
    void api.closeLeagueWidget();
  }, [api, leaguePoe1?.stage]);

  useEffect(() => {
    if (!api || !settingsOpen) return;
    void api.getStorageInfo().then(setStorageInfo).catch(() => setStorageInfo(null));
    void refreshCurrencyLeagues();
    void refreshCurrencyPairs();
  }, [api, settingsOpen, refreshCurrencyLeagues, refreshCurrencyPairs]);

  const pageTools = useMemo(() => {
    if (page === 'unused') {
      return tools.filter((t) => t.unused);
    }
    if (page === 'optional') {
      return tools.filter((t) => t.category === 'optional' && !t.unused);
    }
    if (page === 'poe1' || page === 'poe2') {
      return tools.filter((t) => t.category === page && !t.unused);
    }
    return [];
  }, [tools, page]);

  const pageRecs = useMemo(() => {
    if (page === 'optional') return recs.filter((r) => !r.unused);
    if (page === 'unused') return recs.filter((r) => r.unused);
    return [];
  }, [recs, page]);

  const pageEntries = useMemo(() => {
    const entries: PageEntry[] = [
      ...pageRecs.map((item) => ({ kind: 'rec' as const, id: item.id, item })),
      ...pageTools.map((tool) => ({ kind: 'tool' as const, id: tool.id, tool })),
    ];
    return sortByOrder(entries, orders[page] || []);
  }, [pageRecs, pageTools, orders, page]);

  const pageEntryIds = useMemo(
    () => pageEntries.map((entry) => entry.id),
    [pageEntries],
  );

  const entryById = useMemo(() => {
    const map = new Map<string, PageEntry>();
    for (const entry of pageEntries) map.set(entry.id, entry);
    return map;
  }, [pageEntries]);

  async function onReorder(ids: string[]) {
    if (!api) return;
    setOrders((prev) => ({ ...prev, [page]: ids }));
    try {
      setOrders(await api.setToolOrder(page, ids));
    } catch (err) {
      showToast(String(err));
    }
  }

  const readyCount = tools.filter((t) => t.ready && !t.unused).length;
  const visibleToolCount = tools.filter((t) => !t.unused).length;
  const isLaunchPage = page === 'poe1' || page === 'poe2';
  const canAddApp = page === 'poe1' || page === 'poe2' || page === 'optional';
  const copy = PAGE_COPY[page];

  async function onRescan() {
    if (!api) return;
    setLoading(true);
    try {
      setTools(await api.rescan());
      showToast('Rescan complete');
    } catch (err) {
      showToast(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onLaunch(id: string) {
    if (!api) return;
    setBusyId(id);
    try {
      const result = await api.launch(id);
      if (!result.ok) showToast(result.error || 'Launch failed');
    } catch (err) {
      showToast(String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onPick(id: string) {
    if (!api) return;
    setBusyId(id);
    try {
      const result = normalizeTools(await api.pickExe(id));
      setTools(result.tools);
      if (result.error) showToast(result.error);
    } catch (err) {
      showToast(String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onClear(id: string) {
    if (!api) return;
    setTools(await api.clearPath(id));
    showToast('Custom path cleared');
  }

  async function onDownload(id: string) {
    if (!api) return;
    const result = await api.openDownload(id);
    if (!result.ok) showToast(result.error || 'Could not open download page');
  }

  async function onDismiss(id: string) {
    if (!api) return;
    setTools(await api.dismissDownload(id));
  }

  async function onHide(id: string) {
    if (!api) return;
    applyBundle(await api.setUnused(id, true));
    showToast('Moved to Not in use');
  }

  async function onRestore(id: string) {
    if (!api) return;
    applyBundle(await api.setUnused(id, false));
    showToast('Restored');
  }

  async function onRemoveCustom(id: string) {
    if (!api) return;
    applyBundle(await api.removeCustom(id));
    showToast('Custom app removed');
  }

  async function onAddApp() {
    if (!api || !canAddApp) return;
    setAddStep('choose');
    setLinkName('');
    setLinkUrl('');
    setAddOpen(true);
  }

  async function onAddApplication() {
    if (!api || !canAddApp) return;
    setAddOpen(false);
    const category = page as ToolCategory;
    const result = await api.addCustom({ category, kind: 'app' });
    if (result.canceled) return;
    applyBundle(result);
    if (result.error) showToast(result.error);
    else if (result.ok) showToast('Custom app added');
  }

  async function onAddWebsiteLink() {
    if (!api || !canAddApp) return;
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      showToast('Enter a valid http(s) URL');
      return;
    }
    const category = page as ToolCategory;
    const result = await api.addCustom({
      category,
      kind: 'link',
      url,
      name: linkName.trim() || undefined,
      blurb: 'Website shortcut',
    });
    applyBundle(result);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setAddOpen(false);
    setLinkName('');
    setLinkUrl('');
    if (result.ok) showToast('Website shortcut added');
  }

  async function onResetDismissed() {
    if (!api) return;
    setTools(await api.resetDismissed());
    setSettingsOpen(false);
    showToast('Download prompts restored');
  }

  if (!api) {
    return (
      <div className="app-shell">
        <div className="atmosphere" aria-hidden />
        <div className="browser-fallback">
          <h1>PoE Toolkit</h1>
          <p>
            Run <code>npm run electron:dev</code> to open the desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />

      <TitleBar
        isMaximized={windowChrome.maximized}
        onMinimize={windowChrome.minimize}
        onMaximize={windowChrome.maximize}
        onClose={windowChrome.close}
      />

      <div className="app-body">
      <aside className="sidebar">
        <nav className="sidebar-nav">
          {NAV_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`nav-item${page === id ? ' is-active' : ''}`}
              onClick={() => setPage(id)}
            >
              {PAGE_COPY[id].nav}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {streamerMode && (
            <p className="streamer-mode-pill" title="Paths and personal details are hidden">
              Streamer mode
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            Settings
          </button>
          <p className="sidebar-meta">
            {readyCount}/{visibleToolCount} ready
          </p>
        </div>
      </aside>

      <div className="main-column">
        <header className="page-header">
          <div>
            <h1 className="page-title">{copy.title}</h1>
            <p className="page-lede">{copy.lede}</p>
          </div>
          {(isLaunchPage || canAddApp) && (
            <div className="page-header-actions">
              {isLaunchPage && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onRescan()}
                  disabled={loading}
                >
                  Rescan
                </button>
              )}
              {canAddApp && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void onAddApp()}
                >
                  Add
                </button>
              )}
            </div>
          )}
        </header>

        <main className="workspace">
          {isLaunchPage && (
            <>
              {page === 'poe1' && (
                <div
                  className="info-zone"
                >
                  <div className="info-zone-toolbar">
                    <span className="info-zone-label">League & news</span>
                    <div className="info-layout-toggle" role="group" aria-label="Info layout">
                      <button
                        type="button"
                        className={`info-layout-btn${infoLayout === 'compact' ? ' is-active' : ''}`}
                        aria-pressed={infoLayout === 'compact'}
                        onClick={() => void onInfoLayoutChange('compact')}
                      >
                        Compact
                      </button>
                      <button
                        type="button"
                        className={`info-layout-btn${infoLayout === 'normal' ? ' is-active' : ''}`}
                        aria-pressed={infoLayout === 'normal'}
                        onClick={() => void onInfoLayoutChange('normal')}
                      >
                        Normal
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      infoLayout === 'compact' ? 'info-strip' : 'info-stack'
                    }
                  >
                    <LeagueCountdown
                      league={leaguePoe1}
                      density={infoLayout}
                      onOpenWidget={() => {
                        void api.openLeagueWidget();
                      }}
                      onLaunchGame={() => {
                        void onLaunch('poe1');
                      }}
                    />
                    <AnnouncementsFeed
                      feed={announcements}
                      loading={announcementsLoading}
                      density={infoLayout}
                      onRefresh={() => void refreshAnnouncements()}
                      onOpen={(item) => {
                        void (async () => {
                          await api.markAnnouncementRead(item.id);
                          void api.openExternal(item.url);
                          void refreshAnnouncements();
                        })();
                      }}
                    />
                  </div>
                </div>
              )}
              {page === 'poe2' && (
                <div
                  className="info-zone"
                >
                  <div className="info-zone-toolbar">
                    <span className="info-zone-label">League</span>
                    <div className="info-layout-toggle" role="group" aria-label="Info layout">
                      <button
                        type="button"
                        className={`info-layout-btn${infoLayout === 'compact' ? ' is-active' : ''}`}
                        aria-pressed={infoLayout === 'compact'}
                        onClick={() => void onInfoLayoutChange('compact')}
                      >
                        Compact
                      </button>
                      <button
                        type="button"
                        className={`info-layout-btn${infoLayout === 'normal' ? ' is-active' : ''}`}
                        aria-pressed={infoLayout === 'normal'}
                        onClick={() => void onInfoLayoutChange('normal')}
                      >
                        Normal
                      </button>
                    </div>
                  </div>
                  <div
                    className={
                      infoLayout === 'compact' ? 'info-strip' : 'info-stack'
                    }
                  >
                    <LeagueCountdown
                      league={leaguePoe2}
                      density={infoLayout}
                      onLaunchGame={() => {
                        void onLaunch('poe2');
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="workspace-primary">
                {loading && pageEntries.length === 0 ? (
                  <p className="muted">Scanning for installations…</p>
                ) : pageEntries.length === 0 ? (
                  <p className="muted">No apps on this tab. Use Add to include one.</p>
                ) : (
                  <section className="category">
                    <SortableGrid
                      className="tool-grid"
                      ids={pageEntryIds}
                      onReorder={(ids) => void onReorder(ids)}
                    >
                      {(id, bind) => {
                        const entry = entryById.get(id);
                        if (!entry || entry.kind !== 'tool') return null;
                        const tool = entry.tool;
                        return (
                          <ToolCard
                            tool={tool}
                            busy={busyId === tool.id}
                            streamerMode={streamerMode}
                            sortable={bind}
                            onLaunch={() => void onLaunch(tool.id)}
                            onPick={() => void onPick(tool.id)}
                            onClear={() => void onClear(tool.id)}
                            onDownload={() => void onDownload(tool.id)}
                            onDismiss={() => void onDismiss(tool.id)}
                            onHide={() => void onHide(tool.id)}
                            onRestore={() => void onRestore(tool.id)}
                          />
                        );
                      }}
                    </SortableGrid>
                  </section>
                )}
              </div>
            </>
          )}

          {page === 'optional' && (
            <section className="category">
              {pageEntries.length === 0 ? (
                <p className="muted">Nothing here yet. Add an app or restore from Not in use.</p>
              ) : (
                <SortableGrid
                  className="tool-grid"
                  ids={pageEntryIds}
                  onReorder={(ids) => void onReorder(ids)}
                >
                  {(id, bind) => {
                    const entry = entryById.get(id);
                    if (!entry) return null;
                    if (entry.kind === 'rec') {
                      return (
                        <RecommendationCard
                          item={entry.item}
                          sortable={bind}
                          onDownload={() => void onDownload(entry.item.id)}
                          onHide={() => void onHide(entry.item.id)}
                          onRestore={() => void onRestore(entry.item.id)}
                        />
                      );
                    }
                    const tool = entry.tool;
                    return (
                      <ToolCard
                        tool={tool}
                        busy={busyId === tool.id}
                        streamerMode={streamerMode}
                        sortable={bind}
                        onLaunch={() => void onLaunch(tool.id)}
                        onPick={() => void onPick(tool.id)}
                        onClear={() => void onClear(tool.id)}
                        onDownload={() => void onDownload(tool.id)}
                        onDismiss={() => void onDismiss(tool.id)}
                        onHide={() => void onHide(tool.id)}
                        onRestore={() => void onRestore(tool.id)}
                      />
                    );
                  }}
                </SortableGrid>
              )}
            </section>
          )}

          {page === 'unused' && (
            <section className="category">
              {pageEntries.length === 0 ? (
                <p className="muted">
                  Nothing hidden. Hover an app and click × to move it here.
                </p>
              ) : (
                <SortableGrid
                  className="tool-grid"
                  ids={pageEntryIds}
                  onReorder={(ids) => void onReorder(ids)}
                >
                  {(id, bind) => {
                    const entry = entryById.get(id);
                    if (!entry) return null;
                    if (entry.kind === 'rec') {
                      return (
                        <RecommendationCard
                          item={entry.item}
                          mode="unused"
                          sortable={bind}
                          onDownload={() => void onDownload(entry.item.id)}
                          onHide={() => void onHide(entry.item.id)}
                          onRestore={() => void onRestore(entry.item.id)}
                        />
                      );
                    }
                    const tool = entry.tool;
                    return (
                      <ToolCard
                        tool={tool}
                        mode="unused"
                        busy={false}
                        streamerMode={streamerMode}
                        sortable={bind}
                        onLaunch={() => undefined}
                        onPick={() => undefined}
                        onClear={() => undefined}
                        onDownload={() => undefined}
                        onDismiss={() => undefined}
                        onHide={() => undefined}
                        onRestore={() => void onRestore(tool.id)}
                        onRemoveCustom={
                          tool.isCustom
                            ? () => void onRemoveCustom(tool.id)
                            : undefined
                        }
                      />
                    );
                  }}
                </SortableGrid>
              )}
            </section>
          )}
        </main>

        {(page === 'poe1' || page === 'poe2') && (
          <CurrencyExchange
            data={page === 'poe2' ? currencyPoe2 : currencyPoe1}
            loading={currencyLoading}
            onOpen={(url) => {
              void api.openExternal(url);
            }}
          />
        )}

        {addOpen && (
          <div className="settings-layer" role="presentation">
            <button
              type="button"
              className="settings-backdrop"
              aria-label="Close add dialog"
              onClick={() => setAddOpen(false)}
            />
            <div
              className="settings-sheet add-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-title"
            >
              <div className="settings-sheet-handle" aria-hidden />
              <div className="settings-sheet-head">
                <h2 id="add-title" className="settings-sheet-title">
                  {addStep === 'link' ? 'Add website' : 'Add to this tab'}
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAddOpen(false)}
                >
                  Close
                </button>
              </div>

              {addStep === 'choose' ? (
                <>
                  <p className="settings-sheet-copy">
                    Add a local application, or a website shortcut that opens in
                    your browser (guides, spreadsheets, trade sites, and so on).
                  </p>
                  <div className="settings-sheet-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void onAddApplication()}
                    >
                      Application
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent"
                      onClick={() => setAddStep('link')}
                    >
                      Website
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="settings-sheet-copy">
                    Paste any http(s) link. Example: a Google Sheet league starter
                    compendium.
                  </p>
                  <div className="settings-field">
                    <label className="settings-field-label" htmlFor="link-name">
                      Name
                    </label>
                    <input
                      id="link-name"
                      className="settings-input"
                      type="text"
                      value={linkName}
                      placeholder="3.29 Leaguestarter Compendium"
                      onChange={(event) => setLinkName(event.target.value)}
                    />
                  </div>
                  <div className="settings-field">
                    <label className="settings-field-label" htmlFor="link-url">
                      URL
                    </label>
                    <input
                      id="link-url"
                      className="settings-input"
                      type="url"
                      value={linkUrl}
                      placeholder="https://…"
                      onChange={(event) => setLinkUrl(event.target.value)}
                    />
                  </div>
                  <div className="settings-sheet-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setAddStep('choose')}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void onAddWebsiteLink()}
                    >
                      Add website
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className="settings-layer" role="presentation">
            <button
              type="button"
              className="settings-backdrop"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            />
            <div
              className="settings-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              <div className="settings-sheet-handle" aria-hidden />
              <div className="settings-sheet-head">
                <h2 id="settings-title" className="settings-sheet-title">
                  Settings
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="settings-sheet-copy">
                Custom paths, custom apps, and hidden (“Not in use”) items are
                saved on this PC and kept after you close the app including
                the portable build. Deleting the .exe does not remove that data.
              </p>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="streamer-mode">
                  Streamer mode
                </label>
                <p className="settings-field-hint">
                  Hides install paths, website URLs, and the settings file
                  location so they do not show on stream. Tooltips with full
                  paths are disabled too.
                </p>
                <label className="settings-check" htmlFor="streamer-mode">
                  <input
                    id="streamer-mode"
                    type="checkbox"
                    checked={streamerMode}
                    onChange={(event) => {
                      void onStreamerModeChange(event.target.checked);
                    }}
                  />
                  <span>Hide paths and personal details</span>
                </label>
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="info-layout">
                  League & news layout
                </label>
                <p className="settings-field-hint">
                  Compact puts countdown and announcements in a side-by-side
                  strip. Normal stacks the fuller versions above your apps.
                </p>
                <select
                  id="info-layout"
                  className="settings-select"
                  value={infoLayout}
                  onChange={(event) => {
                    void onInfoLayoutChange(
                      event.target.value === 'normal' ? 'normal' : 'compact',
                    );
                  }}
                >
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="preview-league-launch">
                  Preview league LOGIN banner
                </label>
                <p className="settings-field-hint">
                  Force the launch funnel stage now so you can test the LOGIN!
                  banner before the league goes live on poe.ninja.
                </p>
                <label className="settings-check" htmlFor="preview-league-launch">
                  <input
                    id="preview-league-launch"
                    type="checkbox"
                    checked={previewLeagueLaunch}
                    onChange={(event) => {
                      void onPreviewLeagueLaunchChange(event.target.checked);
                    }}
                  />
                  <span>Show LOGIN! launch banner (test mode)</span>
                </label>
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="currency-league-poe1">
                  PoE1 poe.ninja exchange league
                </label>
                <p className="settings-field-hint">
                  Active leagues are pulled from poe.ninja, so a new challenge
                  league appears here when they start indexing it.
                </p>
                <select
                  id="currency-league-poe1"
                  className="settings-select"
                  value={currencyLeaguePoe1}
                  disabled={currencyLeaguesPoe1.length === 0}
                  onChange={(event) => {
                    void onCurrencyLeagueChange('poe1', event.target.value);
                  }}
                >
                  {currencyLeaguesPoe1.length === 0 ? (
                    <option value={currencyLeaguePoe1}>
                      {currencyLeaguesLoading
                        ? 'Loading leagues…'
                        : currencyLeaguePoe1}
                    </option>
                  ) : (
                    currencyLeaguesPoe1.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="currency-league-poe2">
                  PoE2 poe.ninja exchange league
                </label>
                <p className="settings-field-hint">
                  Same idea for Path of Exile 2 economy leagues on poe.ninja.
                </p>
                <select
                  id="currency-league-poe2"
                  className="settings-select"
                  value={currencyLeaguePoe2}
                  disabled={currencyLeaguesPoe2.length === 0}
                  onChange={(event) => {
                    void onCurrencyLeagueChange('poe2', event.target.value);
                  }}
                >
                  {currencyLeaguesPoe2.length === 0 ? (
                    <option value={currencyLeaguePoe2}>
                      {currencyLeaguesLoading
                        ? 'Loading leagues…'
                        : currencyLeaguePoe2}
                    </option>
                  ) : (
                    currencyLeaguesPoe2.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="settings-field">
                <p className="settings-field-label">Exchange rates to show</p>
                <p className="settings-field-hint">
                  Pick one or more pairs. Chaos → Divine shows the classic
                  1 Divine = N Chaos rate; Mirror and Hinekora show value in
                  Divines.
                </p>
                <div className="settings-check-list">
                  {(currencyPairs.length > 0
                    ? currencyPairs
                    : [
                        { id: 'chaos-divine', label: 'Chaos → Divine' },
                        { id: 'mirror-divine', label: 'Mirror → Divine' },
                        {
                          id: 'hinekoras-lock-divine',
                          label: "Hinekora's Lock → Divine",
                        },
                      ]
                  ).map((pair) => (
                    <label
                      key={pair.id}
                      className="settings-check"
                      htmlFor={`currency-pair-${pair.id}`}
                    >
                      <input
                        id={`currency-pair-${pair.id}`}
                        type="checkbox"
                        checked={currencyPairIds.includes(pair.id)}
                        onChange={(event) => {
                          void onCurrencyPairToggle(
                            pair.id,
                            event.target.checked,
                          );
                        }}
                      />
                      <span>{pair.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {storageInfo && (
                <div className="settings-storage">
                  <p className="settings-storage-label">Saved settings file</p>
                  <code
                    className="settings-storage-path"
                    title={
                      streamerMode ? undefined : storageInfo.configPath
                    }
                  >
                    {streamerMode
                      ? obscureSensitive(storageInfo.configPath, 'path')
                      : storageInfo.configPath}
                  </code>
                </div>
              )}
              <div className="settings-sheet-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void onResetDismissed()}
                >
                  Reset dismissed downloads
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={streamerMode}
                  title={
                    streamerMode
                      ? 'Disabled in streamer mode (opens a folder with your username)'
                      : undefined
                  }
                  onClick={() => {
                    void api.openStorageFolder().then((result) => {
                      if (!result.ok) showToast(result.error || 'Could not open folder');
                    });
                  }}
                >
                  Open data folder
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
