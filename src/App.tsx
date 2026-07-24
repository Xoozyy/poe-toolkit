import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  AnnouncementsResult,
  CurrencyExchangeRate,
  CurrencyLeagueOffer,
  CurrencyPairOption,
  EconomyLeague,
  InfoLayout,
  LayoutPage,
  LeagueInfo,
  OrderPage,
  PageLayout,
  PageLayouts,
  QueueReminderOffer,
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
import { OnboardingTour, type TourStep } from './components/OnboardingTour';
import './App.css';

type Page = OrderPage;

const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav',
    target: 'nav',
    title: 'Your launch tabs',
    body: 'Jump between Path of Exile, Path of Exile 2, Optional tools, and anything you’ve hidden in Not in use.',
  },
  {
    id: 'apps',
    target: 'apps',
    title: 'Launch and customize',
    body: 'Click Launch to start an app. Right-click a card to set paths, edit custom apps, or move them between sections.',
  },
  {
    id: 'sections',
    target: 'sections',
    title: 'Organize with sections',
    body: 'Right-click empty space to add a section. Drag cards to reorder, or use the snap line to drop them where you want.',
  },
  {
    id: 'tray',
    target: 'tray',
    title: 'Close goes to the tray',
    body: 'The X hides PoE Toolkit in the system tray by default. Click the tray icon to bring it back, or Quit from the tray menu.',
  },
];

const EMPTY_ORDERS: ToolOrders = {
  poe1: [],
  poe2: [],
  optional: [],
  unused: [],
};

const EMPTY_LAYOUTS: PageLayouts = {
  poe1: { sections: [{ id: 'sec_poe1_apps', name: 'Apps', toolIds: [] }] },
  poe2: { sections: [{ id: 'sec_poe2_apps', name: 'Apps', toolIds: [] }] },
  optional: {
    sections: [{ id: 'sec_optional_apps', name: 'Apps', toolIds: [] }],
  },
};

function isLayoutPage(page: Page): page is LayoutPage {
  return page === 'poe1' || page === 'poe2' || page === 'optional';
}

