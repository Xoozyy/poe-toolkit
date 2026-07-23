/**
 * poe.ninja currency exchange overview.
 * https://poe.ninja/poe1/api/economy/exchange/current/overview
 */
const OVERVIEW_URL = 'https://poe.ninja/poe1/api/economy/exchange/current/overview';
const IMAGE_HOST = 'https://web.poecdn.com';
const FETCH_TIMEOUT_MS = 12_000;

function iconUrl(items, id) {
  const item = Array.isArray(items) ? items.find((entry) => entry?.id === id) : null;
  return item?.image ? `${IMAGE_HOST}${item.image}` : null;
}

async function fetchCurrencyExchange(league = 'Standard') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${OVERVIEW_URL}?league=${encodeURIComponent(league)}&type=Currency`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `poe.ninja returned ${res.status}`,
        league,
        chaosPerDivine: null,
      };
    }
    const json = await res.json();
    const divineLine = Array.isArray(json?.lines)
      ? json.lines.find((line) => line?.id === 'divine')
      : null;
    const chaosPerDivine =
      typeof divineLine?.primaryValue === 'number' ? divineLine.primaryValue : null;

    if (chaosPerDivine == null) {
      return {
        ok: false,
        error: 'Divine Orb rate not found in response',
        league,
        chaosPerDivine: null,
      };
    }

    const items = json?.core?.items;

    return {
      ok: true,
      league,
      chaosPerDivine,
      chaosIconUrl: iconUrl(items, 'chaos'),
      divineIconUrl: iconUrl(items, 'divine'),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message =
      err?.name === 'AbortError'
        ? 'Timed out fetching currency exchange rate'
        : String(err?.message || err);
    return { ok: false, error: message, league, chaosPerDivine: null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchCurrencyExchange, OVERVIEW_URL };
