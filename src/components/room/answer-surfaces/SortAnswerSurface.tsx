"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DragSortList } from "@/components/ui/DragSortList";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedQuestion, SanitisedSortItem } from "@/server/game/sanitize";

/**
 * Drag-drop-order the items into the sequence the prompt asks for. Same philosophy as every
 * other surface: what's on screen when time runs out IS the answer — every reorder sends a
 * draft, not just the final "Valider". `question.sortItems` arrives already shuffled
 * (sanitize.ts); this only ever reorders that starting arrangement, never re-shuffles it itself.
 */
export function SortAnswerSurface({
  question,
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  question: SanitisedQuestion;
  disabled: boolean;
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  const [order, setOrder] = useState<SanitisedSortItem[]>(question.sortItems ?? []);

  // A fresh shuffled order arrives with every new question — QuestionScreen never remounts
  // this component between two consecutive sort questions (no key does that), so without this
  // the previous question's dragged-into order would still be showing.
  useEffect(() => {
    setOrder(question.sortItems ?? []);
  }, [question.id, question.sortItems]);

  function reorder(next: SanitisedSortItem[]) {
    if (disabled || committed) return;
    setOrder(next);
    onDraft({ order: next.map((i) => i.id) });
  }

  function commit() {
    if (disabled || committed) return;
    onSubmit({ order: order.map((i) => i.id) });
  }

  const locked = disabled || committed;

  return (
    <div className="flex flex-col gap-3">
      <DragSortList
        items={order}
        getId={(item) => item.id}
        onReorder={reorder}
        disabled={locked}
        renderItem={(item) => (
          <div className="flex items-center gap-3 py-1.5">
            {item.mediaId && (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated /media/[id] route, not an optimizable static asset
              <img
                src={`/media/${item.mediaId}`}
                alt=""
                className="h-12 w-12 shrink-0 rounded-sm object-cover"
              />
            )}
            <span className="text-16 text-ink-high">{item.label}</span>
          </div>
        )}
      />
      <Button disabled={locked} onClick={commit}>
        {committed ? "Réponse verrouillée" : "Valider"}
      </Button>
    </div>
  );
}
