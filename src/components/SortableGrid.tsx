import { useState, type DragEvent, type ReactNode } from 'react';

interface Props {
  ids: string[];
  onReorder: (ids: string[]) => void;
  className?: string;
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

function reorder(list: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return list;
  const next = [...list];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from < 0 || to < 0) return list;
  next.splice(from, 1);
  next.splice(to, 0, fromId);
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

export function SortableGrid({ ids, onReorder, className, children }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <div className={`sortable-grid${draggingId ? ' is-sorting' : ''} ${className || ''}`.trim()}>
      {ids.map((id) => {
        const bind: SortableBind = {
          itemProps: {
            draggable: true,
            title: 'Drag to reorder',
            className: [
              'sortable-item',
              draggingId === id ? 'is-dragging' : '',
              overId === id && draggingId && draggingId !== id
                ? 'is-drop-target'
                : '',
            ]
              .filter(Boolean)
              .join(' '),
            onDragStart: (event) => {
              if (isInteractiveTarget(event.target)) {
                event.preventDefault();
                return;
              }
              setDraggingId(id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
              setCardDragImage(event, event.currentTarget as HTMLElement);
            },
            onDragEnd: () => {
              setDraggingId(null);
              setOverId(null);
            },
            onDragOver: (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (overId !== id) setOverId(id);
            },
            onDragLeave: (event) => {
              const related = event.relatedTarget;
              if (
                related instanceof Node &&
                event.currentTarget.contains(related)
              ) {
                return;
              }
              if (overId === id) setOverId(null);
            },
            onDrop: (event) => {
              event.preventDefault();
              const fromId =
                event.dataTransfer.getData('text/plain') || draggingId;
              setDraggingId(null);
              setOverId(null);
              if (!fromId || fromId === id) return;
              onReorder(reorder(ids, fromId, id));
            },
          },
        };

        return (
          <div key={id} {...bind.itemProps}>
            {children(id, bind)}
          </div>
        );
      })}
    </div>
  );
}
