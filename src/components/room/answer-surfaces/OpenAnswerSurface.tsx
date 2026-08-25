"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { AnswerPayload } from "@/components/room/QuestionScreen";

/** Long enough that a word isn't sent letter by letter, short enough that the
 *  server always holds something recent when the timer expires. */
const DRAFT_DEBOUNCE_MS = 400;

/**
 * Free-text answer. What you have typed when time runs out IS your answer —
 * pressing a button is not what makes it count. Every edit is sent as a draft, so
 * the server always holds the latest text, and the timer expiring grades that.
 *
 * "Valider" still exists, and still matters: committing locks the answer in and is
 * the only thing that lets the room move on before the clock does. It's a "I'm
 * done, go" button rather than the price of being counted at all.
 */
export function OpenAnswerSurface({
  disabled,
  committed,
  onSubmit,
  onDraft,
}: {
  disabled: boolean;
  /** True once this player has committed — the field locks, drafts stop. */
  committed: boolean;
  onSubmit: (payload: AnswerPayload) => void;
  onDraft: (payload: AnswerPayload) => void;
}) {
  const [text, setText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");

  // Clear the pending draft timer on unmount, and on the way to the next question:
  // firing a stale draft after the question changed would attach this text to the
  // wrong position.
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
      const draft = latest.current.trim();
      if (draft) onDraft({ text: draft });
    }, DRAFT_DEBOUNCE_MS);
  }

  function commit() {
    if (!text.trim() || committed) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    onSubmit({ text: text.trim() });
  }

  const locked = disabled || committed;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-2">
        {/* The flex-1 has to sit on a wrapper, not on <Input>: Input forwards its
         *  className to the inner <input> while wrapping it in a plain flex-col div,
         *  so `<Input className="flex-1">` never stretched anything and the field came
         *  out barely wide enough for a short city name — long answers like
         *  "Sri Jayawardenepura Kotte" were cut off mid-word while typing. */}
        <div className="min-w-0 flex-1">
          <Input
            value={text}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            disabled={locked}
            placeholder="Votre réponse…"
            className="w-full"
            autoFocus
          />
        </div>
        <Button disabled={locked || !text.trim()} onClick={commit}>
          Valider
        </Button>
      </div>
      {!locked && (
        <p className="text-12 text-ink-faint">
          Pas besoin de valider — ce qui est écrit à la fin du temps compte. Valider fait
          simplement avancer le tour plus vite.
        </p>
      )}
    </div>
  );
}
