import type { Recommendation } from '../types';
import type { SortableBind } from './SortableGrid';

interface Props {
  item: Recommendation;
  mode?: 'active' | 'unused';
  sortable?: SortableBind;
  onDownload: () => void;
  onHide: () => void;
  onRestore: () => void;
}

export function RecommendationCard({
  item,
  mode = 'active',
  sortable,
  onDownload,
  onHide,
  onRestore,
}: Props) {
  const unused = mode === 'unused';

  return (
    <article className={`rec-card${unused ? ' is-unused' : ''}${sortable ? ' is-sortable' : ''}`}>
      {!unused && (
        <button
          type="button"
          className="card-corner-btn"
          title="Move to Not in use"
          aria-label={`Hide ${item.name}`}
          onClick={onHide}
        >
          ×
        </button>
      )}
      <h3 className="rec-name">{item.name}</h3>
      <p className="rec-summary">{item.summary}</p>
      {unused ? (
        <button type="button" className="btn btn-primary" onClick={onRestore}>
          Restore
        </button>
      ) : (
        <button type="button" className="btn btn-accent" onClick={onDownload}>
          Download page
        </button>
      )}
    </article>
  );
}
