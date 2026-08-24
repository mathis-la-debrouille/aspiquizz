"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DifficultyBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { GameSocket } from "@/lib/socket/client";
import type { CorrectionShowPayload } from "@/server/socket/events";

/**
 * The correction round. The run is over; now the room goes through the questions
 * one at a time, sees the accepted answer and what everyone typed, and the host
 * rules on each. Points are awarded from these rulings, not from the grader.
 *
 * Toggles are pre-filled with the grader's verdict and marked as such. On a
 * 40-question round that is the difference between confirming a screenful and
 * making every decision from scratch — but a human always has the last word,
 * which is the whole reason this phase exists.
 *
 * Everyone sees the same screen and the same live toggles; only the host can
 * click. That is enforced on the server too — `correction:set` rejects a
 * non-host, so a player cannot mark their own answer correct.
 */
export function CorrectionScreen({
  socket,
  code,
  payload,
  isHost,
}: {
  socket: GameSocket;
  code: string;
  payload: CorrectionShowPayload;
  isHost: boolean;
}) {
  function rule(userId: string, verdict: boolean) {
    if (!isHost) return;
    socket.emit("correction:set", { code, position: payload.position, userId, verdict });
  }

  const answers = [...payload.answers].sort((a, b) => a.msTaken - b.msTaken);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-14 font-medium text-gold">Correction</span>
        <span className="font-numeral text-14 tabular-nums text-ink-faint">
          {payload.position + 1} / {payload.total}
        </span>
      </div>

      <Card className="flex flex-col gap-4 p-6" elevation="lifted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-22 text-ink-high">{payload.prompt}</h1>
          <DifficultyBadge level={Math.min(5, Math.max(1, payload.difficulty)) as 1 | 2 | 3 | 4 | 5} />
        </div>

        <div className="rounded-md border border-moss-deep bg-moss-deep/15 px-4 py-3">
          <p className="text-12 uppercase tracking-wide text-ink-faint">Réponse attendue</p>
          <p className="font-display text-18 text-moss-glow">{payload.correct}</p>
          {payload.explanation && (
            <p className="mt-1 text-14 text-ink-mid">{payload.explanation}</p>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {answers.map((a) => (
            <li
              key={a.userId}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border-soft bg-bg-inset px-3 py-2"
            >
              <span className="min-w-24 text-14 font-medium text-ink-high">{a.displayName}</span>
              <span className="flex-1 text-16 text-ink-mid">
                {a.text ? `« ${a.text} »` : a.iso3 ? `carte : ${a.iso3}` : "— pas de réponse"}
              </span>
              <span className="font-numeral text-12 tabular-nums text-ink-faint">
                {(a.msTaken / 1000).toFixed(1)}s
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={a.verdict}
                  disabled={!isHost}
                  onClick={() => rule(a.userId, true)}
                  className={cn(
                    "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                    a.verdict
                      ? "border-moss-deep bg-moss text-bg-void"
                      : "border-border-hard bg-bg-surface text-ink-faint",
                    isHost && !a.verdict && "hover:bg-bg-raised",
                    !isHost && "cursor-default",
                  )}
                >
                  Juste
                </button>
                <button
                  type="button"
                  aria-pressed={!a.verdict}
                  disabled={!isHost}
                  onClick={() => rule(a.userId, false)}
                  className={cn(
                    "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                    !a.verdict
                      ? "border-clay-deep bg-clay text-bg-void"
                      : "border-border-hard bg-bg-surface text-ink-faint",
                    isHost && a.verdict && "hover:bg-bg-raised",
                    !isHost && "cursor-default",
                  )}
                >
                  Faux
                </button>
              </div>
              {a.verdict !== a.suggested && (
                <span className="text-12 text-gold">corrigé à la main</span>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <Button onClick={() => socket.emit("correction:next", { code })}>
            {payload.position + 1 === payload.total ? "Terminer et voir le podium" : "Question suivante"}
          </Button>
        ) : (
          <p className="text-14 text-ink-faint" role="status">
            L&apos;hôte corrige — les points sont attribués à la fin de chaque question.
          </p>
        )}
      </Card>
    </div>
  );
}
