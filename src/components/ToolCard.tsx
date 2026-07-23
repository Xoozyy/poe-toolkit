import type { ToolStatus } from '../types';
import { obscureSensitive } from '../lib/streamer';
import type { SortableBind } from './SortableGrid';

interface ToolCardProps {
  tool: ToolStatus;
  busy: boolean;
  mode?: 'active' | 'unused';
  streamerMode?: boolean;
  sortable?: SortableBind;
  onLaunch: () => void;
  onPick: () => void;
  onClear: () => void;
  onDownload: () => void;
  onDismiss: () => void;
  onHide: () => void;
  onRestore: () => void;
  onRemoveCustom?: () => void;
}

function statusLabel(tool: ToolStatus): string {
  if (tool.isLink) return 'Website';
  if (tool.ready) {
    return tool.source === 'custom' || tool.isCustom ? 'Custom path' : 'Ready';
  }
  return 'Not found';
}

export function ToolCard({
  tool,
  busy,
  mode = 'active',
  streamerMode = false,
  sortable,
  onLaunch,
  onPick,
  onClear,
  onDownload,
  onDismiss,
  onHide,
  onRestore,
  onRemoveCustom,
}: ToolCardProps) {
  const unused = mode === 'unused';
  const isLink = Boolean(tool.isLink);
  const rawPath =
    tool.resolvedPath ??
    (isLink ? 'No website URL set' : 'No executable path set');
  const hasRealPath = Boolean(tool.resolvedPath);
  const displayPath =
    streamerMode && hasRealPath
      ? obscureSensitive(tool.resolvedPath, isLink ? 'url' : 'path')
      : rawPath;
  const pathTitle =
    streamerMode || !hasRealPath ? undefined : tool.resolvedPath ?? undefined;

  return (
    <article
      className={`tool-card${tool.ready ? ' is-ready' : ''}${unused ? ' is-unused' : ''}${sortable ? ' is-sortable' : ''}`}
    >
      {!unused && (
        <button
          type="button"
          className="card-corner-btn"
          title="Move to Not in use"
          aria-label={`Hide ${tool.name}`}
          onClick={onHide}
        >
          ×
        </button>
      )}

      <div className="tool-card-head">
        <h3 className="tool-name">{tool.name}</h3>
        <span
          className={`status-pill${tool.ready ? ' status-ok' : ' status-missing'}`}
        >
          {statusLabel(tool)}
        </span>
      </div>

      <p className="tool-blurb">
        {tool.blurb}
        {tool.isCustom ? (isLink ? ' · Link' : ' · Custom') : ''}
        {unused ? ` · From ${tool.categoryLabel}` : ''}
      </p>

      <p className="tool-path" title={pathTitle}>
        {displayPath}
      </p>

      {unused ? (
        <div className="tool-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRestore}
          >
            Restore
          </button>
          {tool.isCustom && onRemoveCustom && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onRemoveCustom}
            >
              Delete
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="tool-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onLaunch}
              disabled={!tool.ready || busy}
            >
              {busy ? 'Working…' : isLink ? 'Open' : 'Launch'}
            </button>
            {!isLink && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onPick}
                disabled={busy}
              >
                Set path
              </button>
            )}
            {!isLink && (tool.customPath || tool.isCustom) && tool.customPath && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClear}
                disabled={busy}
              >
                Clear
              </button>
            )}
          </div>

          {tool.showDownloadPrompt && tool.downloadUrl && (
            <div className="download-prompt">
              <p>Not installed? Grab it from the official download page.</p>
              <div className="tool-actions">
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={onDownload}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onDismiss}
                >
                  Don&apos;t show again
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
