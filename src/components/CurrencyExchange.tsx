import { useEffect, useRef, useState } from 'react';
import type { CurrencyExchangeRate, CurrencyPairRate } from '../types';
import chaosIcon from '../assets/currency/chaos.png';
import divineIcon from '../assets/currency/divine.png';
import mirrorIcon from '../assets/currency/mirror.png';
import hinekorasLockIcon from '../assets/currency/hinekoras-lock.png';

const CURRENCY_ICONS: Record<string, string> = {
  chaos: chaosIcon,
  divine: divineIcon,
  mirror: mirrorIcon,
  'hinekoras-lock': hinekorasLockIcon,
};

interface Props {
  data: CurrencyExchangeRate | null;
  loading?: boolean;
  onOpen?: (url: string) => void;
}

function formatWhen(iso: string | undefined) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatRate(rate: number) {
  if (rate >= 100) {
    return rate.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (rate >= 10) {
    return rate.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  if (rate >= 1) {
    return rate.toLocaleString(undefined, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 0,
    });
  }
  return rate.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  });
}

function shortLabel(label: string) {
  if (label === "Hinekora's Lock") return 'Lock';
  return label;
}

function fallbackPageUrl(league: string, game: 'poe1' | 'poe2' = 'poe1') {
  const slug = encodeURIComponent(
    String(league || 'standard')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ''),
  );
  return `https://poe.ninja/${game}/economy/${slug}/currency`;
}

function CurrencyIcon({ id }: { id: string }) {
  const src = CURRENCY_ICONS[id];
  if (!src) return null;
  return (
    <img className="currency-icon" src={src} alt="" aria-hidden="true" />
  );
}

function RateRow({ pair }: { pair: CurrencyPairRate }) {
  if (pair.rate == null) {
    return (
      <span className="currency-rate is-missing" title={pair.error || 'Unavailable'}>
        <span className="currency-label">{shortLabel(pair.leftLabel)}</span>
        <span className="currency-eq">=</span>
        <span className="currency-label">?</span>
      </span>
    );
  }

  const title = `1 ${pair.leftLabel} = ${formatRate(pair.rate)} ${pair.rightLabel}`;

  return (
    <span className="currency-rate" title={title}>
      <span className="currency-value">1</span>
      <CurrencyIcon id={pair.leftId} />
      <span className="currency-label">{shortLabel(pair.leftLabel)}</span>
      <span className="currency-eq">=</span>
      <span className="currency-value">{formatRate(pair.rate)}</span>
      <CurrencyIcon id={pair.rightId} />
      <span className="currency-label">{shortLabel(pair.rightLabel)}</span>
    </span>
  );
}

export function CurrencyExchange({ data, loading, onOpen }: Props) {
  const rates = data?.rates ?? [];
  const error = data && !data.ok ? data.error : null;
  const when = formatWhen(data?.fetchedAt);
  const league = data?.league ?? 'Standard';
  const game = data?.game === 'poe2' ? 'poe2' : 'poe1';
  const pageUrl = data?.pageUrl || fallbackPageUrl(league, game);
  const clickable = Boolean(onOpen && pageUrl);
  const hasRates = rates.some((pair) => pair.rate != null);
  const ratesRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ratesRef.current;
    if (!el) {
      setOverflowing(false);
      return;
    }

    const update = () => {
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    el.addEventListener('load', update, true);
    const frames = [
      window.requestAnimationFrame(update),
      window.setTimeout(update, 50),
      window.setTimeout(update, 250),
    ];
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      el.removeEventListener('load', update, true);
      window.cancelAnimationFrame(frames[0]);
      window.clearTimeout(frames[1]);
      window.clearTimeout(frames[2]);
    };
  }, [rates, loading, hasRates]);

  const inner = (
    <div className="currency-bar-inner">
      <div className="currency-bar-label">
        <p className="currency-kicker">
          poe.ninja · {league}
          {clickable ? ' · Open' : ''}
          {when ? ` · ${when}` : ''}
        </p>
        <h2 className="currency-heading">Currency Exchange</h2>
      </div>

      {loading && !hasRates ? (
        <p className="currency-status muted">Loading…</p>
      ) : error && !hasRates ? (
        <p className="currency-status muted">{error}</p>
      ) : rates.length === 0 ? (
        <p className="currency-status muted">No rates available.</p>
      ) : (
        <div
          ref={ratesRef}
          className={`currency-rates${overflowing ? ' is-overflowing' : ''}`}
          aria-label="Exchange rates"
        >
          {rates.map((pair, index) => (
            <span key={pair.id} className="currency-rate-slot">
              {index > 0 ? (
                <span className="currency-rate-sep" aria-hidden>
                  |
                </span>
              ) : null}
              <RateRow pair={pair} />
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className="currency-bar is-clickable"
        onClick={() => onOpen?.(pageUrl)}
        title={`Open ${league} currency on poe.ninja`}
      >
        {inner}
      </button>
    );
  }

  return <footer className="currency-bar">{inner}</footer>;
}
