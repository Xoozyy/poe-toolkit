import type { ToolStatus } from '../types';

interface ToolCardProps {
  tool: ToolStatus;
  busy: boolean;
  mode?: 'active' | 'unused';
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
  if (tool.ready) {
    return tool.source === 'custom' || tool.isCustom ? 'Custom path' : 'Ready';
  }
  return 'Not found';
}

export function ToolCard({
  tool,
  busy,
  mode = 'active',
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

  return (
    <article
      className={`tool-card${tool.ready ? ' is-ready' : ''}${unused ? ' is-unused' : ''}`}
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
        {tool.isCustom ? ' · Custom' : ''}
        {unused ? ` · From ${tool.categoryLabel}` : ''}
      </p>

      <p className="tool-path" title={tool.resolvedPath ?? undefined}>
        {tool.resolvedPath ?? 'No executable path set'}
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
              {busy ? 'Working…' : 'Launch'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onPick}
              disabled={busy}
            >
              Set path
            </button>
            {(tool.customPath || tool.isCustom) && tool.customPath && (
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
