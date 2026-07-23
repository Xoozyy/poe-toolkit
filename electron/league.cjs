/**
 * League schedule + launch content funnel (PoE1 / PoE2).
 *
 * Stages:
 *   countdown → waiting for next launch (timer when date known)
 *   current   → challenge league is live; no next date / not launch day
 *   login     → next league just dropped (LOGIN! meme)
 */
const DEFAULT_LEAGUE = {
  nextName: 'Curse of the Allflame',
  /** ISO UTC — Jul 24, 2026 1:00 PM PDT */
  nextStartUtc: '2026-07-24T20:00:00.000Z',
  currentName: 'Mirage',
  announcementUrl: 'https://www.pathofexile.com',
};

/** PoE2: Runes of Aldur is live; 1.0 date not announced yet. */
const DEFAULT_LEAGUE_POE2 = {
  nextName: '1.0 Full Release',
  nextStartUtc: null,
  currentName: 'Runes of Aldur',
  announcementUrl:
    'https://www.pathofexile.com/forum/view-thread/3931070',
};

const PERMANENT = new Set(['standard', 'hardcore']);
const LOGIN_WINDOW_MS = 48 * 60 * 60 * 1000;

const LOGIN_LINES = [
  {
    kicker: 'Servers are up',
    headline: 'LOGIN!',
    meta: 'The gates are open. Character select is calling.',
    badge: 'LOGIN',
  },
  {
    kicker: 'League is live',
    headline: 'LOGIN!',
    meta: 'Fresh economy. Empty stash. No excuses.',
    badge: 'LOGIN',
  },
  {
    kicker: "It's time, exile",
    headline: 'LOGIN!',
    meta: 'Patch notes read. Builds theorycrafted. Go.',
    badge: 'LOGIN',
  },
  {
    kicker: 'Wraeclast awaits',
    headline: 'LOGIN!',
    meta: 'Queue up before your friends claim “first clear.”',
    badge: 'LOGIN',
  },
  {
    kicker: 'Launch confirmed',
    headline: 'LOGIN!',
    meta: 'poe.ninja is indexing. The race has begun.',
    badge: 'LOGIN',
  },
];

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^hardcore\s+/i, '')
    .replace(/^hc\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashPick(seed, count) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return count > 0 ? h % count : 0;
}

function pickLoginCopy(leagueName) {
  const line = LOGIN_LINES[hashPick(leagueName, LOGIN_LINES.length)];
  return {
    kicker: line.kicker,
    headline: line.headline,
    meta: `${leagueName} is live · ${line.meta}`,
    badge: line.badge,
  };
}

function isLeagueOnNinja(name, economyLeagues) {
  const target = normalizeName(name);
  if (!target || !Array.isArray(economyLeagues)) return false;
  return economyLeagues.some((entry) => {
    const raw = String(entry?.id || entry?.name || '');
    if (/^hardcore\s+/i.test(raw) || /^hc\s+/i.test(raw)) return false;
    const id = normalizeName(raw);
    if (!id || PERMANENT.has(id)) return false;
    return id === target || id.includes(target) || target.includes(id);
  });
}

function defaultLeagueForGame(game) {
  return game === 'poe2' ? DEFAULT_LEAGUE_POE2 : DEFAULT_LEAGUE;
}

function getBaseLeague(configLeague, game = 'poe1') {
  return {
    ...defaultLeagueForGame(game),
    ...(configLeague && typeof configLeague === 'object' ? configLeague : {}),
  };
}

/**
 * @param {object} configLeague
 * @param {{
 *   game?: 'poe1' | 'poe2',
 *   economyLeagues?: Array<{id:string,name?:string}>,
 *   forcePreview?: boolean,
 *   nowMs?: number,
 * }} [opts]
 */
function getLeagueInfo(configLeague, opts = {}) {
  const game = opts.game === 'poe2' ? 'poe2' : 'poe1';
  const league = getBaseLeague(configLeague, game);
  const startMs = Date.parse(league.nextStartUtc);
  const hasStart = Number.isFinite(startMs);
  const now = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const scheduleLive = hasStart && now >= startMs;
  const nextOnNinja = isLeagueOnNinja(league.nextName, opts.economyLeagues);
  const currentOnNinja = isLeagueOnNinja(
    league.currentName,
    opts.economyLeagues,
  );
  const forcePreview = Boolean(opts.forcePreview);

  const recentlyLaunched =
    scheduleLive && hasStart && now - startMs < LOGIN_WINDOW_MS;

  let launchReason = null;
  let stage = 'countdown';

  if (forcePreview || nextOnNinja || recentlyLaunched) {
    stage = 'login';
    if (forcePreview) launchReason = 'preview';
    else if (nextOnNinja) launchReason = 'poe.ninja';
    else launchReason = 'schedule';
  } else if (
    scheduleLive ||
    currentOnNinja ||
    (Boolean(league.currentName) && !hasStart)
  ) {
    stage = 'current';
    launchReason = scheduleLive
      ? 'schedule'
      : currentOnNinja
        ? 'poe.ninja'
        : null;
  } else {
    stage = 'countdown';
  }

  const loginCopy = stage === 'login' ? pickLoginCopy(league.nextName) : null;

  return {
    game,
    nextName: league.nextName,
    currentName: league.currentName || null,
    startMs: hasStart ? startMs : null,
    stage,
    launchReason,
    loginCopy,
  };
}

module.exports = {
  DEFAULT_LEAGUE,
  DEFAULT_LEAGUE_POE2,
  getLeagueInfo,
};
