"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { AnswerPayload } from "@/components/room/QuestionScreen";
import type { SanitisedQuestion } from "@/server/game/sanitize";

/** Long enough that a keystroke isn't sent letter by letter, short enough that the
 *  server always holds something recent when the timer expires — same tuning as
 *  OpenAnswerSurface, whose draft/commit shape this otherwise mirrors exactly. */
const DRAFT_DEBOUNCE_MS = 400;

/**
 * Numeric guess. What's in the field when time runs out IS the answer — same "no button, no
 * credit" discipline as free text — "Valider" locks it in and lets the room move on early.
 */
export function EstimationAnswerSurface({
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
  const [text, setText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function change(value: string) {
    setText(value);
    latest.current = value;
    if (committed || disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const n = Number(latest.current);
      if (latest.current.trim() !== "" && Number.isFinite(n)) onDraft({ value: n });
    }, DRAFT_DEBOUNCE_MS);
  }

  function commit() {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || committed) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    onSubmit({ value: n });
  }

  const locked = disabled || committed;
  const n = Number(text);
  const validNumber = text.trim() !== "" && Number.isFinite(n);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <Input
            type="number"
            inputMode="decimal"
            value={text}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            disabled={locked}
            placeholder="Votre estimation…"
            className="w-full"
            autoFocus
          />
        </div>
        <Button disabled={locked || !validNumber} onClick={commit}>
          Valider
        </Button>
      </div>
      {question.estimationUnit && (
        <p className="text-12 text-ink-faint">Unité : {question.estimationUnit}</p>
      )}
    </div>
  );
}
