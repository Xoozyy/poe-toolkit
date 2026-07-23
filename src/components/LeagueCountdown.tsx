import { useEffect, useMemo, useState } from 'react';
import type { LeagueInfo } from '../types';
import { pad, splitRemaining } from '../lib/countdown';

interface Props {
  league: LeagueInfo | null;
  density?: 'compact' | 'normal';
  onOpenWidget?: () => void;
  onLaunchGame?: () => void;
}

export function LeagueCountdown({
  league,
  density = 'compact',
  onOpenWidget,
  onLaunchGame,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const normal = density === 'normal';

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
  const isCountdown = !isLogin && !isCurrent;
  const parts = useMemo(() => splitRemaining(remaining), [remaining]);
  const canOpenWidget =
    Boolean(onOpenWidget) && isCountdown && startMs != null && !schedulePassed;
  const canLaunchGame = Boolean(onLaunchGame) && (isLogin || isCurrent);
  const clickable = canOpenWidget || canLaunchGame;

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

  const copy = isLogin ? league.loginCopy : null;
  const reasonHint =
    league.launchReason === 'preview'
      ? 'Preview mode'
      : league.launchReason === 'poe.ninja'
        ? 'Seen on poe.ninja'
        : league.launchReason === 'schedule'
          ? 'Launch time reached'
          : null;

  const className = [
    'league-banner',
    isLogin ? 'is-live is-login' : '',
    isCurrent ? 'is-live is-current' : '',
    clickable ? 'is-clickable' : '',
    normal ? 'is-normal' : 'is-compact',
  ]
    .filter(Boolean)
    .join(' ');

  let kickerHint = '';
  if (canOpenWidget) kickerHint = normal ? ' · Click for widget' : ' · Widget';
  else if (canLaunchGame) {
    kickerHint = normal
      ? ` · Click to launch ${league.game === 'poe2' ? 'PoE2' : 'PoE'}`
      : ' · Launch';
  }

  const displayName = isCurrent
    ? league.currentName || league.nextName
    : league.nextName;

  const content = (
    <>
      <div className="league-banner-copy">
        <p className="league-kicker">
          {isLogin
            ? copy?.kicker || 'League is live'
            : isCurrent
              ? 'Current league'
              : 'Next league'}
          {kickerHint}
        </p>
        <h2 className="league-name">
          {isLogin ? copy?.headline || 'LOGIN!' : displayName}
        </h2>
        <p className="league-meta">
          {isLogin ? (
            <>
              <span className="league-meta-name">{league.nextName}</span>
              {copy?.meta
                ? ` · ${copy.meta.replace(`${league.nextName} is live · `, '')}`
                : ''}
              {reasonHint ? ` · ${reasonHint}` : ''}
            </>
          ) : isCurrent ? (
            <>
              {league.nextName
                ? `Next: ${league.nextName}${localStart ? ` · ${localStart}` : ' · date TBD'}`
                : 'Challenge league in progress'}
              {reasonHint ? ` · ${reasonHint}` : ''}
            </>
          ) : (
            <>
              {localStart ? `Launches ${localStart}` : 'Launch time TBD'}
              {league.currentName ? ` · Current: ${league.currentName}` : null}
            </>
          )}
        </p>
      </div>

      {isLogin ? (
        <div className="league-login-badge" aria-hidden>
          <span className="league-login-badge-text">
            {copy?.badge || 'LOGIN'}
          </span>
        </div>
      ) : isCurrent ? (
        <div className="league-live-badge" aria-hidden>
          <span className="league-live-badge-text">LIVE</span>
        </div>
      ) : startMs != null ? (
        <div className="league-clock" aria-live="polite">
          <div className="league-unit">
            <span className="league-digits">{pad(parts.days)}</span>
            <span className="league-label">{normal ? 'Days' : 'd'}</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.hours)}</span>
            <span className="league-label">{normal ? 'Hours' : 'h'}</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.minutes)}</span>
            <span className="league-label">{normal ? 'Mins' : 'm'}</span>
          </div>
          <span className="league-sep">:</span>
          <div className="league-unit">
            <span className="league-digits">{pad(parts.seconds)}</span>
            <span className="league-label">{normal ? 'Secs' : 's'}</span>
          </div>
        </div>
      ) : (
        <div className="league-live-badge league-tbd-badge" aria-hidden>
          <span className="league-live-badge-text">TBD</span>
        </div>
      )}
    </>
  );

  if (!clickable) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={canLaunchGame ? onLaunchGame : onOpenWidget}
      title={
        canLaunchGame
          ? league.game === 'poe2'
            ? 'Launch Path of Exile 2'
            : 'Launch Path of Exile'
          : 'Open desktop countdown widget'
      }
    >
      {content}
    </button>
  );
}
