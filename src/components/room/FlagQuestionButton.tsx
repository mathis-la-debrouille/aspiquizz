"use client";

import { useState, useTransition } from "react";
import { flagQuestionAction } from "@/server/questions/flag-actions";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";

/**
 * Report control, top-right of the question screen. Any player can raise a
 * question they think is wrong or disputable; it lands in `question_flags` for a
 * later review pass, and never affects the round in progress — no score change,
 * no skip, nothing the other players can see. Reporting mid-question would
 * otherwise be a way to signal "this one's hard" to the room.
 *
 * Deliberately not an emoji: CLAUDE.md forbids emoji-as-icons, so this is an
 * inline SVG flag sized to sit next to the Timer.
 */
export function FlagQuestionButton({
  questionId,
  roomCode,
}: {
  questionId: string;
  /** The public 6-char join code. Resolved to the DB room id server-side —
   *  never send one where the other is expected (see CLAUDE.md). */
  roomCode?: string | null;
}) {
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { push } = useToast();

  function raise() {
    if (flagged || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await flagQuestionAction({ questionId, roomCode: roomCode ?? null });
      // alreadyFlagged is a success: the row exists, which is all the player wanted.
      if (result.ok) {
        setFlagged(true);
        // Said out loud, because the only feedback used to be the icon filling in — a 28px
        // icon, at the far corner of the screen, on a question you are still answering.
        push("Signalement pris en compte — la question sera relue après la partie", "success");
      } else {
        setError(result.error);
        push(result.error, "error");
      }
    });
  }

  const label = flagged
    ? "Question signalée — elle sera relue après la partie"
    : "Signaler cette question (erreur ou réponse contestable). Sans effet sur la partie en cours.";

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={raise}
        disabled={flagged || isPending}
        aria-label={label}
        aria-pressed={flagged}
        title={label}
        className={cn(
          // 40px minimum: the old p-1.5 around a 16px icon gave a ~28px target, in the corner
          // of the screen, mid-question. It was reported as "hard to click" and it was.
          "group flex h-10 w-10 items-center justify-center rounded-md border transition-colors duration-150",
          flagged
            ? "cursor-default border-clay-deep bg-clay text-bg-void"
            : "border-border-hard bg-bg-inset text-ink-faint hover:bg-bg-surface hover:text-ink-mid",
          isPending && "opacity-60",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill={flagged ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 2v12" />
          <path d="M3.5 2.5h7.2l-1.1 2.6 1.1 2.6H3.5z" />
        </svg>
      </button>
      {error && (
        <span role="alert" className="ml-2 text-12 text-clay-glow">
          {error}
        </span>
      )}
    </div>
  );
}
