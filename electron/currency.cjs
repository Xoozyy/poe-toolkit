/**
 * poe.ninja currency exchange + active economy leagues (PoE1 / PoE2).
 * PoE1 leagues: https://poe.ninja/poe1/api/data/index-state
 * PoE2 leagues: https://poe.ninja/poe2/api/data/index-state
 * Rates:        …/api/economy/exchange/current/overview
 */
const INDEX_STATE_URL = {
  poe1: 'https://poe.ninja/poe1/api/data/index-state',
  poe2: 'https://poe.ninja/poe2/api/data/index-state',
};
const OVERVIEW_URL = {
  poe1: 'https://poe.ninja/poe1/api/economy/exchange/current/overview',
  poe2: 'https://poe.ninja/poe2/api/economy/exchange/current/overview',
};
const FETCH_TIMEOUT_MS = 12_000;
const FALLBACK_LEAGUES = [
  { id: 'Standard', name: 'Standard', url: 'standard' },
  { id: 'Hardcore', name: 'Hardcore', url: 'hardcore' },
];

/**
 * Display pairs the user can enable. Rate is always "1 left = N right"
 * using the overview primaryValue (chaos-eq on PoE1, divine-eq on PoE2).
 */
const CURRENCY_PAIRS = [
  {
    id: 'chaos-divine',
    label: 'Chaos → Divine',
    leftId: 'divine',
    rightId: 'chaos',
    leftLabel: 'Divine',
    rightLabel: 'Chaos',
  },
  {
    id: 'mirror-divine',
    label: 'Mirror → Divine',
    leftId: 'mirror',
    rightId: 'divine',
    leftLabel: 'Mirror',
    rightLabel: 'Divine',
  },
  {
    id: 'hinekoras-lock-divine',
    label: "Hinekora's Lock → Divine",
    leftId: 'hinekoras-lock',
    rightId: 'divine',
    leftLabel: "Hinekora's Lock",
    rightLabel: 'Divine',
  },
];

const DEFAULT_CURRENCY_PAIR_IDS = ['chaos-divine'];

function normalizeGame(game) {
  return game === 'poe2' ? 'poe2' : 'poe1';
}

function isPermanentLeague(name) {
  return name === 'Standard' || name === 'Hardcore';
}

