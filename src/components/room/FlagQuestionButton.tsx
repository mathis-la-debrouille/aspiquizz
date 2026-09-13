"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { flagQuestionAction } from "@/server/questions/flag-actions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { FLAG_REASON_MAX, FLAG_TAGS, composeFlagReason } from "@/lib/flags";
import { cn } from "@/lib/utils/cn";

/**
 * The report control. Any player can raise a question they think is wrong or disputable; it
 * lands in `question_flags` for the admin review queue and never affects the game — no score
 * change, no skip, nothing the other players see.
 *
 * Two modes, because the two screens it sits on have opposite constraints:
 *
 * - `quick` (question screen): one tap, no dialog. The clock is running; stopping to type a
 *   reason costs the player the question, and a dialog would cover the prompt they're
 *   reading.
 * - `detailed` (correction screen, end-of-game recap): opens a dialog with reason tags and a
 *   comment. This is where a report is actually informed — the answer is on screen — and
 *   where it can be explained. Reports filed with one tap arrive with no reason at all, which
 *   left the admin guessing what "signalée" was about. On a question already reported, the
 *   dialog adds the explanation to the existing report rather than filing a second one.
 *
 * `flagged` is owned by the room, not by this component: the same question appears on the
 * question screen, then the correction screen, then the recap, and each is a fresh mount.
 */
export function FlagQuestionButton({
  questionId,
  roomCode,
  flagged,
  onFlagged,
  mode = "quick",
  showLabel = false,
  size = "md",
}: {
  questionId: string;
  /** The public 6-char join code. Resolved to the DB room id server-side —
   *  never send one where the other is expected (see CLAUDE.md). */
  roomCode?: string | null;
  flagged: boolean;
  onFlagged: (questionId: string) => void;
  mode?: "quick" | "detailed";
  /** Text next to the icon. Off on the question screen (it sits beside the timer) and in the
   *  recap table; on for the correction screen, where it has room and needs to be found. */
  showLabel?: boolean;
  /** `sm` for the recap table rows. Explicit rather than a className override: `cn` is plain
   *  clsx, so a passed "h-8" would sit next to "h-10" and whichever Tailwind emits last wins. */
  size?: "md" | "sm";
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const { push } = useToast();

  function send(reason: string | null) {
    startTransition(async () => {
      const result = await flagQuestionAction({
        questionId,
        roomCode: roomCode ?? null,
        reason,
      });
      if (!result.ok) {
        push(result.error, "error");
        return;
      }
      onFlagged(questionId);
      setOpen(false);
      setTags([]);
      setComment("");
      push(
        reason && flagged
          ? "Précision ajoutée au signalement"
          : "Signalement pris en compte — la question sera relue",
        "success",
      );
    });
  }

  function onButtonClick() {
    if (isPending) return;
    if (mode === "detailed") {
      setOpen(true);
      return;
    }
    if (!flagged) send(null);
  }

  const reason = composeFlagReason(tags, comment);
  // A first report needs nothing more than the click. A follow-up on an existing report is only
  // worth sending if it says something.
  const canSend = !isPending && (!flagged || reason !== null);

  const label = flagged
    ? mode === "detailed"
      ? "Question signalée — préciser le signalement"
      : "Question signalée — elle sera relue après la partie"
    : "Signaler cette question (erreur ou réponse contestable). Sans effet sur la partie.";

  return (
    <>
      <button
        type="button"
        onClick={onButtonClick}
        disabled={isPending || (mode === "quick" && flagged)}
        aria-label={showLabel ? undefined : label}
        aria-pressed={flagged}
        title={label}
        className={cn(
          // 40px minimum on the question screen: the old ~28px target in the corner of the
          // screen, mid-question, was reported as "hard to click" and it was.
          "flex items-center justify-center gap-2 rounded-md border transition-colors duration-150",
          showLabel ? "h-9 px-3 text-12 font-medium" : size === "sm" ? "h-8 w-8" : "h-10 w-10",
          flagged
            ? "border-clay-deep bg-clay text-bg-void"
            : "border-border-hard bg-bg-inset text-ink-faint hover:bg-bg-surface hover:text-ink-mid",
          flagged && mode === "quick" && "cursor-default",
          isPending && "opacity-60",
        )}
      >
        <Flag
          aria-hidden="true"
          strokeWidth={1.5}
          className={showLabel || size === "sm" ? "h-4 w-4" : "h-5 w-5"}
          fill={flagged ? "currentColor" : "none"}
        />
        {showLabel && <span>{flagged ? "Signalée" : "Signaler"}</span>}
      </button>

      {/* Mounted only while open: the recap renders one of these per question, and forty idle
       *  <dialog> elements in a table would be forty for nothing. */}
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={flagged ? "Préciser le signalement" : "Signaler cette question"}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" disabled={!canSend} onClick={() => send(reason)}>
                {isPending ? "Envoi…" : flagged ? "Ajouter" : "Signaler"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-14 text-ink-mid">
              {flagged
                ? "Vous avez déjà signalé cette question. Dites ce qui ne va pas pour aider la relecture."
                : "Sans effet sur les points de la partie. Un admin relira la question."}
            </p>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Type de problème">
              {FLAG_TAGS.map((tag) => {
                const on = tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTags((prev) => (on ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-12 transition-colors duration-150",
                      on
                        ? "border-gold-deep bg-gold-deep/25 text-gold"
                        : "border-border-hard bg-bg-inset text-ink-mid hover:bg-bg-surface",
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>

            <Textarea
              label="Commentaire (facultatif)"
              placeholder="Par exemple : la bonne réponse est…"
              rows={3}
              maxLength={FLAG_REASON_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
