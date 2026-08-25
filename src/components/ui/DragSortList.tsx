"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface DragSortListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number, dragging: boolean) => ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Hand-rolled drag-to-reorder, not a DnD library — this project has already rejected adding one
 * for a much smaller reordering need (admin category order, up/down buttons only — see
 * DECISIONS.md), and a live-game drag-drop-sort question is the first place actual dragging
 * earns its keep. Pointer Events, not the native HTML5 `draggable` attribute: that API has
 * poor/inconsistent touch support, and this has to work on a phone mid-game as much as a mouse.
 *
 * Swap/insert-based, not a continuous "make room" reflow: the dragged row's *own* position
 * tracks the pointer via `translateY` every frame, but the other rows only re-render at their
 * new slots once the drag has actually crossed enough of them to change the resulting order —
 * simpler to get right for lists this short (3-6 items) than animating every sibling out of the
 * way, and still reads as real drag-and-drop. Up/down buttons sit next to the drag handle as a
 * keyboard/no-pointer-drag fallback — the same reordering affordance the admin category list
 * already uses, so this never becomes drag-only.
 */
export function DragSortList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
  className,
}: DragSortListProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // Every row's vertical center at the moment the drag started — the fixed frame of reference
  // "which slot is the pointer over now" is measured against for the whole gesture, so a slot
  // that already moved (because an earlier crossing reordered it) doesn't itself shift the
  // comparison the next crossing is judged against.
  const startCentersRef = useRef(new Map<string, number>());
  const startYRef = useRef(0);

  const setRowRef = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) rowRefs.current.set(id, node);
      else rowRefs.current.delete(id);
    },
    [],
  );

  function handlePointerDown(id: string, e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    const centers = new Map<string, number>();
    for (const [rowId, node] of rowRefs.current) {
      const rect = node.getBoundingClientRect();
      centers.set(rowId, rect.top + rect.height / 2);
    }
    startCentersRef.current = centers;
    setDraggingId(id);
    setDragOffsetY(0);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    const offset = e.clientY - startYRef.current;
    setDragOffsetY(offset);

    const draggedStartCenter = startCentersRef.current.get(draggingId);
    const draggedItem = items.find((it) => getId(it) === draggingId);
    if (draggedStartCenter === undefined || !draggedItem) return;
    const draggedCurrentCenter = draggedStartCenter + offset;

    const others = items.filter((it) => getId(it) !== draggingId);
    let newIndex = 0;
    for (const other of others) {
      const otherCenter = startCentersRef.current.get(getId(other));
      if (otherCenter !== undefined && otherCenter < draggedCurrentCenter) newIndex++;
    }

    const next = [...others.slice(0, newIndex), draggedItem, ...others.slice(newIndex)];
    const changed = next.some((it, i) => getId(it) !== getId(items[i]!));
    if (changed) onReorder(next);
  }

  function endDrag() {
    setDraggingId(null);
    setDragOffsetY(0);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onReorder(next);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((item, index) => {
        const id = getId(item);
        const isDragging = draggingId === id;
        return (
          <div
            key={id}
            ref={setRowRef(id)}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border-hard bg-bg-inset",
              isDragging && "relative z-10 shadow-[var(--shadow-lift)]",
            )}
            style={isDragging ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
          >
            <button
              type="button"
              aria-label="Faire glisser pour réordonner"
              disabled={disabled}
              onPointerDown={(e) => handlePointerDown(id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="flex h-full shrink-0 cursor-grab items-center px-2 py-3 text-ink-faint active:cursor-grabbing disabled:cursor-not-allowed"
              style={{ touchAction: "none" }}
            >
              <GripVertical className="h-4 w-4" strokeWidth={1.5} />
            </button>

            <div className="min-w-0 flex-1">{renderItem(item, index, isDragging)}</div>

            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-label="Monter"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                className="p-0.5 text-ink-faint hover:text-ink-high disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Descendre"
                disabled={disabled || index === items.length - 1}
                onClick={() => move(index, 1)}
                className="p-0.5 text-ink-faint hover:text-ink-high disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
