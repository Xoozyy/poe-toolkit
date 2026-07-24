import {
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';

const DRAG_MIME = 'application/x-poe-toolkit-sort';
/** Pointer must travel this far before the snap line jumps */
const SNAP_MOVE_PX = 28;
/** Stickier than 50% so grazing a card edge doesn't flip the insert side */
const SLOT_EDGE_RATIO = 0.62;

export interface SortMovePayload {
  fromGroupId: string;
  toGroupId: string;
  itemId: string;
  beforeId: string | null;
}

interface Props {
  ids: string[];
  groupId?: string;
  onReorder: (ids: string[]) => void;
  onMove?: (payload: SortMovePayload) => void;
  className?: string;
  emptyLabel?: string;
  children: (id: string, bind: SortableBind) => ReactNode;
}

export interface SortableBind {
  itemProps: {
    draggable: true;
    onDragStart: (event: DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    className: string;
    title: string;
  };
}

type ActiveDrag = { id: string; groupId: string };

type SnapEdge = {
  targetId: string;
  edge: 'before' | 'after';
};

let activeDrag: ActiveDrag | null = null;
const dragListeners = new Set<() => void>();

function setActiveDrag(next: ActiveDrag | null, notify = true) {
  activeDrag = next;
  if (!notify) return;
  for (const listener of dragListeners) listener();
}

function useActiveDrag() {
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const listener = () => bump((n) => n + 1);
    dragListeners.add(listener);
    return () => {
      dragListeners.delete(listener);
    };
  }, []);
  return activeDrag;
}

function reorderToIndex(list: string[], fromId: string, toIndex: number): string[] {
  const next = [...list];
  const from = next.indexOf(fromId);
  if (from < 0) return list;
  next.splice(from, 1);
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, fromId);
  return next;
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, input, textarea, select, label'));
}

function setCardDragImage(event: DragEvent, root: HTMLElement) {
  const card = root.querySelector('.tool-card, .rec-card');
  if (!(card instanceof HTMLElement)) return;

  const rect = card.getBoundingClientRect();
  const clone = card.cloneNode(true) as HTMLElement;
  clone.classList.add('is-drag-preview');
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.position = 'fixed';
  clone.style.top = '-1000px';
  clone.style.left = '-1000px';
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '9999';
  document.body.appendChild(clone);

  const offsetX = Math.min(Math.max(event.clientX - rect.left, 16), rect.width - 16);
  const offsetY = Math.min(Math.max(event.clientY - rect.top, 16), rect.height - 16);
  event.dataTransfer.setDragImage(clone, offsetX, offsetY);

  window.setTimeout(() => {
    clone.remove();
  }, 0);
}

function readDragPayload(event: DragEvent): { id: string; groupId: string } | null {
  if (activeDrag) return activeDrag;
  const raw =
    event.dataTransfer.getData(DRAG_MIME) ||
    event.dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; groupId?: string };
    if (parsed && typeof parsed.id === 'string') {
      return {
        id: parsed.id,
        groupId: typeof parsed.groupId === 'string' ? parsed.groupId : '',
      };
    }
  } catch {
    // plain id fallback
  }
  return { id: raw, groupId: '' };
}

function insertIndexFromPoint(
  clientX: number,
  clientY: number,
  order: string[],
  slots: Map<string, DOMRect>,
  excludeId?: string,
): number {
  const filtered = order.filter((id) => id !== excludeId);
  const entries = filtered
    .map((id) => {
      const rect = slots.get(id);
      if (!rect) return null;
      return { id, rect };
    })
    .filter(Boolean) as { id: string; rect: DOMRect }[];

  if (entries.length === 0) return 0;

  let best = entries[0];
  let bestScore = Number.POSITIVE_INFINITY;
  let insideBest = false;
  for (const entry of entries) {
    const { rect } = entry;
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside) {
      best = entry;
      insideBest = true;
      bestScore = -1;
      break;
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const score = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (score < bestScore) {
      best = entry;
      bestScore = score;
      insideBest = false;
    }
  }

  const filteredIndex = filtered.indexOf(best.id);
  if (filteredIndex < 0) return 0;

  // Dropping onto a card = take that card's place (displace it toward the
  // gap you came from). Fixes "drag 2 onto 3" feeling like a no-op.
  if (insideBest && excludeId) {
    const from = order.indexOf(excludeId);
    const target = order.indexOf(best.id);
    if (from >= 0 && target >= 0) {
      if (from < target) return filteredIndex + 1;
      if (from > target) return filteredIndex;
    }
  }

  const { rect } = best;
  const after =
    clientY > rect.top + rect.height * SLOT_EDGE_RATIO ||
    (clientY >= rect.top &&
      clientY <= rect.bottom &&
      clientX > rect.left + rect.width * SLOT_EDGE_RATIO);

  return after ? filteredIndex + 1 : filteredIndex;
}

