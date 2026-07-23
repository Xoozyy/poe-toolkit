import { useEffect, useMemo, useState } from 'react';
import type { LeagueInfo } from '../types';
import { pad, splitRemaining } from '../lib/countdown';

export function LeagueWidgetApp() {
  const api = window.poeToolkit;
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) {
      setError('API unavailable');
      return;
    }
    let cancelled = false;
    void api
      .getLeague()
      .then((info) => {
        if (!cancelled) setLeague(info);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startMs = league?.startMs ?? null;
  const remaining = startMs != null ? startMs - now : 0;
  const live = league?.live || (startMs != null && remaining <= 0);
  const parts = useMemo(() => splitRemaining(remaining), [remaining]);

  function closeWidget() {
    void api?.closeLeagueWidget();
  }

  return (
    <div className={`league-widget${live ? ' is-live' : ''}`}>
      <div className="league-widget-chrome">
        <button
          type="button"
          className="league-widget-close"
          onClick={closeWidget}
          aria-label="Close widget"
          title="Close"
        >
          ×
        </button>
      </div>

      {error ? (
        <p className="league-widget-error">{error}</p>
      ) : !league ? (
        <p className="league-widget-loading">Loading…</p>
      ) : (
        <>
          <p className="league-widget-kicker">
            {live ? 'League live' : 'Next league'}
          </p>
          <h1 className="league-widget-name">{league.nextName}</h1>
          {live ? (
            <div className="league-widget-live">LIVE</div>
          ) : (
            <div className="league-widget-clock" aria-live="polite">
              <div className="league-widget-unit">
                <span className="league-widget-digits">{pad(parts.days)}</span>
                <span className="league-widget-label">d</span>
              </div>
              <span className="league-widget-sep">:</span>
              <div className="league-widget-unit">
                <span className="league-widget-digits">{pad(parts.hours)}</span>
                <span className="league-widget-label">h</span>
              </div>
              <span className="league-widget-sep">:</span>
              <div className="league-widget-unit">
                <span className="league-widget-digits">{pad(parts.minutes)}</span>
                <span className="league-widget-label">m</span>
              </div>
              <span className="league-widget-sep">:</span>
              <div className="league-widget-unit">
                <span className="league-widget-digits">{pad(parts.seconds)}</span>
                <span className="league-widget-label">s</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
