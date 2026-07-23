import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnnouncementsResult,
  CurrencyExchangeRate,
  LeagueInfo,
  Recommendation,
  StorageInfo,
  ToolCategory,
  ToolStatus,
} from './types';
import { ToolCard } from './components/ToolCard';
import { RecommendationCard } from './components/RecommendationCard';
import { LeagueCountdown } from './components/LeagueCountdown';
import { AnnouncementsFeed } from './components/AnnouncementsFeed';
import { CurrencyExchange } from './components/CurrencyExchange';
import './App.css';

type Page = 'poe1' | 'poe2' | 'optional' | 'unused';

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
    lede: 'Not launched from here by default - summaries, downloads, or your own apps.',
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

export default function App() {
  const api = window.poeToolkit;
  const [page, setPage] = useState<Page>('poe1');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [announcements, setAnnouncements] =
    useState<AnnouncementsResult | null>(null);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [currency, setCurrency] = useState<CurrencyExchangeRate | null>(null);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

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
      setCurrency(await api.getCurrencyExchange());
    } catch (err) {
      setCurrency({
        ok: false,
        league: 'Standard',
        chaosPerDivine: null,
        error: String(err),
      });
    } finally {
      setCurrencyLoading(false);
    }
  }, [api]);

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, recommendations, leagueInfo] = await Promise.all([
        api.listTools(),
        api.listRecommendations(),
        api.getLeague(),
      ]);
      setTools(list);
      setRecs(recommendations);
      setLeague(leagueInfo);
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
    }, 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [api, refreshAnnouncements, refreshCurrency]);

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

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">PoE</span>
          <div>
            <div className="brand">Toolkit</div>
            <div className="brand-sub">Launcher</div>
          </div>
        </div>

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
              {page === 'poe1' && <LeagueCountdown league={league} />}
              {page === 'poe1' && (
                <AnnouncementsFeed
                  feed={announcements}
                  loading={announcementsLoading}
                  onRefresh={() => void refreshAnnouncements()}
                  onOpen={(url) => {
                    void api.openExternal(url);
                  }}
                />
              )}
              {page === 'poe1' && (
                <CurrencyExchange
                  data={currency}
                  loading={currencyLoading}
                  onRefresh={() => void refreshCurrency()}
                />
              )}
              {loading && pageTools.length === 0 ? (
                <p className="muted">Scanning for installations…</p>
              ) : pageTools.length === 0 ? (
                <p className="muted">No apps on this tab. Use Add app to include one.</p>
              ) : (
                <section className="category">
                  <div className="tool-grid">
                    {pageTools.map((tool) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        busy={busyId === tool.id}
                        onLaunch={() => void onLaunch(tool.id)}
                        onPick={() => void onPick(tool.id)}
                        onClear={() => void onClear(tool.id)}
                        onDownload={() => void onDownload(tool.id)}
                        onDismiss={() => void onDismiss(tool.id)}
                        onHide={() => void onHide(tool.id)}
                        onRestore={() => void onRestore(tool.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {page === 'optional' && (
            <section className="category">
              {pageRecs.length === 0 && pageTools.length === 0 ? (
                <p className="muted">Nothing here yet. Add an app or restore from Not in use.</p>
              ) : (
                <div className="tool-grid">
                  {pageRecs.map((item) => (
                    <RecommendationCard
                      key={item.id}
                      item={item}
                      onDownload={() => void onDownload(item.id)}
                      onHide={() => void onHide(item.id)}
                      onRestore={() => void onRestore(item.id)}
                    />
                  ))}
                  {pageTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      busy={busyId === tool.id}
                      onLaunch={() => void onLaunch(tool.id)}
                      onPick={() => void onPick(tool.id)}
                      onClear={() => void onClear(tool.id)}
                      onDownload={() => void onDownload(tool.id)}
                      onDismiss={() => void onDismiss(tool.id)}
                      onHide={() => void onHide(tool.id)}
                      onRestore={() => void onRestore(tool.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {page === 'unused' && (
            <section className="category">
              {pageTools.length === 0 && pageRecs.length === 0 ? (
                <p className="muted">
                  Nothing hidden. Hover an app and click × to move it here.
                </p>
              ) : (
                <div className="tool-grid">
                  {pageRecs.map((item) => (
                    <RecommendationCard
                      key={item.id}
                      item={item}
                      mode="unused"
                      onDownload={() => void onDownload(item.id)}
                      onHide={() => void onHide(item.id)}
                      onRestore={() => void onRestore(item.id)}
                    />
                  ))}
                  {pageTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      mode="unused"
                      busy={false}
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
                  ))}
                </div>
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
                saved on this PC and kept after you close the app - including
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
