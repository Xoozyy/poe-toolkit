import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnnouncementsResult,
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
import { AnnouncementsFeed } from './components/AnnouncementsFeed';
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
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [announcements, setAnnouncements] =
    useState<AnnouncementsResult | null>(null);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, recommendations, leagueInfo, toolOrders] = await Promise.all([
        api.listTools(),
        api.listRecommendations(),
        api.getLeague(),
        api.getToolOrders(),
      ]);
      setTools(list);
      setRecs(recommendations);
      setLeague(leagueInfo);
      setOrders(toolOrders);
      void refreshAnnouncements();
    } catch (err) {
      showToast(String(err));
    } finally {
      setLoading(false);
    }
  }, [api, showToast, refreshAnnouncements]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      void refreshAnnouncements();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [api, refreshAnnouncements]);

  useEffect(() => {
    if (!api || !settingsOpen) return;
    void api.getStorageInfo().then(setStorageInfo).catch(() => setStorageInfo(null));
  }, [api, settingsOpen]);

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
    const category = page as ToolCategory;
    const result = await api.addCustom({ category });
    if (result.canceled) return;
    applyBundle(result);
    if (result.error) showToast(result.error);
    else if (result.ok) showToast('Custom app added');
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
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => void onRescan()}
            disabled={loading || !isLaunchPage}
          >
            Rescan
          </button>
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
          {canAddApp && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onAddApp()}
            >
              Add app
            </button>
          )}
        </header>

        <main className="workspace">
          {isLaunchPage && (
            <>
              {page === 'poe1' && (
                <LeagueCountdown
                  league={league}
                  onOpenWidget={() => {
                    void api.openLeagueWidget();
                  }}
                />
              )}
              {page === 'poe1' && (
                <AnnouncementsFeed
                  feed={announcements}
                  loading={announcementsLoading}
                  onRefresh={() => void refreshAnnouncements()}
                  onOpen={(item) => {
                    void (async () => {
                      await api.markAnnouncementRead(item.id);
                      void api.openExternal(item.url);
                      void refreshAnnouncements();
                    })();
                  }}
                />
              )}
              {loading && pageEntries.length === 0 ? (
                <p className="muted">Scanning for installations…</p>
              ) : pageEntries.length === 0 ? (
                <p className="muted">No apps on this tab. Use Add app to include one.</p>
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
              {storageInfo && (
                <div className="settings-storage">
                  <p className="settings-storage-label">Saved settings file</p>
                  <code className="settings-storage-path" title={storageInfo.configPath}>
                    {storageInfo.configPath}
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
