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

    const load = () => {
      void api
        .getLeague('poe1')
        .then((info) => {
          if (!cancelled) setLeague(info);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        });
    };

    load();
    const poll = window.setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [api]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startMs = league?.startMs ?? null;
  const remaining = startMs != null ? startMs - now : 0;
  const schedulePassed = startMs != null && remaining <= 0;
  const stage = league?.stage ?? 'countdown';
  const isLogin = stage === 'login' || (stage === 'countdown' && schedulePassed);
  const isCurrent = stage === 'current' && !isLogin;
  const parts = useMemo(() => splitRemaining(remaining), [remaining]);
  const copy = isLogin ? league?.loginCopy : null;

  function closeWidget() {
    void api?.closeLeagueWidget();
  }

  return (
    <div
      className={`league-widget${isLogin ? ' is-live is-login' : ''}${isCurrent ? ' is-live' : ''}`}
    >
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
            {isLogin
              ? copy?.kicker || 'League live'
              : isCurrent
                ? 'Current league'
                : 'Next league'}
          </p>
          <h1 className="league-widget-name">
            {isLogin
              ? copy?.headline || 'LOGIN!'
              : isCurrent
                ? league.currentName || league.nextName
                : league.nextName}
          </h1>
          {isLogin ? (
            <>
              <p className="league-widget-meta">{league.nextName}</p>
              <div className="league-widget-live">
                {copy?.badge || 'LOGIN'}
              </div>
            </>
          ) : isCurrent ? (
            <>
              <p className="league-widget-meta">
                {league.nextName
                  ? `Next: ${league.nextName}`
                  : 'Challenge league in progress'}
              </p>
              <div className="league-widget-live">LIVE</div>
            </>
          ) : startMs != null ? (
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
          ) : (
            <div className="league-widget-live">TBD</div>
          )}
        </>
      )}
    </div>
  );
}