function leaguePageSlug(league, leagues) {
  const match = Array.isArray(leagues)
    ? leagues.find((entry) => entry?.id === league)
    : null;
  if (match?.url) return String(match.url);
  return String(league || 'standard')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Public currency economy page for a league on poe.ninja. */
function currencyPageUrl(league, leagues, game = 'poe1') {
  const g = normalizeGame(game);
  const slug = encodeURIComponent(leaguePageSlug(league, leagues));
  return `https://poe.ninja/${g}/economy/${slug}/currency`;
}

/** Prefer the active challenge league when present; otherwise Standard. */
function pickDefaultLeague(leagues) {
  const list = Array.isArray(leagues) ? leagues : [];
  const challenge = list.find((entry) => entry?.id && !isPermanentLeague(entry.id));
  if (challenge) return challenge.id;
  const standard = list.find((entry) => entry?.id === 'Standard');
  return standard?.id || list[0]?.id || 'Standard';
}

function listCurrencyPairs() {
  return CURRENCY_PAIRS.map((pair) => ({
    id: pair.id,
    label: pair.label,
  }));
}

function normalizeCurrencyPairIds(raw) {
  const allowed = new Set(CURRENCY_PAIRS.map((pair) => pair.id));
  const ids = Array.isArray(raw)
    ? raw.map(String).filter((id) => allowed.has(id))
    : [];
  return ids.length > 0 ? [...new Set(ids)] : [...DEFAULT_CURRENCY_PAIR_IDS];
}

function chaosValue(lines, id) {
  const line = Array.isArray(lines) ? lines.find((entry) => entry?.id === id) : null;
  return typeof line?.primaryValue === 'number' ? line.primaryValue : null;
}

function buildPairRates(lines, pairIds) {
  const selected = normalizeCurrencyPairIds(pairIds);
  const rates = [];
  for (const pairId of selected) {
    const pair = CURRENCY_PAIRS.find((entry) => entry.id === pairId);
    if (!pair) continue;
    const leftValue = chaosValue(lines, pair.leftId);
    const rightValue = chaosValue(lines, pair.rightId);
    if (leftValue == null || rightValue == null || rightValue === 0) {
      rates.push({
        id: pair.id,
        label: pair.label,
        leftId: pair.leftId,
        rightId: pair.rightId,
        leftLabel: pair.leftLabel,
        rightLabel: pair.rightLabel,
        rate: null,
        error: 'Rate unavailable',
      });
      continue;
    }
    rates.push({
      id: pair.id,
      label: pair.label,
      leftId: pair.leftId,
      rightId: pair.rightId,
      leftLabel: pair.leftLabel,
      rightLabel: pair.rightLabel,
      rate: leftValue / rightValue,
    });
  }
  return rates;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = new Error(`poe.ninja returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Active economy leagues from poe.ninja (updates when a new league launches —
 * same source the site itself uses; no app update required).
 */
async function fetchEconomyLeagues(game = 'poe1') {
  const g = normalizeGame(game);
  try {
    const json = await fetchJson(INDEX_STATE_URL[g]);
    const seen = new Set();
    const leagues = [];
    for (const entry of json?.economyLeagues || []) {
      const id = String(entry?.name || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      leagues.push({
        id,
        name: String(entry?.displayName || entry?.name || id).trim() || id,
        url: String(entry?.url || id)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ''),
      });
    }
    if (leagues.length === 0) {
      return { ok: true, leagues: FALLBACK_LEAGUES };
    }
    return { ok: true, leagues };
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Timed out fetching economy leagues'
        : String(err?.message || err);
    return {
      ok: false,
      error: message,
      leagues: FALLBACK_LEAGUES,
    };
  }
}

/**
 * Raw overview data from poe.ninja (e.g. type=Currency, type=Fragment). Shared by
 * the currency-exchange footer and the stash valuator so both use the same
 * fetch/timeout/error handling instead of duplicating it.
 *
 * `lines[i]` (price/value by id) and `items[i]` (display name/category by id)
 * are parallel arrays matched by `id` — confirmed against a live response.
 */
async function fetchOverview(league, type = 'Currency', game = 'poe1') {
  const g = normalizeGame(game);
  const url = `${OVERVIEW_URL[g]}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  const json = await fetchJson(url);
  return {
    lines: Array.isArray(json?.lines) ? json.lines : [],
    items: Array.isArray(json?.items) ? json.items : [],
  };
}

async function fetchOverviewLines(league, type = 'Currency', game = 'poe1') {
  const { lines } = await fetchOverview(league, type, game);
  return lines;
}

async function fetchCurrencyExchange(
  league = 'Standard',
  leagues = null,
  pairIds = DEFAULT_CURRENCY_PAIR_IDS,
  game = 'poe1',
) {
  const g = normalizeGame(game);
  const pageUrl = currencyPageUrl(league, leagues, g);
  const selectedPairs = normalizeCurrencyPairIds(pairIds);
  try {
    const lines = await fetchOverviewLines(league, 'Currency', g);
    const rates = buildPairRates(lines, selectedPairs);
    const hasAnyRate = rates.some((entry) => typeof entry.rate === 'number');

    if (!hasAnyRate) {
      return {
        ok: false,
        error: 'Selected currency rates not found in response',
        game: g,
        league,
        pageUrl,
        rates,
      };
    }

    return {
      ok: true,
      game: g,
      league,
      pageUrl,
      rates,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Timed out fetching currency exchange rate'
        : String(err?.message || err);
    return {
      ok: false,
      error: message,
      game: g,
      league,
      pageUrl,
      rates: [],
    };
  }
}

module.exports = {
  fetchCurrencyExchange,
  fetchEconomyLeagues,
  fetchOverview,
  fetchOverviewLines,
  pickDefaultLeague,
  listCurrencyPairs,
  normalizeCurrencyPairIds,
  normalizeGame,
};
