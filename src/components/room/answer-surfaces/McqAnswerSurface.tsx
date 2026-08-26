"use client";

import { useEffect } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedChoice } from "@/server/game/sanitize";

const KEY_LABELS = ["1", "2", "3", "4", "5", "6"];

/**
 * Tapping a choice selects it and sends a draft; tapping another one changes it. There is no
 * commit timer and no "Annuler".
 *
 * The previous version locked the answer in 1.5s after the tap and offered "Annuler" to abort
 * that. Two problems, both hit in a real game: pressing Annuler left the player with *no*
 * answer at all rather than back at "choose one", with nothing on screen saying so; and the
 * whole mechanic contradicted every other surface, where what is on screen when time runs out
 * is the answer. Selecting is now just selecting, which is also what a player expects a quiz
 * button to do.
 *
 * "Valider" stays, for both single and multi select — it's what makes the question end early
 * once everyone has committed, so removing it would force every question to burn its full timer.
 */
export function McqAnswerSurface({
  choices,
  multiSelect,
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  choices: SanitisedChoice[];
  multiSelect: boolean;
  disabled: boolean;
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const locked = disabled || committed;

  // Keyboard shortcuts 1-6 / A-F — brief §4.8.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (locked) return;
      const byNumber = KEY_LABELS.indexOf(e.key);
      const byLetter = "abcdef".indexOf(e.key.toLowerCase());
      const index = byNumber >= 0 ? byNumber : byLetter;
      if (index >= 0 && index < choices.length) pick(choices[index]!.id);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pick` closes over `selected`, which multi-select re-reads via the setter callback
  }, [locked, choices]);

  function pick(id: string) {
    if (locked) return;
    if (multiSelect) {
      setSelected((prev) => {
        const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
        onDraft({ choiceIds: next });
        return next;
      });
      return;
    }
    setSelected([id]);
    onDraft({ choiceIds: [id] });
  }

  return (
    <div className="flex flex-col gap-3">
      {multiSelect && <Badge tone="gold">Plusieurs réponses</Badge>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {choices.map((choice, i) => {
          const isSelected = selected.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              disabled={locked}
              aria-pressed={isSelected}
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
      <Button
        disabled={locked || selected.length === 0}
        onClick={() => onSubmit({ choiceIds: selected })}
      >
        {committed ? "Réponse verrouillée" : "Valider"}
      </Button>
    </div>
  );
}
