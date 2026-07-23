import type {
  PoeConnectionStatus,
  StashCurrencyValueResult,
} from '../types';
import chaosIcon from '../assets/currency/chaos.png';
import divineIcon from '../assets/currency/divine.png';

interface Props {
  status: PoeConnectionStatus | null;
  leagues: string[];
  selectedLeague: string;
  value: StashCurrencyValueResult | null;
  loading: boolean;
  onSelectLeague: (league: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
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

function formatNumber(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function StashValue({
  status,
  leagues,
  selectedLeague,
  value,
  loading,
  onSelectLeague,
  onRefresh,
  onOpenSettings,
}: Props) {
  if (!status?.connected) {
    return (
      <section className="stash-value-card stash-value-cta">
        <div>
          <p className="stash-value-kicker">Stash value</p>
          <p className="stash-value-cta-copy">
            Connect your PoE account to see how much your currency tabs are
            worth in Chaos and Divine Orbs.
          </p>
        </div>
        <button type="button" className="btn btn-accent" onClick={onOpenSettings}>
          Connect in Settings
        </button>
      </section>
    );
  }

  const error = value && !value.ok ? value.error : null;
  const when = formatWhen(value?.fetchedAt);
  const hasTotal = Boolean(value?.ok);

  return (
    <section className="stash-value-card">
      <div className="stash-value-head">
        <div>
          <p className="stash-value-kicker">
            Stash value · Connected as {status.accountName || 'your account'}
            {when ? ` · ${when}` : ''}
          </p>
          <h2 className="stash-value-heading">Currency tab value</h2>
        </div>
        <div className="stash-value-controls">
          <select
            className="settings-select stash-value-league-select"
            value={selectedLeague}
            disabled={leagues.length === 0}
            onChange={(event) => onSelectLeague(event.target.value)}
          >
            {leagues.length === 0 ? (
              <option value={selectedLeague}>
                {selectedLeague || 'No leagues found'}
              </option>
            ) : (
              leagues.map((league) => (
                <option key={league} value={league}>
                  {league}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading || !selectedLeague}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !hasTotal ? (
        <p className="stash-value-status muted">Loading…</p>
      ) : error ? (
        <p className="stash-value-status muted">{error}</p>
      ) : !value ? (
        <p className="stash-value-status muted">
          Pick a league and hit Refresh to fetch your currency tabs.
        </p>
      ) : (
        <div className="stash-value-body">
          <div className="stash-value-total">
            {value.totalDivine != null && (
              <span className="stash-value-amount">
                <img className="currency-icon" src={divineIcon} alt="" aria-hidden="true" />
                {formatNumber(value.totalDivine)}
              </span>
            )}
            <span className="stash-value-amount">
              <img className="currency-icon" src={chaosIcon} alt="" aria-hidden="true" />
              {formatNumber(
                value.totalDivine != null ? value.remainderChaos ?? 0 : value.totalChaos ?? 0,
              )}
            </span>
          </div>
          <p className="stash-value-meta">
            {value.tabCount ?? 0} currency tab{value.tabCount === 1 ? '' : 's'} ·{' '}
            {value.matchedItemCount ?? 0} item{value.matchedItemCount === 1 ? '' : 's'} priced
            {(value.skippedItemCount ?? 0) > 0 && (
              <>
                {' · '}
                <span
                  title={
                    value.skippedSample && value.skippedSample.length > 0
                      ? `Unpriced: ${value.skippedSample.join(', ')}`
                      : undefined
                  }
                >
                  {value.skippedItemCount} unpriced (skipped)
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