function newSectionId(page: LayoutPage) {
  return `sec_${page}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cloneLayout(layout: PageLayout): PageLayout {
  return {
    sections: layout.sections.map((section) => ({
      ...section,
      toolIds: [...section.toolIds],
    })),
  };
}

function ensureLayoutHasItems(layout: PageLayout, itemIds: string[]): PageLayout {
  const allowed = new Set(itemIds);
  const seen = new Set<string>();
  const sections = layout.sections.map((section) => ({
    ...section,
    toolIds: section.toolIds.filter((id) => {
      if (!allowed.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
  if (sections.length === 0) {
    sections.push({ id: 'sec_apps', name: 'Apps', toolIds: [] });
  }
  const missing = itemIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    sections[0] = {
      ...sections[0],
      toolIds: [...sections[0].toolIds, ...missing],
    };
  }
  return { sections };
}

function layoutEquals(a: PageLayout, b: PageLayout): boolean {
  if (a.sections.length !== b.sections.length) return false;
  return a.sections.every((section, index) => {
    const other = b.sections[index];
    return (
      section.id === other.id &&
      section.name === other.name &&
      section.toolIds.length === other.toolIds.length &&
      section.toolIds.every((id, i) => id === other.toolIds[i])
    );
  });
}

function reorderSectionIds(
  layout: PageLayout,
  sectionId: string,
  ids: string[],
): PageLayout {
  const next = cloneLayout(layout);
  const section = next.sections.find((s) => s.id === sectionId);
  if (!section) return layout;
  section.toolIds = ids;
  return next;
}

function moveBetweenSections(
  layout: PageLayout,
  fromSectionId: string,
  toSectionId: string,
  itemId: string,
  beforeId: string | null,
): PageLayout {
  const next = cloneLayout(layout);
  for (const section of next.sections) {
    section.toolIds = section.toolIds.filter((id) => id !== itemId);
  }
  const to = next.sections.find((s) => s.id === toSectionId);
  if (!to) return layout;
  const idx = beforeId ? to.toolIds.indexOf(beforeId) : -1;
  if (idx >= 0) to.toolIds.splice(idx, 0, itemId);
  else to.toolIds.push(itemId);
  void fromSectionId;
  return next;
}

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
  const [leagueOffer, setLeagueOffer] = useState<CurrencyLeagueOffer | null>(
    null,
  );
  const [queueReminder, setQueueReminder] =
    useState<QueueReminderOffer | null>(null);
  const [queueReminderEnabled, setQueueReminderEnabled] = useState(true);
  const [queueReminderMinutes, setQueueReminderMinutes] = useState(90);
  const [infoLayout, setInfoLayout] = useState<InfoLayout>('compact');
  const [previewLeagueLaunch, setPreviewLeagueLaunch] = useState(false);
  const [streamerMode, setStreamerMode] = useState(false);
  const [closeToTray, setCloseToTray] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<'choose' | 'link'>('choose');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [editToolId, setEditToolId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBlurb, setEditBlurb] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editDownloadUrl, setEditDownloadUrl] = useState('');
  const [editCategory, setEditCategory] = useState<ToolCategory>('poe1');
  const [editPath, setEditPath] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [orders, setOrders] = useState<ToolOrders>(EMPTY_ORDERS);
  const [pageLayouts, setPageLayouts] = useState<PageLayouts>(EMPTY_LAYOUTS);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionsMenuPos, setSectionsMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const sectionsMenuRef = useRef<HTMLDivElement | null>(null);

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

  const checkCurrencyLeagueOffers = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.getCurrencyLeagueOffers();
      const next = result?.offers?.[0] ?? null;
      if (!next) return;
      setLeagueOffer((prev) => {
        if (prev?.preview) return prev;
        if (
          prev &&
          prev.game === next.game &&
          prev.suggested.id === next.suggested.id
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      /* ignore offer check failures */
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
        setLeagueOffer((prev) =>
          prev && prev.game === game && prev.suggested.id === leagueId
            ? null
            : prev,
        );
      } catch (err) {
        showToast(String(err));
      } finally {
        setCurrencyLoading(false);
      }
    },
    [api, refreshCurrency, refreshCurrencyLeagues, showToast],
  );

  const onAcceptLeagueOffer = useCallback(async () => {
    if (!leagueOffer) return;
    if (leagueOffer.preview) {
      setLeagueOffer(null);
      showToast('Preview only — no league change');
      return;
    }
    const { game, suggested } = leagueOffer;
    setLeagueOffer(null);
    await onCurrencyLeagueChange(game, suggested.id);
    showToast(`Switched to ${suggested.name}`);
  }, [leagueOffer, onCurrencyLeagueChange, showToast]);

  const onDismissLeagueOffer = useCallback(async () => {
    if (!leagueOffer) return;
    const { game, suggested, preview } = leagueOffer;
    setLeagueOffer(null);
    if (preview || !api) return;
    try {
      await api.dismissCurrencyLeagueOffer(game, suggested.id);
    } catch {
      /* ignore */
    }
  }, [api, leagueOffer]);

  const onPreviewLeagueOffer = useCallback(() => {
    const game = page === 'poe2' ? 'poe2' : 'poe1';
    const currentLeague =
      game === 'poe2' ? currencyLeaguePoe2 : currencyLeaguePoe1;
    const currentName = currentLeague;
    const suggestedName =
      (game === 'poe2' ? leaguePoe2?.nextName : leaguePoe1?.nextName) ||
      'New Challenge League';
    setLeagueOffer({
      game,
      currentLeague,
      currentName,
      suggested: {
        id: `__preview__:${suggestedName}`,
        name: `${suggestedName} (preview)`,
      },
      preview: true,
    });
    setSettingsOpen(false);
  }, [
    page,
    currencyLeaguePoe1,
    currencyLeaguePoe2,
    leaguePoe1?.nextName,
    leaguePoe2?.nextName,
  ]);

  const onPreviewQueueReminder = useCallback(() => {
    const game = page === 'poe2' ? 'poe2' : 'poe1';
    const league = game === 'poe2' ? leaguePoe2 : leaguePoe1;
    setQueueReminder({
      game,
      leagueName: league?.nextName || 'Next league',
      startMs: league?.startMs ?? Date.now() + queueReminderMinutes * 60_000,
      minutesBefore: queueReminderMinutes,
      preview: true,
    });
    setSettingsOpen(false);
  }, [page, leaguePoe1, leaguePoe2, queueReminderMinutes]);

  const onDismissQueueReminder = useCallback(async () => {
    if (!queueReminder) return;
    const { game, startMs, preview } = queueReminder;
    setQueueReminder(null);
    if (preview || !api) return;
    try {
      await api.dismissQueueReminder(game, `${game}:${startMs}`);
    } catch {
      /* ignore */
    }
  }, [api, queueReminder]);

  const onLaunchFromQueueReminder = useCallback(async () => {
    if (!queueReminder || !api) return;
    const game = queueReminder.game;
    const preview = queueReminder.preview;
    const startMs = queueReminder.startMs;
    setQueueReminder(null);
    if (!preview) {
      try {
        await api.dismissQueueReminder(game, `${game}:${startMs}`);
      } catch {
        /* ignore */
      }
    }
    if (preview) {
      showToast('Preview only — launch skipped');
      return;
    }
    setBusyId(game);
    try {
      const result = await api.launch(game);
      if (!result.ok) showToast(result.error || 'Launch failed');
    } catch (err) {
      showToast(String(err));
    } finally {
      setBusyId(null);
    }
  }, [api, queueReminder, showToast]);

  const onQueueReminderSettingsChange = useCallback(
    async (next: { enabled?: boolean; minutes?: number }) => {
      if (!api) return;
      if (next.enabled != null) setQueueReminderEnabled(next.enabled);
      if (next.minutes != null) setQueueReminderMinutes(next.minutes);
      try {
        const result = await api.setQueueReminder(next);
        setQueueReminderEnabled(Boolean(result.enabled));
        setQueueReminderMinutes(result.minutes);
      } catch (err) {
        showToast(String(err));
      }
    },
    [api, showToast],
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

  const onCloseToTrayChange = useCallback(
    async (enabled: boolean) => {
      if (!api) return;
      setCloseToTray(enabled);
      try {
        const result = await api.setCloseToTray(enabled);
        setCloseToTray(Boolean(result?.closeToTray));
      } catch (err) {
        showToast(String(err));
        setCloseToTray(!enabled);
      }
    },
    [api, showToast],
  );

  const finishTour = useCallback(async () => {
    setTourOpen(false);
    if (!api) return;
    try {
      await api.setOnboardingDone(true);
    } catch (err) {
      showToast(String(err));
    }
  }, [api, showToast]);

  const replayTour = useCallback(async () => {
    setSettingsOpen(false);
    if (page !== 'poe1') setPage('poe1');
    setTourOpen(true);
    if (!api) return;
    try {
      await api.setOnboardingDone(false);
    } catch {
      // still show the tour locally
    }
  }, [api, page]);

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
        layouts,
        layout,
        preview,
        streamer,
        queueSettings,
        trayClose,
        onboardingDone,
      ] = await Promise.all([
        api.listTools(),
        api.listRecommendations(),
        api.getLeague('poe1'),
        api.getLeague('poe2'),
        api.getToolOrders(),
        api.getPageLayouts(),
        api.getInfoLayout(),
        api.getPreviewLeagueLaunch(),
        api.getStreamerMode(),
        api.getQueueReminder(),
        api.getCloseToTray(),
        api.getOnboardingDone(),
      ]);
      setTools(list);
      setRecs(recommendations);
      setLeaguePoe1(league1);
      setLeaguePoe2(league2);
      setOrders(toolOrders);
      setPageLayouts(layouts || EMPTY_LAYOUTS);
      setInfoLayout(layout === 'normal' ? 'normal' : 'compact');
      setPreviewLeagueLaunch(Boolean(preview));
      setStreamerMode(Boolean(streamer));
      setCloseToTray(trayClose == null ? true : Boolean(trayClose));
      setQueueReminderEnabled(
        queueSettings?.enabled == null ? true : Boolean(queueSettings.enabled),
      );
      setQueueReminderMinutes(queueSettings?.minutes ?? 90);
      if (!onboardingDone) setTourOpen(true);
      void refreshAnnouncements();
      void refreshCurrency();
      void checkCurrencyLeagueOffers();
    } catch (err) {
      showToast(String(err));
    } finally {
      setLoading(false);
    }
  }, [api, showToast, refreshAnnouncements, refreshCurrency, checkCurrencyLeagueOffers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => {
      void refreshAnnouncements();
      void refreshCurrency();
      void refreshLeague();
      void checkCurrencyLeagueOffers();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [api, refreshAnnouncements, refreshCurrency, refreshLeague, checkCurrencyLeagueOffers]);

  // Closer poll near launch so poe.ninja detection / schedule flip feels snappy
  useEffect(() => {
    if (!api) return;
    const nearLaunch = [leaguePoe1, leaguePoe2].some((info) => {
      if (!info) return false;
      if (info.stage === 'login') return true;
      if (!info.startMs) return false;
      return info.startMs - Date.now() <= 6 * 60 * 60 * 1000;
    });
    if (!nearLaunch) return;
    const id = window.setInterval(() => {
      void refreshLeague();
      void refreshCurrency();
      void checkCurrencyLeagueOffers();
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, [
    api,
    leaguePoe1,
    leaguePoe2,
    refreshLeague,
    refreshCurrency,
    checkCurrencyLeagueOffers,
  ]);

  // Countdown widget is only useful pre-launch (PoE1)
  useEffect(() => {
    if (!api || leaguePoe1?.stage !== 'login') return;
    void api.closeLeagueWidget();
  }, [api, leaguePoe1?.stage]);

  // Queue-may-be-open reminder in the pre-launch window
  useEffect(() => {
    if (!api || !queueReminderEnabled) return;

    let cancelled = false;
    const notifiedKeys = new Set<string>();

    const check = async () => {
      if (cancelled || leagueOffer || queueReminder?.preview) return;
      const now = Date.now();
      const windowMs = queueReminderMinutes * 60_000;
      const candidates: Array<{
        game: 'poe1' | 'poe2';
        info: LeagueInfo | null;
      }> = [
        { game: 'poe1', info: leaguePoe1 },
        { game: 'poe2', info: leaguePoe2 },
      ];

      for (const { game, info } of candidates) {
        if (!info?.startMs || info.stage !== 'countdown') continue;
        const startMs = info.startMs;
        const msLeft = startMs - now;
        if (msLeft <= 0 || msLeft > windowMs) continue;
        const key = `${game}:${startMs}`;
        try {
          const dismissed = await api.getQueueReminderDismissed(game);
          if (dismissed?.key === key) continue;
        } catch {
          continue;
        }
        if (cancelled) return;
        setQueueReminder((prev) => {
          if (prev?.preview) return prev;
          if (prev && prev.game === game && prev.startMs === startMs) {
            return prev;
          }
          return {
            game,
            leagueName: info.nextName,
            startMs,
            minutesBefore: queueReminderMinutes,
          };
        });
        if (!notifiedKeys.has(key)) {
          notifiedKeys.add(key);
          void api.showNotification({
            title: 'Queue may be open',
            body: `${info.nextName} often opens character create about now.`,
          });
        }
        return;
      }
    };

    void check();
    const id = window.setInterval(() => {
      void check();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    api,
    queueReminderEnabled,
    queueReminderMinutes,
    leaguePoe1,
    leaguePoe2,
    leagueOffer,
    queueReminder?.preview,
  ]);

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

  const activeLayout = useMemo(() => {
    if (!isLayoutPage(page)) return null;
    return ensureLayoutHasItems(pageLayouts[page], pageEntryIds);
  }, [page, pageLayouts, pageEntryIds]);

  useEffect(() => {
    if (!api || !isLayoutPage(page)) return;
    const itemKey = pageEntryIds.join('\0');
    void itemKey;
    setPageLayouts((prev) => {
      const ensured = ensureLayoutHasItems(prev[page], pageEntryIds);
      if (layoutEquals(prev[page], ensured)) return prev;
      setOrders((ordersPrev) => ({
        ...ordersPrev,
        [page]: ensured.sections.flatMap((s) => s.toolIds),
      }));
      void api.setPageLayout(page, ensured).then((result) => {
        if (result?.pageLayouts) setPageLayouts(result.pageLayouts);
        if (result?.toolOrders) setOrders(result.toolOrders);
      });
      return { ...prev, [page]: ensured };
    });
  }, [api, page, pageEntryIds]);

  useEffect(() => {
    setEditingSectionId(null);
    setSectionsMenuPos(null);
  }, [page]);

  useEffect(() => {
    if (!sectionsMenuPos) return;
    const close = () => setSectionsMenuPos(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: MouseEvent) => {
      if (sectionsMenuRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [sectionsMenuPos]);

  function openSectionsMenu(event: ReactMouseEvent) {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '.tool-card, .rec-card, .card-context-menu, .app-section-actions, input, textarea, select',
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const pad = 8;
    const approxW = 160;
    const approxH = 48;
    const x = Math.min(event.clientX, window.innerWidth - approxW - pad);
    const y = Math.min(event.clientY, window.innerHeight - approxH - pad);
    setSectionsMenuPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }

  async function persistLayout(nextPage: LayoutPage, layout: PageLayout) {
    if (!api) return;
    const normalized = ensureLayoutHasItems(
      layout,
      nextPage === page
        ? pageEntryIds
        : layout.sections.flatMap((s) => s.toolIds),
    );
    setPageLayouts((prev) => ({ ...prev, [nextPage]: normalized }));
    setOrders((prev) => ({
      ...prev,
      [nextPage]: normalized.sections.flatMap((s) => s.toolIds),
    }));
    try {
      const result = await api.setPageLayout(nextPage, normalized);
      if (result?.pageLayouts) setPageLayouts(result.pageLayouts);
      if (result?.toolOrders) setOrders(result.toolOrders);
    } catch (err) {
      showToast(String(err));
    }
  }

  async function onReorder(ids: string[]) {
    if (!api) return;
    if (isLayoutPage(page) && activeLayout && activeLayout.sections.length === 1) {
      await persistLayout(page, reorderSectionIds(activeLayout, activeLayout.sections[0].id, ids));
      return;
    }
    setOrders((prev) => ({ ...prev, [page]: ids }));
    try {
      setOrders(await api.setToolOrder(page, ids));
    } catch (err) {
      showToast(String(err));
    }
  }

  async function onSectionReorder(sectionId: string, ids: string[]) {
    if (!isLayoutPage(page) || !activeLayout) return;
    await persistLayout(page, reorderSectionIds(activeLayout, sectionId, ids));
  }

  async function onSectionMove(
    fromSectionId: string,
    toSectionId: string,
    itemId: string,
    beforeId: string | null,
  ) {
    if (!isLayoutPage(page) || !activeLayout) return;
    await persistLayout(
      page,
      moveBetweenSections(
        activeLayout,
        fromSectionId,
        toSectionId,
        itemId,
        beforeId,
      ),
    );
  }

  async function onAddSection() {
    if (!isLayoutPage(page) || !activeLayout) return;
    const next = cloneLayout(activeLayout);
    next.sections.push({
      id: newSectionId(page),
      name: 'New section',
      toolIds: [],
    });
    await persistLayout(page, next);
  }

  async function onRenameSection(sectionId: string, name: string) {
    if (!isLayoutPage(page) || !activeLayout) return;
    const next = cloneLayout(activeLayout);
    const section = next.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.name = name.trim() || 'Apps';
    setEditingSectionId(null);
    await persistLayout(page, next);
  }

  async function onDeleteSection(sectionId: string) {
    if (!isLayoutPage(page) || !activeLayout) return;
    if (activeLayout.sections.length <= 1) return;
    const next = cloneLayout(activeLayout);
    const index = next.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) return;
    const [removed] = next.sections.splice(index, 1);
    const targetIndex = Math.max(0, index - 1);
    next.sections[targetIndex].toolIds = [
      ...next.sections[targetIndex].toolIds,
      ...removed.toolIds,
    ];
    await persistLayout(page, next);
  }

  async function onMoveSection(sectionId: string, direction: -1 | 1) {
    if (!isLayoutPage(page) || !activeLayout) return;
    const next = cloneLayout(activeLayout);
    const index = next.sections.findIndex((s) => s.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.sections.length) return;
    const [section] = next.sections.splice(index, 1);
    next.sections.splice(target, 0, section);
    await persistLayout(page, next);
  }

  async function onMoveToolToSection(itemId: string, sectionId: string) {
    if (!isLayoutPage(page) || !activeLayout) return;
    const from = activeLayout.sections.find((s) => s.toolIds.includes(itemId));
    if (!from || from.id === sectionId) return;
    await onSectionMove(from.id, sectionId, itemId, null);
  }

  const readyCount = tools.filter((t) => t.ready && !t.unused).length;
  const visibleToolCount = tools.filter((t) => !t.unused).length;
  const isLaunchPage = page === 'poe1' || page === 'poe2';
  const canAddApp = page === 'poe1' || page === 'poe2' || page === 'optional';
  const copy = PAGE_COPY[page];
  const isDev = Boolean(api?.isDev);

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
    const tool = tools.find((t) => t.id === id);
    const label = tool?.name || 'this custom item';
    const ok = window.confirm(`Delete “${label}” permanently? This cannot be undone.`);
    if (!ok) return;
    if (editToolId === id) closeEditCustom();
    applyBundle(await api.removeCustom(id));
    showToast('Custom app removed');
  }

  function onEditCustom(tool: ToolStatus) {
    if (!tool.isCustom) return;
    setEditToolId(tool.id);
    setEditName(tool.name);
    setEditBlurb(tool.blurb);
    setEditUrl(tool.isLink ? tool.openUrl || tool.resolvedPath || '' : '');
    setEditDownloadUrl(tool.downloadUrl || '');
    setEditCategory(tool.category);
    setEditPath(tool.isLink ? '' : tool.resolvedPath || tool.customPath || '');
    setEditBusy(false);
  }

  function closeEditCustom() {
    setEditToolId(null);
    setEditBusy(false);
  }

  const editingTool = useMemo(
    () => (editToolId ? tools.find((t) => t.id === editToolId) : null),
    [editToolId, tools],
  );

  async function onSaveCustomEdit() {
    if (!api || !editToolId || !editingTool) return;
    const name = editName.trim();
    if (!name) {
      showToast('Name is required');
      return;
    }

    setEditBusy(true);
    try {
      const patch: {
        name: string;
        blurb: string;
        category: ToolCategory;
        kind: 'app' | 'link';
        url?: string;
        downloadUrl?: string | null;
      } = {
        name,
        blurb: editBlurb.trim() || editingTool.blurb,
        category: editCategory,
        kind: editingTool.isLink ? 'link' : 'app',
      };

      if (editingTool.isLink) {
        const url = editUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          showToast('Enter a valid http(s) URL');
          setEditBusy(false);
          return;
        }
        patch.url = url;
      } else {
        const download = editDownloadUrl.trim();
        patch.downloadUrl = download
          ? /^https?:\/\//i.test(download)
            ? download
            : null
          : null;
        if (download && !patch.downloadUrl) {
          showToast('Download URL must be http(s)');
          setEditBusy(false);
          return;
        }
      }

      const result = await api.updateCustom(editToolId, patch);
      applyBundle(result);
      if (result.pageLayouts) setPageLayouts(result.pageLayouts);
      if (result.toolOrders) setOrders(result.toolOrders);
      if (result.error) {
        showToast(result.error);
        return;
      }
      if (result.ok) {
        closeEditCustom();
        showToast('Custom app updated');
        if (editCategory !== page && isLayoutPage(editCategory)) {
          setPage(editCategory);
        }
      }
    } catch (err) {
      showToast(String(err));
    } finally {
      setEditBusy(false);
    }
  }

  async function onEditPickExe() {
    if (!api || !editToolId || !editingTool || editingTool.isLink) return;
    setEditBusy(true);
    try {
      const result = await api.updateCustom(editToolId, { pickExe: true });
      applyBundle(result);
      if (result.canceled) return;
      if (result.error) {
        showToast(result.error);
        return;
      }
      const updated = result.tools?.find((t) => t.id === editToolId);
      if (updated?.resolvedPath) setEditPath(updated.resolvedPath);
      if (result.ok) showToast('Executable updated');
    } catch (err) {
      showToast(String(err));
    } finally {
      setEditBusy(false);
    }
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
        <nav className="sidebar-nav" data-tour="nav">
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
              <div
                className="workspace-primary"
                onContextMenu={openSectionsMenu}
                data-tour="apps"
              >
                {loading && pageEntryIds.length === 0 ? (
                  <p className="muted">Scanning for installations…</p>
                ) : (
                  <div
                    className="app-sections"
                    onContextMenu={openSectionsMenu}
                    data-tour="sections"
                  >
                    {(activeLayout?.sections || []).map((section, index) => {
                      const moveTargets = (activeLayout?.sections || [])
                        .filter((s) => s.id !== section.id)
                        .map((s) => ({ id: s.id, name: s.name }));
                      return (
                        <section key={section.id} className="app-section">
                          <div className="app-section-toolbar">
                            {editingSectionId === section.id ? (
                              <input
                                className="app-section-name-input"
                                autoFocus
                                defaultValue={section.name}
                                aria-label="Section name"
                                onBlur={(event) => {
                                  void onRenameSection(
                                    section.id,
                                    event.target.value,
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.currentTarget.blur();
                                  }
                                  if (event.key === 'Escape') {
                                    setEditingSectionId(null);
                                  }
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="app-section-label"
                                onClick={() => setEditingSectionId(section.id)}
                                title="Rename section"
                              >
                                {section.name}
                              </button>
                            )}
                            <div className="app-section-actions">
                              <button
                                type="button"
                                className="info-layout-btn"
                                disabled={index === 0}
                                aria-label="Move section up"
                                onClick={() => void onMoveSection(section.id, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="info-layout-btn"
                                disabled={
                                  !activeLayout ||
                                  index >= activeLayout.sections.length - 1
                                }
                                aria-label="Move section down"
                                onClick={() => void onMoveSection(section.id, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="info-layout-btn"
                                disabled={
                                  !activeLayout ||
                                  activeLayout.sections.length <= 1
                                }
                                aria-label="Delete section"
                                onClick={() => void onDeleteSection(section.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <SortableGrid
                            className="tool-grid"
                            groupId={section.id}
                            ids={section.toolIds}
                            emptyLabel="Drop apps here"
                            onReorder={(ids) => {
                              void onSectionReorder(section.id, ids);
                            }}
                            onMove={(payload) => {
                              void onSectionMove(
                                payload.fromGroupId,
                                payload.toGroupId,
                                payload.itemId,
                                payload.beforeId,
                              );
                            }}
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
                                  moveTargets={moveTargets}
                                  onMoveToSection={(targetId) => {
                                    void onMoveToolToSection(tool.id, targetId);
                                  }}
                                  onLaunch={() => void onLaunch(tool.id)}
                                  onPick={() => void onPick(tool.id)}
                                  onClear={() => void onClear(tool.id)}
                                  onDownload={() => void onDownload(tool.id)}
                                  onDismiss={() => void onDismiss(tool.id)}
                                  onHide={() => void onHide(tool.id)}
                                  onRestore={() => void onRestore(tool.id)}
                                  onEdit={
                                    tool.isCustom
                                      ? () => onEditCustom(tool)
                                      : undefined
                                  }
                                  onRemoveCustom={
                                    tool.isCustom
                                      ? () => void onRemoveCustom(tool.id)
                                      : undefined
                                  }
                                />
                              );
                            }}
                          </SortableGrid>
                        </section>
                      );
                    })}
                    {!loading && pageEntryIds.length === 0 && (
                      <p className="muted">
                        No apps on this tab. Use Add to include one. Right-click
                        to add a section.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {page === 'optional' && (
            <div className="app-sections" onContextMenu={openSectionsMenu}>
              {(activeLayout?.sections || []).map((section, index) => {
                const moveTargets = (activeLayout?.sections || [])
                  .filter((s) => s.id !== section.id)
                  .map((s) => ({ id: s.id, name: s.name }));
                return (
                  <section key={section.id} className="app-section">
                    <div className="app-section-toolbar">
                      {editingSectionId === section.id ? (
                        <input
                          className="app-section-name-input"
                          autoFocus
                          defaultValue={section.name}
                          aria-label="Section name"
                          onBlur={(event) => {
                            void onRenameSection(section.id, event.target.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur();
                            }
                            if (event.key === 'Escape') {
                              setEditingSectionId(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="app-section-label"
                          onClick={() => setEditingSectionId(section.id)}
                          title="Rename section"
                        >
                          {section.name}
                        </button>
                      )}
                      <div className="app-section-actions">
                        <button
                          type="button"
                          className="info-layout-btn"
                          disabled={index === 0}
                          aria-label="Move section up"
                          onClick={() => void onMoveSection(section.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="info-layout-btn"
                          disabled={
                            !activeLayout ||
                            index >= activeLayout.sections.length - 1
                          }
                          aria-label="Move section down"
                          onClick={() => void onMoveSection(section.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="info-layout-btn"
                          disabled={
                            !activeLayout || activeLayout.sections.length <= 1
                          }
                          aria-label="Delete section"
                          onClick={() => void onDeleteSection(section.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <SortableGrid
                      className="tool-grid"
                      groupId={section.id}
                      ids={section.toolIds}
                      emptyLabel="Drop apps here"
                      onReorder={(ids) => {
                        void onSectionReorder(section.id, ids);
                      }}
                      onMove={(payload) => {
                        void onSectionMove(
                          payload.fromGroupId,
                          payload.toGroupId,
                          payload.itemId,
                          payload.beforeId,
                        );
                      }}
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
                            moveTargets={moveTargets}
                            onMoveToSection={(targetId) => {
                              void onMoveToolToSection(tool.id, targetId);
                            }}
                            onLaunch={() => void onLaunch(tool.id)}
                            onPick={() => void onPick(tool.id)}
                            onClear={() => void onClear(tool.id)}
                            onDownload={() => void onDownload(tool.id)}
                            onDismiss={() => void onDismiss(tool.id)}
                            onHide={() => void onHide(tool.id)}
                            onRestore={() => void onRestore(tool.id)}
                            onEdit={
                              tool.isCustom
                                ? () => onEditCustom(tool)
                                : undefined
                            }
                            onRemoveCustom={
                              tool.isCustom
                                ? () => void onRemoveCustom(tool.id)
                                : undefined
                            }
                          />
                        );
                      }}
                    </SortableGrid>
                  </section>
                );
              })}
              {pageEntryIds.length === 0 && (
                <p className="muted">
                  Nothing here yet. Add an app or restore from Not in use.
                  Right-click to add a section.
                </p>
              )}
            </div>
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
                        onEdit={
                          tool.isCustom ? () => onEditCustom(tool) : undefined
                        }
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

        {editToolId && editingTool && (
          <div className="settings-layer" role="presentation">
            <button
              type="button"
              className="settings-backdrop"
              aria-label="Close edit dialog"
              onClick={closeEditCustom}
            />
            <div
              className="settings-sheet add-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-title"
            >
              <div className="settings-sheet-handle" aria-hidden />
              <div className="settings-sheet-head">
                <h2 id="edit-title" className="settings-sheet-title">
                  Edit {editingTool.isLink ? 'website' : 'app'}
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeEditCustom}
                >
                  Close
                </button>
              </div>
              <p className="settings-sheet-copy">
                Update the name, details, or tab for this custom item.
              </p>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="edit-name">
                  Name
                </label>
                <input
                  id="edit-name"
                  className="settings-input"
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="edit-blurb">
                  Description
                </label>
                <input
                  id="edit-blurb"
                  className="settings-input"
                  type="text"
                  value={editBlurb}
                  onChange={(event) => setEditBlurb(event.target.value)}
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="edit-category">
                  Tab
                </label>
                <select
                  id="edit-category"
                  className="settings-select"
                  value={editCategory}
                  onChange={(event) =>
                    setEditCategory(event.target.value as ToolCategory)
                  }
                >
                  <option value="poe1">Path of Exile</option>
                  <option value="poe2">Path of Exile 2</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
              {editingTool.isLink ? (
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="edit-url">
                    URL
                  </label>
                  <input
                    id="edit-url"
                    className="settings-input"
                    type="url"
                    value={editUrl}
                    placeholder="https://…"
                    onChange={(event) => setEditUrl(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="settings-field">
                    <label className="settings-field-label" htmlFor="edit-path">
                      Executable
                    </label>
                    <p
                      className="settings-field-hint"
                      id="edit-path"
                      title={streamerMode ? undefined : editPath || undefined}
                    >
                      {editPath
                        ? streamerMode
                          ? obscureSensitive(editPath, 'path')
                          : editPath
                        : 'No executable path set'}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={editBusy}
                      onClick={() => void onEditPickExe()}
                    >
                      Change executable…
                    </button>
                  </div>
                  <div className="settings-field">
                    <label
                      className="settings-field-label"
                      htmlFor="edit-download"
                    >
                      Download URL (optional)
                    </label>
                    <input
                      id="edit-download"
                      className="settings-input"
                      type="url"
                      value={editDownloadUrl}
                      placeholder="https://…"
                      onChange={(event) =>
                        setEditDownloadUrl(event.target.value)
                      }
                    />
                  </div>
                </>
              )}
              <div className="settings-sheet-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={editBusy}
                  onClick={() => {
                    if (!editToolId) return;
                    void onRemoveCustom(editToolId);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeEditCustom}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={editBusy}
                  onClick={() => void onSaveCustomEdit()}
                >
                  {editBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
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
                <label className="settings-field-label" htmlFor="close-to-tray">
                  System tray
                </label>
                <p className="settings-field-hint">
                  When enabled, the X button hides the app to the tray instead of
                  quitting. Use the tray icon to show it again, or Quit from the
                  tray menu.
                </p>
                <label className="settings-check" htmlFor="close-to-tray">
                  <input
                    id="close-to-tray"
                    type="checkbox"
                    checked={closeToTray}
                    onChange={(event) => {
                      void onCloseToTrayChange(event.target.checked);
                    }}
                  />
                  <span>Close to system tray</span>
                </label>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Quick tour</label>
                <p className="settings-field-hint">
                  Replay the first-run tips for tabs, cards, sections, and the
                  system tray.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void replayTour()}
                >
                  Show tips again
                </button>
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
                <label className="settings-field-label" htmlFor="queue-reminder">
                  Queue reminder
                </label>
                <p className="settings-field-hint">
                  Before official launch, character create / queue often opens
                  early. We&apos;ll nudge you in that window (estimate — GGG
                  timing varies).
                </p>
                <label className="settings-check" htmlFor="queue-reminder">
                  <input
                    id="queue-reminder"
                    type="checkbox"
                    checked={queueReminderEnabled}
                    onChange={(event) => {
                      void onQueueReminderSettingsChange({
                        enabled: event.target.checked,
                      });
                    }}
                  />
                  <span>Remind me before league start</span>
                </label>
                <label
                  className="settings-field-label"
                  htmlFor="queue-reminder-minutes"
                  style={{ marginTop: '0.65rem' }}
                >
                  Minutes before launch
                </label>
                <select
                  id="queue-reminder-minutes"
                  className="settings-select"
                  value={queueReminderMinutes}
                  disabled={!queueReminderEnabled}
                  onChange={(event) => {
                    void onQueueReminderSettingsChange({
                      minutes: Number(event.target.value),
                    });
                  }}
                >
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                  <option value={120}>120</option>
                </select>
              </div>
              {isDev && (
                <>
                  <div className="settings-field">
                    <label
                      className="settings-field-label"
                      htmlFor="preview-league-launch"
                    >
                      Preview league LOGIN banner
                    </label>
                    <p className="settings-field-hint">
                      Dev only. Force the LOGIN! banner before go-live.
                    </p>
                    <label
                      className="settings-check"
                      htmlFor="preview-league-launch"
                    >
                      <input
                        id="preview-league-launch"
                        type="checkbox"
                        checked={previewLeagueLaunch}
                        onChange={(event) => {
                          void onPreviewLeagueLaunchChange(
                            event.target.checked,
                          );
                        }}
                      />
                      <span>Show LOGIN! launch banner (test mode)</span>
                    </label>
                  </div>
                  <div className="settings-field">
                    <p className="settings-field-label">
                      Preview league switch prompt
                    </p>
                    <p className="settings-field-hint">
                      Dev only. Shows the new-league exchange switch dialog.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={onPreviewLeagueOffer}
                    >
                      Show switch prompt
                    </button>
                  </div>
                  <div className="settings-field">
                    <p className="settings-field-label">
                      Preview queue reminder
                    </p>
                    <p className="settings-field-hint">
                      Dev only. Shows the pre-launch queue nudge for this tab.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={onPreviewQueueReminder}
                    >
                      Show queue reminder
                    </button>
                  </div>
                </>
              )}
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

      {sectionsMenuPos &&
        createPortal(
          <div
            ref={sectionsMenuRef}
            className="card-context-menu"
            style={{ left: sectionsMenuPos.x, top: sectionsMenuPos.y }}
            role="menu"
            aria-label="Section actions"
          >
            <button
              type="button"
              role="menuitem"
              className="card-context-item"
              onClick={() => {
                setSectionsMenuPos(null);
                void onAddSection();
              }}
            >
              Add section
            </button>
          </div>,
          document.body,
        )}
      <OnboardingTour
        steps={TOUR_STEPS}
        open={tourOpen}
        onComplete={() => void finishTour()}
        onSkip={() => void finishTour()}
      />
      {toast && <div className="toast">{toast}</div>}

      {leagueOffer && (
        <div className="league-offer-layer" role="presentation">
          <button
            type="button"
            className="league-offer-backdrop"
            aria-label="Dismiss league offer"
            onClick={() => void onDismissLeagueOffer()}
          />
          <div
            className="league-offer-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="league-offer-title"
          >
            <p className="league-offer-kicker">
              {leagueOffer.preview ? 'Preview' : 'New league'}
              {leagueOffer.game === 'poe2' ? ' · PoE2' : ' · PoE1'}
            </p>
            <h2 id="league-offer-title" className="league-offer-title">
              Switch to {leagueOffer.suggested.name}?
            </h2>
            <p className="league-offer-copy">
              Live exchange rates for the new league are ready. You&apos;re
              currently on {leagueOffer.currentName}.
            </p>
            <div className="league-offer-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onAcceptLeagueOffer()}
              >
                Switch
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onDismissLeagueOffer()}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {queueReminder && !leagueOffer && (
        <div className="league-offer-layer" role="presentation">
          <button
            type="button"
            className="league-offer-backdrop"
            aria-label="Dismiss queue reminder"
            onClick={() => void onDismissQueueReminder()}
          />
          <div
            className="league-offer-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="queue-reminder-title"
          >
            <p className="league-offer-kicker">
              {queueReminder.preview ? 'Preview' : 'Queue window'}
              {queueReminder.game === 'poe2' ? ' · PoE2' : ' · PoE1'}
            </p>
            <h2 id="queue-reminder-title" className="league-offer-title">
              Queue may be open for {queueReminder.leagueName}
            </h2>
            <p className="league-offer-copy">
              Character create often opens about {queueReminder.minutesBefore}{' '}
              minutes before official start. Jump in early if you want a head
              start.
            </p>
            <div className="league-offer-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onLaunchFromQueueReminder()}
              >
                Launch
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onDismissQueueReminder()}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
