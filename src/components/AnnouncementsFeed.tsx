import type { AnnouncementItem, AnnouncementsResult } from '../types';

interface Props {
  feed: AnnouncementsResult | null;
  loading?: boolean;
  onOpen: (item: AnnouncementItem) => void;
  onRefresh: () => void;
}

function formatWhen(iso: string | null) {
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

function AnnouncementRow({
  item,
  highlight,
  onOpen,
}: {
  item: AnnouncementItem;
  highlight: boolean;
  onOpen: (item: AnnouncementItem) => void;
}) {
  const when = formatWhen(item.time);
  return (
    <button
      type="button"
      className={`announce-item${highlight ? ' is-unread-latest' : ''}`}
      onClick={() => onOpen(item)}
    >
      {highlight ? <span className="announce-unread-ring" aria-hidden /> : null}
      <div className="announce-item-inner">
        <div className="announce-item-top">
          <span className="announce-title">{item.title}</span>
          {when ? <span className="announce-when">{when}</span> : null}
        </div>
        <p className="announce-meta">
          {item.poster}
          {item.excerpt ? ` · ${item.excerpt}` : ''}
        </p>
      </div>
    </button>
  );
}

export function AnnouncementsFeed({
  feed,
  loading,
  onOpen,
  onRefresh,
}: Props) {
  const items = feed?.items ?? [];
  const error = feed && !feed.ok ? feed.error : null;
  const highlightId = feed?.highlightId ?? null;

  return (
    <section className="announce-panel">
      <div className="announce-header">
        <div>
          <p className="announce-kicker">Forum · Announcements</p>
          <h2 className="announce-heading">Latest from GGG</h2>
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

      {loading && items.length === 0 ? (
        <p className="announce-status muted">Loading announcements…</p>
      ) : error && items.length === 0 ? (
        <p className="announce-status muted">{error}</p>
      ) : items.length === 0 ? (
        <p className="announce-status muted">No recent announcements.</p>
      ) : (
        <div className="announce-list">
          {items.map((item) => (
            <AnnouncementRow
              key={item.id}
              item={item}
              highlight={highlightId === item.id}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
