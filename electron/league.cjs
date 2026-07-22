/**
 * Manual league schedule (edit here or later via Settings).
 * Start: Jul 24, 2026 1:00 PM PDT = 4:00 PM EDT = 20:00 UTC
 */
const DEFAULT_LEAGUE = {
  nextName: 'Curse of the Allflame',
  /** ISO UTC */
  nextStartUtc: '2026-07-24T20:00:00.000Z',
  /** Shown until nextStartUtc; update manually when you care */
  currentName: 'Mirage',
  announcementUrl: 'https://www.pathofexile.com',
};

function getLeagueInfo(configLeague) {
  const league = {
    ...DEFAULT_LEAGUE,
    ...(configLeague && typeof configLeague === 'object' ? configLeague : {}),
  };
  const startMs = Date.parse(league.nextStartUtc);
  const now = Date.now();
  const live = Number.isFinite(startMs) && now >= startMs;
  return {
    nextName: league.nextName,
    nextStartUtc: league.nextStartUtc,
    currentName: league.currentName,
    announcementUrl: league.announcementUrl || null,
    live,
    startMs: Number.isFinite(startMs) ? startMs : null,
  };
}

module.exports = { DEFAULT_LEAGUE, getLeagueInfo };
