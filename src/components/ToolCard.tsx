import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ToolStatus } from '../types';
import { obscureSensitive } from '../lib/streamer';
import type { SortableBind } from './SortableGrid';

interface ToolCardProps {
  tool: ToolStatus;
  busy: boolean;
  mode?: 'active' | 'unused';
  streamerMode?: boolean;
  sortable?: SortableBind;
  moveTargets?: { id: string; name: string }[];
  onMoveToSection?: (sectionId: string) => void;
  onLaunch: () => void;
  onPick: () => void;
  onClear: () => void;
  onDownload: () => void;
  onDismiss: () => void;
  onHide: () => void;
  onRestore: () => void;
  onEdit?: () => void;
  onRemoveCustom?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
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
  moveTargets = [],
  onMoveToSection,
  onLaunch,
  onPick,
  onClear,
  onDownload,
  onDismiss,
  onHide,
  onRestore,
  onEdit,
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

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuPos) return;

    const close = () => setMenuPos(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: globalThis.MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuPos]);

  const menuItems: MenuItem[] = [];
  if (unused) {
    menuItems.push({ id: 'restore', label: 'Restore', onSelect: onRestore });
    if (tool.isCustom && onEdit) {
      menuItems.push({ id: 'edit', label: 'Edit…', onSelect: onEdit });
    }
    if (tool.isCustom && onRemoveCustom) {
      menuItems.push({
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: onRemoveCustom,
      });
    }
  } else {
    if (tool.isCustom && onEdit) {
      menuItems.push({ id: 'edit', label: 'Edit…', onSelect: onEdit });
    }
    if (!isLink) {
      menuItems.push({
        id: 'set-path',
        label: 'Set path…',
        disabled: busy,
        onSelect: onPick,
      });
      if ((tool.customPath || tool.isCustom) && tool.customPath) {
        menuItems.push({
          id: 'clear-path',
          label: 'Clear custom path',
          disabled: busy,
          onSelect: onClear,
        });
      }
    }
    if (tool.downloadUrl) {
      menuItems.push({
        id: 'download',
        label: 'Open download page',
        onSelect: onDownload,
      });
    }
    if (tool.showDownloadPrompt && tool.downloadUrl) {
      menuItems.push({
        id: 'dismiss-download',
        label: "Don't show download prompt",
        onSelect: onDismiss,
      });
    }
    if (onMoveToSection && moveTargets.length > 0) {
      for (const target of moveTargets) {
        menuItems.push({
          id: `move-${target.id}`,
          label: `Move to ${target.name}`,
          onSelect: () => onMoveToSection(target.id),
        });
      }
    }
    menuItems.push({
      id: 'hide',
      label: 'Move to Not in use',
      onSelect: onHide,
    });
    if (tool.isCustom && onRemoveCustom) {
      menuItems.push({
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: onRemoveCustom,
      });
    }
  }

  function openMenu(event: ReactMouseEvent) {
    if (menuItems.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pad = 8;
    const approxW = 200;
    const approxH = menuItems.length * 32 + 16;
    const x = Math.min(event.clientX, window.innerWidth - approxW - pad);
    const y = Math.min(event.clientY, window.innerHeight - approxH - pad);
    setMenuPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }

  return (
    <article
      className={`tool-card${tool.ready ? ' is-ready' : ''}${unused ? ' is-unused' : ''}${sortable ? ' is-sortable' : ''}${menuPos ? ' is-menu-open' : ''}`}
      onContextMenu={openMenu}
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

      {menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="card-context-menu"
            style={{ left: menuPos.x, top: menuPos.y }}
            role="menu"
            aria-label={`${tool.name} actions`}
          >
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`card-context-item${item.danger ? ' is-danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setMenuPos(null);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </article>
  );
}
