import { useEffect, useState } from 'react';

interface Props {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  isMaximized: boolean;
}

export function TitleBar({
  onMinimize,
  onMaximize,
  onClose,
  isMaximized,
}: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar-drag" onDoubleClick={onMaximize}>
        <span className="titlebar-mark">PoE</span>
        <div className="titlebar-copy">
          <span className="titlebar-title">Toolkit</span>
          <span className="titlebar-sub">Launcher</span>
        </div>
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          onClick={onMinimize}
          aria-label="Minimize"
          title="Minimize"
        >
          <span className="titlebar-icon titlebar-icon-min" aria-hidden />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={onMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <span
            className={`titlebar-icon ${isMaximized ? 'titlebar-icon-restore' : 'titlebar-icon-max'}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          data-tour="tray"
        >
          <span className="titlebar-icon titlebar-icon-close" aria-hidden />
        </button>
      </div>
    </header>
  );
}

export function useWindowChrome(api: {
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximized?: (cb: (maximized: boolean) => void) => () => void;
} | null) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    void api.windowIsMaximized().then(setMaximized);
    const unsub = api.onWindowMaximized?.(setMaximized);
    return () => {
      unsub?.();
    };
  }, [api]);

  return {
    maximized,
    minimize: () => {
      void api?.windowMinimize();
    },
    maximize: () => {
      void api?.windowMaximize();
    },
    close: () => {
      void api?.windowClose();
    },
  };
}
