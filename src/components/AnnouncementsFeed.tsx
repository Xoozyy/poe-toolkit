import { useEffect, useMemo, useState } from 'react';
import type { AnnouncementItem, AnnouncementsResult } from '../types';

interface Props {
  feed: AnnouncementsResult | null;
  loading?: boolean;
  density?: 'compact' | 'normal';
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
  showExcerpt,
  onOpen,
}: {
  item: AnnouncementItem;
  highlight: boolean;
  showExcerpt: boolean;
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
        {showExcerpt ? (
          <p className="announce-meta">
            {item.poster}
            {item.excerpt ? ` · ${item.excerpt}` : ''}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function AnnouncementsFeed({
  feed,
  loading,
  density = 'compact',
  onOpen,
  onRefresh,
}: Props) {
  const compact = density === 'compact';
  const [expanded, setExpanded] = useState(!compact);
  const items = feed?.items ?? [];
  const error = feed && !feed.ok ? feed.error : null;
  const highlightId = feed?.highlightId ?? null;

  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);

  const NORMAL_LIMIT = 3;

  const { primary, rest } = useMemo(() => {
    if (items.length === 0) return { primary: null, rest: [] as AnnouncementItem[] };
    const highlightIndex = highlightId
      ? items.findIndex((item) => item.id === highlightId)
      : -1;
    const primaryIndex = highlightIndex >= 0 ? highlightIndex : 0;
    const primaryItem = items[primaryIndex];
    const restItems = items.filter((_, index) => index !== primaryIndex);
    return { primary: primaryItem, rest: restItems };
  }, [items, highlightId]);

  const visibleRest = compact
    ? expanded
      ? rest
      : []
    : rest.slice(0, Math.max(0, NORMAL_LIMIT - 1));
  const hiddenCount = compact && !expanded ? rest.length : 0;

  return (
    <section
      className={`announce-panel${compact ? ' is-compact' : ' is-normal'}${expanded ? ' is-expanded' : ''}`}
    >
      <div className="announce-header">
        <div>
          <p className="announce-kicker">
            {compact ? 'GGG announcements' : 'Forum · Announcements'}
          </p>
          {!compact ? (
            <h2 className="announce-heading">Latest from GGG</h2>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost announce-refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p className="announce-status muted">Loading…</p>
      ) : error && items.length === 0 ? (
        <p className="announce-status muted">{error}</p>
      ) : !primary ? (
        <p className="announce-status muted">No recent announcements.</p>
      ) : (
        <div className="announce-list">
          <AnnouncementRow
            item={primary}
            highlight={highlightId === primary.id}
            showExcerpt={!compact}
            onOpen={onOpen}
          />
          {visibleRest.map((item) => (
            <AnnouncementRow
              key={item.id}
              item={item}
              highlight={highlightId === item.id}
              showExcerpt={!compact}
              onOpen={onOpen}
            />
          ))}
          {compact && rest.length > 0 ? (
            <button
              type="button"
              className="announce-more"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Show less' : `${hiddenCount} more`}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
