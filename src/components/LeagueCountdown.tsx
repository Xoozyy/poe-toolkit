import { useEffect, useMemo, useState } from 'react';
import type { LeagueInfo } from '../types';

interface Props {
  league: LeagueInfo | null;
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function splitRemaining(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

export function LeagueCountdown({ league }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startMs = league?.startMs ?? null;
  const remaining = startMs != null ? startMs - now : 0;
  const live = league?.live || (startMs != null && remaining <= 0);
  const parts = useMemo(() => splitRemaining(remaining), [remaining]);

  const localStart = useMemo(() => {
    if (startMs == null) return null;
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(startMs));
  }, [startMs]);

  if (!league) return null;

  return (
    <section className={`league-banner${live ? ' is-live' : ''}`}>
      <div className="league-banner-copy">
        <p className="league-kicker">
          {live ? 'League live' : 'Next league'}
        </p>
        <h2 className="league-name">{league.nextName}</h2>
        <p className="league-meta">
          {live
            ? `Now active · was counting down from ${localStart ?? 'launch'}`
            : localStart
              ? `Launches ${localStart}`
              : 'Launch time TBD'}
          {!live && league.currentName
            ? ` · Current: ${league.currentName}`
            : null}
        </p>
      </div>

      {live ? (
        <div className="league-live-badge">LIVE</div>
      ) : (
        <div className="league-clock" aria-live="polite">
          <div className="league-unit">
            <span className="league-digits">{pad(parts.days)}</span>
            <span className="league-label">Days</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.hours)}</span>
            <span className="league-label">Hours</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.minutes)}</span>
            <span className="league-label">Mins</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.seconds)}</span>
            <span className="league-label">Secs</span>
          </div>
        </div>
      )}
    </section>
  );
}
