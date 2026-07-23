import type { CurrencyExchangeRate } from '../types';

interface Props {
  data: CurrencyExchangeRate | null;
  loading?: boolean;
  onRefresh: () => void;
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

export function CurrencyExchange({ data, loading, onRefresh }: Props) {
  const rate = data?.chaosPerDivine ?? null;
  const error = data && !data.ok ? data.error : null;
  const when = formatWhen(data?.fetchedAt);
  const league = data?.league ?? 'Standard';

  return (
    <section className="currency-panel">
      <div className="currency-header">
        <div>
          <p className="currency-kicker">poe.ninja · {league}</p>
          <h2 className="currency-heading">Currency Exchange Rate</h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && rate == null ? (
        <p className="currency-status muted">Loading exchange rate…</p>
      ) : error && rate == null ? (
        <p className="currency-status muted">{error}</p>
      ) : rate == null ? (
        <p className="currency-status muted">No exchange rate available.</p>
      ) : (
        <div className="currency-rate">
          <span className="currency-value">1</span>
          {data?.divineIconUrl ? (
            <img
              className="currency-icon"
              src={data.divineIconUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <span className="currency-label">Divine Orb</span>
          <span className="currency-eq">=</span>
          <span className="currency-value">
            {rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
          {data?.chaosIconUrl ? (
            <img
              className="currency-icon"
              src={data.chaosIconUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <span className="currency-label">Chaos Orbs</span>
          {when ? <span className="currency-when">Updated {when}</span> : null}
        </div>
      )}
    </section>
  );
}
