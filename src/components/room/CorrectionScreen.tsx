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
 * awards the points.
 *
 * Marks are a scale, not a yes/no: a question is worth its difficulty tier at full
 * marks, and the host can give 1 of 3 or 2 of 5 for an answer that is partly
 * right. The grader's yes/no still pre-fills every row — on a 40-question round
 * that is the difference between confirming a screenful and making 240 rulings
 * from a blank slate — but it can only ever suggest all or nothing, which is
 * exactly why the slider exists.
 *
 * Everyone sees the same screen and the same live values; only the host can
 * change them. That is enforced on the server too — `correction:set` rejects a
 * non-host and clamps against the question's own tier, so a player cannot mark
 * their own answer correct or claim five points on a one-point question.
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
  const { maxPoints } = payload;

  function award(userId: string, awarded: number) {
    if (!isHost) return;
    socket.emit("correction:set", { code, position: payload.position, userId, awarded });
  }

  const answers = [...payload.answers].sort((a, b) => a.msTaken - b.msTaken);
  const isLast = payload.position + 1 === payload.total;

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
          <div className="flex items-center gap-2">
            <DifficultyBadge
              level={Math.min(5, Math.max(1, payload.difficulty)) as 1 | 2 | 3 | 4 | 5}
            />
            <span className="rounded-sm border border-gold-deep bg-gold-deep/20 px-2 py-1 font-numeral text-12 tabular-nums text-gold">
              {maxPoints} {maxPoints > 1 ? "points" : "point"}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-moss-deep bg-moss-deep/15 px-4 py-3">
          <p className="text-12 uppercase tracking-wide text-ink-faint">Réponse attendue</p>
          <p className="font-display text-18 text-moss-glow">{payload.correct}</p>
          {payload.explanation && (
            <p className="mt-1 text-14 text-ink-mid">{payload.explanation}</p>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {answers.map((a) => {
            const full = a.awarded >= maxPoints && maxPoints > 0;
            const none = a.awarded === 0;
            return (
              <li
                key={a.userId}
                className="flex flex-col gap-2 rounded-md border border-border-soft bg-bg-inset px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-24 text-14 font-medium text-ink-high">
                    {a.displayName}
                  </span>
                  <span className="flex-1 text-16 text-ink-mid">
                    {a.text ? `« ${a.text} »` : a.iso3 ? `carte : ${a.iso3}` : "— pas de réponse"}
                  </span>
                  <span className="font-numeral text-12 tabular-nums text-ink-faint">
                    {(a.msTaken / 1000).toFixed(1)}s
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* One-click shortcuts alongside the slider: most rulings are all or
                   *  nothing, and dragging to an endpoint 240 times would be miserable. */}
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => award(a.userId, 0)}
                    className={cn(
                      "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                      none
                        ? "border-clay-deep bg-clay text-bg-void"
                        : "border-border-hard bg-bg-surface text-ink-faint",
                      isHost && !none && "hover:bg-bg-raised",
                      !isHost && "cursor-default",
                    )}
                  >
                    0
                  </button>

                  {maxPoints > 1 && (
                    <input
                      type="range"
                      min={0}
                      max={maxPoints}
                      step={1}
                      value={a.awarded}
                      disabled={!isHost}
                      aria-label={`Points pour ${a.displayName}, sur ${maxPoints}`}
                      onChange={(e) => award(a.userId, Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-bg-surface accent-gold disabled:cursor-default"
                    />
                  )}

                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => award(a.userId, maxPoints)}
                    className={cn(
                      "rounded-sm border px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                      full
                        ? "border-moss-deep bg-moss text-bg-void"
                        : "border-border-hard bg-bg-surface text-ink-faint",
                      isHost && !full && "hover:bg-bg-raised",
                      !isHost && "cursor-default",
                    )}
                  >
                    {maxPoints}
                  </button>

                  <span
                    className={cn(
                      "min-w-14 text-right font-numeral text-14 tabular-nums",
                      none ? "text-clay-soft" : full ? "text-moss-glow" : "text-gold",
                    )}
                  >
                    {a.awarded} / {maxPoints}
                  </span>

                  {a.awarded !== a.suggested && (
                    <span className="text-12 text-gold">corrigé à la main</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {isHost ? (
          <Button onClick={() => socket.emit("correction:next", { code })}>
            {isLast ? "Terminer et voir le podium" : "Question suivante"}
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
