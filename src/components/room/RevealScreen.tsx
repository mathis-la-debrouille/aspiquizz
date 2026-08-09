"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ScoreTicker } from "@/components/ui/ScoreTicker";
import { StreakMeter } from "@/components/ui/StreakMeter";
import { cn } from "@/lib/utils/cn";
import type { QuestionRevealPayload, RoomStateView } from "@/server/socket/events";

export function RevealScreen({
  reveal,
  state,
  currentUserId,
}: {
  reveal: QuestionRevealPayload;
  state: RoomStateView;
  currentUserId: string;
}) {
  const me = reveal.perPlayer.find((p) => p.userId === currentUserId);
  const playersByUserId = new Map(state.players.map((p) => [p.userId, p]));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col items-center gap-3 p-6 text-center" elevation="lifted">
        <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Réponse</p>
        <h1 className="font-display text-34 text-moss-glow">{reveal.correct}</h1>
        {reveal.explanation && (
          <p className="max-w-prose text-14 text-ink-mid">{reveal.explanation}</p>
        )}
      </Card>

      {me && (
        <Card
          className={cn(
            "flex items-center justify-between gap-4 p-5",
            me.isCorrect ? "border-moss-deep" : "border-clay-deep",
          )}
        >
          <div className="flex items-center gap-3">
            {me.isCorrect ? (
              <CheckCircle2 strokeWidth={1.5} className="h-8 w-8 text-moss-glow" />
            ) : (
              <XCircle strokeWidth={1.5} className="h-8 w-8 text-clay-soft" />
            )}
            <div>
              <p className="text-16 font-medium text-ink-high">
                {me.isCorrect ? `+${me.pointsAwarded} points` : "0 point"}
              </p>
              <p className="text-12 text-ink-faint">{(me.msTaken / 1000).toFixed(1)}s</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StreakMeter streak={me.streak} />
            <ScoreTicker value={me.newScore} className="text-26 text-gold" />
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {reveal.perPlayer
          .sort((a, b) => b.newScore - a.newScore)
          .map((p) => {
            const player = playersByUserId.get(p.userId);
            if (!player) return null;
            return (
              <div
                key={p.userId}
                className="flex items-center gap-3 rounded-md border border-border-soft bg-bg-surface px-3 py-2"
              >
                <Avatar seed={player.avatarSeed} size="xs" />
                <span className="flex-1 truncate text-14 text-ink-high">{player.displayName}</span>
                {p.isCorrect ? (
                  <CheckCircle2 strokeWidth={1.5} className="h-4 w-4 text-moss-glow" />
                ) : (
                  <XCircle strokeWidth={1.5} className="h-4 w-4 text-clay-soft" />
                )}
                <span className="font-numeral text-12 tabular-nums text-ink-faint">
                  {p.newScore}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