function snapFromIndex(
  order: string[],
  insertIndex: number,
  excludeId?: string,
): SnapEdge | null {
  const others = order.filter((id) => id !== excludeId);
  if (others.length === 0) return null;
  if (insertIndex <= 0) {
    return { targetId: others[0], edge: 'before' };
  }
  if (insertIndex >= others.length) {
    return { targetId: others[others.length - 1], edge: 'after' };
  }
  // Line on the trailing edge of the card you're inserting after
  return { targetId: others[insertIndex - 1], edge: 'after' };
}

/** insertIndex is relative to the list AFTER removing the dragged id */
function samePosition(
  order: string[],
  fromId: string,
  insertIndex: number,
): boolean {
  const from = order.indexOf(fromId);
  if (from < 0) return false;
  return insertIndex === from;
}

export function SortableGrid({
  ids,
  groupId = '',
  onReorder,
  onMove,
  className,
  emptyLabel = 'Drop apps here',
  children,
}: Props) {
  const drag = useActiveDrag();
  const [snap, setSnap] = useState<SnapEdge | null>(null);
  const [overEmpty, setOverEmpty] = useState(false);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const pendingIndexRef = useRef<number | null>(null);
  const committedIndexRef = useRef<number | null>(null);
  const commitPointRef = useRef<{ x: number; y: number } | null>(null);

  const localDragging = Boolean(drag && drag.groupId === groupId);
  const foreignDragging = Boolean(drag && drag.groupId !== groupId);
  const showEmptyDrop = Boolean(
    drag && (ids.length === 0 || (foreignDragging && overEmpty && ids.length === 0)),
  );

  function clearHover() {
    setSnap(null);
    setOverEmpty(false);
    pendingIndexRef.current = null;
    committedIndexRef.current = null;
    commitPointRef.current = null;
  }

  function measureSlots() {
    const slots = new Map<string, DOMRect>();
    for (const id of ids) {
      const el = itemRefs.current.get(id);
      if (el) slots.set(id, el.getBoundingClientRect());
    }
    return slots;
  }

  function commitSnap(nextIndex: number, clientX: number, clientY: number) {
    committedIndexRef.current = nextIndex;
    commitPointRef.current = { x: clientX, y: clientY };
    const excludeId =
      activeDrag && activeDrag.groupId === groupId ? activeDrag.id : undefined;
    if (
      excludeId &&
      samePosition(ids, excludeId, nextIndex)
    ) {
      setSnap(null);
      return;
    }
    setSnap(snapFromIndex(ids, nextIndex, excludeId));
  }

  function updateInsertFromPoint(clientX: number, clientY: number) {
    const current = activeDrag;
    if (!current) return;

    if (!drag) setActiveDrag(current, true);

    if (ids.length === 0) {
      pendingIndexRef.current = 0;
      committedIndexRef.current = 0;
      setOverEmpty(true);
      setSnap(null);
      return;
    }

    setOverEmpty(false);
    const excludeId = current.groupId === groupId ? current.id : undefined;
    const nextIndex = insertIndexFromPoint(
      clientX,
      clientY,
      ids,
      measureSlots(),
      excludeId,
    );
    pendingIndexRef.current = nextIndex;

    if (committedIndexRef.current === nextIndex) return;

    const origin = commitPointRef.current;
    if (origin) {
      const moved = Math.hypot(clientX - origin.x, clientY - origin.y);
      if (moved < SNAP_MOVE_PX) return;
    }

    commitSnap(nextIndex, clientX, clientY);
  }

  function applyDrop(fromId: string, fromGroupId: string) {
    const index = pendingIndexRef.current ?? committedIndexRef.current;
    clearHover();
    setActiveDrag(null);
    if (!fromId) return;

    if (fromGroupId && groupId && fromGroupId !== groupId && onMove) {
      const others = ids;
      const beforeId =
        index == null || index >= others.length ? null : others[index] || null;
      onMove({
        fromGroupId,
        toGroupId: groupId,
        itemId: fromId,
        beforeId,
      });
      return;
    }

    if (fromGroupId === groupId && ids.includes(fromId) && index != null) {
      if (samePosition(ids, fromId, index)) return;
      onReorder(reorderToIndex(ids, fromId, index));
    }
  }

  return (
    <div
      className={`sortable-grid${drag ? ' is-sorting' : ''}${showEmptyDrop || (foreignDragging && snap) ? ' is-drop-target' : ''} ${className || ''}`.trim()}
      onDragOver={(event) => {
        if (!activeDrag) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        updateInsertFromPoint(event.clientX, event.clientY);
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (
          related instanceof Node &&
          event.currentTarget.contains(related)
        ) {
          return;
        }
        clearHover();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const payload = readDragPayload(event);
        if (!payload) return;
        applyDrop(payload.id, payload.groupId || groupId);
      }}
    >
      {ids.length === 0 ? (
        <div className={`sortable-empty${showEmptyDrop ? ' is-active' : ''}`}>
          {emptyLabel}
        </div>
      ) : (
        ids.map((id) => {
          const isDraggingItem = drag?.id === id;
          const isSnapTarget = snap?.targetId === id;
          const bind: SortableBind = {
            itemProps: {
              draggable: true,
              title: 'Drag to reorder',
              className: [
                'sortable-item',
                isDraggingItem ? 'is-dragging' : '',
                isSnapTarget && snap?.edge === 'before' ? 'is-snap-before' : '',
                isSnapTarget && snap?.edge === 'after' ? 'is-snap-after' : '',
                localDragging && !isDraggingItem ? 'is-sorting-peer' : '',
              ]
                .filter(Boolean)
                .join(' '),
              onDragStart: (event) => {
                if (isInteractiveTarget(event.target)) {
                  event.preventDefault();
                  return;
                }
                const startIndex = ids.indexOf(id);
                pendingIndexRef.current = startIndex;
                committedIndexRef.current = startIndex;
                commitPointRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                };
                setActiveDrag({ id, groupId }, false);
                event.dataTransfer.effectAllowed = 'move';
                const payload = JSON.stringify({ id, groupId });
                event.dataTransfer.setData(DRAG_MIME, payload);
                event.dataTransfer.setData('text/plain', payload);
                setCardDragImage(event, event.currentTarget as HTMLElement);
                window.requestAnimationFrame(() => {
                  if (!activeDrag || activeDrag.id !== id) return;
                  setActiveDrag({ id, groupId }, true);
                });
              },
              onDragEnd: () => {
                clearHover();
                setActiveDrag(null);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                updateInsertFromPoint(event.clientX, event.clientY);
              },
              onDragLeave: () => undefined,
              onDrop: (event) => {
                event.preventDefault();
                event.stopPropagation();
                const payload = readDragPayload(event);
                if (!payload) {
                  clearHover();
                  setActiveDrag(null);
                  return;
                }
                applyDrop(payload.id, payload.groupId || groupId);
              },
            },
          };

          return (
            <div
              key={id}
              ref={(el) => {
                if (el) itemRefs.current.set(id, el);
                else itemRefs.current.delete(id);
              }}
              {...bind.itemProps}
            >
              {children(id, bind)}
            </div>
          );
        })
      )}
    </div>
  );
}
