"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { AnswerPayload } from "@/components/room/QuestionScreen";

/**
 * Drafts are throttled, not debounced, and the difference is a real bug.
 *
 * A 400ms trailing debounce meant that changing your mind in the last 400ms of a question sent
 * nothing at all: the timer never fired, and the server graded the *previous* text. Rewriting an
 * answer at the last second silently kept the old one — which is exactly what happened in game.
 *
 * A throttle sends the first keystroke of a burst immediately and guarantees a trailing send, so
 * the server is never more than this far behind the field. The debounce existed because
 * `submittedAt` moved with every edit and speed used to score; speed no longer scores, so there
 * is nothing left to protect.
 */
const DRAFT_THROTTLE_MS = 120;

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
  const lastSentAt = useRef(0);

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

    // Sent even when empty: clearing the field is a decision. Skipping the empty case left the
    // server holding the answer you had just deleted, which then scored.
    const send = () => {
      lastSentAt.current = Date.now();
      onDraft({ text: latest.current.trim() });
    };

    const since = Date.now() - lastSentAt.current;
    if (since >= DRAFT_THROTTLE_MS) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      send();
      return;
    }
    // Inside the window: make sure the last keystroke of the burst still gets through.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(send, DRAFT_THROTTLE_MS - since);
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
    </div>
  );
}
