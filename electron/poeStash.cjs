/**
 * Authenticated Path of Exile API client — characters (for league discovery),
 * stash tabs, and stash tab contents.
 *
 * Public OAuth clients can't use service:leagues, so GET /league isn't available;
 * the account's characters are the only way to discover which league names it
 * has activity in.
 */
const { getPoeAuthConfig } = require('./config.cjs');
const { API_BASE, userAgent } = require('./poeAuth.cjs');

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_AFTER_CAP_MS = 30_000;
const SEQUENTIAL_DELAY_MS = 400;

/** Confirmed against GGG's stash tab type for the account's currency tab. */
const CURRENCY_TAB_TYPES = new Set(['CurrencyStash']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawFetch(pathAndQuery, accessToken) {
  const { clientId, contactEmail } = getPoeAuthConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${pathAndQuery}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': userAgent(clientId, contactEmail),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authenticated GET with one 429 retry (honoring Retry-After) and a clear
 * error on 401 so the caller can attempt a token refresh and retry.
 */
async function authedFetch(pathAndQuery, accessToken) {
  let res = await rawFetch(pathAndQuery, accessToken);

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('retry-after')) || 5;
    await sleep(Math.min(retryAfterSec * 1000, RETRY_AFTER_CAP_MS));
    res = await rawFetch(pathAndQuery, accessToken);
    if (res.status === 429) {
      const err = new Error('PoE API rate limit hit. Try again shortly.');
      err.status = 429;
      throw err;
    }
  }

  if (res.status === 401) {
    const err = new Error('PoE API session expired.');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`PoE API request failed: ${res.status} ${detail}`.trim());
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** Runs async tasks one at a time with a small delay — conservative rate-limit hygiene. */
async function runSequential(tasks, delayMs = SEQUENTIAL_DELAY_MS) {
  const results = [];
  for (let i = 0; i < tasks.length; i += 1) {
    results.push(await tasks[i]());
    if (i < tasks.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return results;
}

async function listCharacterLeagues(accessToken) {
  const json = await authedFetch('/character', accessToken);
  const characters = Array.isArray(json?.characters) ? json.characters : [];
  const leagues = new Set();
  for (const character of characters) {
    const league = character?.league;
    if (typeof league === 'string' && league.trim()) leagues.add(league.trim());
  }
  return [...leagues];
}

function flattenStashTabs(tabs, parentId = null, out = []) {
  for (const tab of tabs || []) {
    out.push({
      id: tab.id,
      parentId,
      name: tab.name,
      type: tab.type,
      index: tab.index,
    });
    if (Array.isArray(tab.children) && tab.children.length > 0) {
      flattenStashTabs(tab.children, tab.id, out);
    }
  }
  return out;
}

function isCurrencyTab(tab) {
  return CURRENCY_TAB_TYPES.has(tab?.type);
}

async function listStashTabs(league, accessToken) {
  const json = await authedFetch(`/stash/${encodeURIComponent(league)}`, accessToken);
  return flattenStashTabs(json?.stashes);
}

async function getStashTabItems(league, stashId, accessToken) {
  const json = await authedFetch(
    `/stash/${encodeURIComponent(league)}/${encodeURIComponent(stashId)}`,
    accessToken,
  );
  return Array.isArray(json?.stash?.items) ? json.stash.items : [];
}

module.exports = {
  listCharacterLeagues,
  listStashTabs,
  getStashTabItems,
  isCurrencyTab,
  runSequential,
};
