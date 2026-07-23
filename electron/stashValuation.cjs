/**
 * Currency-tab valuation: fetches the account's currency-type stash tabs and
 * prices every stack against poe.ninja, expressed as whole Divines + remainder
 * Chaos. Scope is deliberately currency tabs only (not uniques/gems/maps/etc).
 */
const { fetchOverview } = require('./currency.cjs');
const { getValidAccessToken } = require('./poeAuth.cjs');
const { listStashTabs, getStashTabItems, isCurrencyTab, runSequential } = require('./poeStash.cjs');

const CACHE_TTL_MS = 60_000;
const SKIPPED_SAMPLE_LIMIT = 20;

/** @type {Map<string, { expiresAt: number, result: object }>} */
const cache = new Map();

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

/** typeLine/display-name -> chaos-equivalent value, built from poe.ninja's parallel lines/items arrays. */
async function buildPriceMap(league, game = 'poe1') {
  const [currencyOverview, fragmentOverview] = await Promise.all([
    fetchOverview(league, 'Currency', game),
    fetchOverview(league, 'Fragment', game).catch(() => ({ lines: [], items: [] })),
  ]);

  const map = new Map();
  for (const overview of [currencyOverview, fragmentOverview]) {
    const valueById = new Map(overview.lines.map((line) => [line.id, line.primaryValue]));
    for (const item of overview.items) {
      const value = valueById.get(item.id);
      if (typeof value !== 'number' || !item?.name) continue;
      map.set(normalizeName(item.name), value);
    }
  }
  return map;
}

async function getCurrencyStashValue(league, game = 'poe1') {
  if (!league) return { ok: false, error: 'No league selected' };

  const cached = cache.get(league);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { ok: false, error: 'not_connected' };
  }

  let tabs;
  try {
    tabs = (await listStashTabs(league, accessToken)).filter(isCurrencyTab);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }

  let priceMap;
  try {
    priceMap = await buildPriceMap(league, game);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }

  const chaosPerDivine = priceMap.get('divine orb') ?? null;

  let itemLists;
  try {
    itemLists = await runSequential(
      tabs.map((tab) => () => getStashTabItems(league, tab.id, accessToken)),
    );
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }

  let totalChaos = 0;
  let matchedItemCount = 0;
  let skippedItemCount = 0;
  const skippedSample = [];

  for (const items of itemLists) {
    for (const item of items) {
      const qty = typeof item?.stackSize === 'number' ? item.stackSize : 1;
      const value = priceMap.get(normalizeName(item?.typeLine));
      if (typeof value === 'number') {
        totalChaos += qty * value;
        matchedItemCount += 1;
      } else {
        skippedItemCount += 1;
        if (skippedSample.length < SKIPPED_SAMPLE_LIMIT && item?.typeLine) {
          const name = String(item.typeLine);
          if (!skippedSample.includes(name)) skippedSample.push(name);
        }
      }
    }
  }

  const totalDivine = chaosPerDivine ? Math.floor(totalChaos / chaosPerDivine) : null;
  const remainderChaos =
    totalDivine != null ? totalChaos - totalDivine * chaosPerDivine : totalChaos;

  const result = {
    ok: true,
    league,
    totalChaos,
    totalDivine,
    remainderChaos,
    tabCount: tabs.length,
    matchedItemCount,
    skippedItemCount,
    skippedSample,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(league, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

module.exports = {
  getCurrencyStashValue,
};
