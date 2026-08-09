"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedChoice } from "@/server/game/sanitize";

const UNDO_WINDOW_MS = 1500;
const KEY_LABELS = ["1", "2", "3", "4", "5", "6"];

export function McqAnswerSurface({
  choices,
  multiSelect,
  disabled,
  onSubmit,
}: {
  choices: SanitisedChoice[];
  multiSelect: boolean;
  disabled: boolean;
  onSubmit: (payload: AnswerPayload) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Keyboard shortcuts 1-6 / A-F — brief §4.8.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (disabled) return;
      const byNumber = KEY_LABELS.indexOf(e.key);
      const byLetter = "abcdef".indexOf(e.key.toLowerCase());
      const index = byNumber >= 0 ? byNumber : byLetter;
      if (index >= 0 && index < choices.length) {
        pick(choices[index]!.id);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pick` is stable enough for this; re-binding per selection isn't needed
  }, [disabled, choices]);

  function pick(id: string) {
    if (disabled) return;
    if (multiSelect) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
      return;
    }
    // Single-select: press-and-lock with a 1.5s "annuler" undo window — brief §6.2.
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingId(id);
    timerRef.current = setTimeout(() => onSubmit({ choiceIds: [id] }), UNDO_WINDOW_MS);
  }

  function cancelPending() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {multiSelect && <Badge tone="gold">Plusieurs réponses</Badge>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {choices.map((choice, i) => {
          const isSelected = multiSelect ? selected.includes(choice.id) : pendingId === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => pick(choice.id)}
              className={cn(
                "btn-physical flex items-center gap-2 rounded-md border px-4 py-3 text-left text-16 transition-colors duration-150",
                isSelected
                  ? "border-gold-deep border-b-[3px] bg-gold text-bg-void"
                  : "border-border-hard bg-bg-inset text-ink-high hover:bg-bg-surface disabled:opacity-50",
              )}
            >
              <span className="font-numeral text-12 opacity-60">{KEY_LABELS[i]}</span>
              {choice.label}
            </button>
          );
        })}
      </div>
      {!multiSelect && pendingId && (
        <Button variant="ghost" size="sm" onClick={cancelPending} className="self-start">
          Annuler
        </Button>
      )}
      {multiSelect && (
        <Button
          disabled={disabled || selected.length === 0}
          onClick={() => onSubmit({ choiceIds: selected })}
        >
          Valider
        </Button>
      )}
    </div>
  );
}
