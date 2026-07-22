import type { Recommendation } from '../types';

interface Props {
  item: Recommendation;
  mode?: 'active' | 'unused';
  onDownload: () => void;
  onHide: () => void;
  onRestore: () => void;
}

export function RecommendationCard({
  item,
  mode = 'active',
  onDownload,
  onHide,
  onRestore,
}: Props) {
  const unused = mode === 'unused';

  return (
    <article className={`rec-card${unused ? ' is-unused' : ''}`}>
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
