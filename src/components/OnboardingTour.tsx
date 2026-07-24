import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export interface TourStep {
  id: string;
  /** Matches [data-tour="…"] */
  target: string;
  title: string;
  body: string;
}

interface Props {
  steps: TourStep[];
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureTarget(selector: string): SpotRect | null {
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const pad = 8;
  return {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
    height: Math.min(window.innerHeight - 16, rect.height + pad * 2),
  };
}

function cardPosition(spot: SpotRect | null): CSSProperties {
  if (!spot) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const cardW = 320;
  const gap = 14;
  const spaceRight = window.innerWidth - (spot.left + spot.width);
  const spaceBottom = window.innerHeight - (spot.top + spot.height);

  if (spaceRight > cardW + gap + 16) {
    return {
      top: Math.min(spot.top, window.innerHeight - 220),
      left: spot.left + spot.width + gap,
    };
  }
  if (spaceBottom > 200) {
    return {
      top: spot.top + spot.height + gap,
      left: Math.min(spot.left, window.innerWidth - cardW - 16),
    };
  }
  return {
    top: Math.max(16, spot.top - 180),
    left: Math.min(spot.left, window.innerWidth - cardW - 16),
  };
}

export function OnboardingTour({ steps, open, onComplete, onSkip }: Props) {
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [visible, setVisible] = useState(false);

  const step = steps[index] ?? null;
  const isLast = index >= steps.length - 1;

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setVisible(false);
      return;
    }
    setIndex(0);
    const id = window.setTimeout(() => setVisible(true), 280);
    return () => window.clearTimeout(id);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) {
      setSpot(null);
      return;
    }

    const update = () => setSpot(measureTarget(step.target));
    update();
    const id = window.setTimeout(update, 50);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step]);

  if (!open || !step || !visible) return null;

  return createPortal(
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {!spot && <div className="tour-dim" aria-hidden />}
      {spot && (
        <div
          className="tour-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden
        />
      )}
      <div key={step.id} className="tour-card" style={cardPosition(spot)}>
        <p className="tour-step">
          {index + 1} / {steps.length}
        </p>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            Skip
          </button>
          {!isLast ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onComplete}>
              Got it
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
