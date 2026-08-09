"use client";

import { motion } from "motion/react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ScoreTicker } from "@/components/ui/ScoreTicker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { RoomStateView, ScoreboardEntry } from "@/server/socket/events";

export function ScoreboardScreen({
  entries,
  state,
}: {
  entries: ScoreboardEntry[];
  state: RoomStateView;
}) {
  const reducedMotion = useReducedMotion();
  const playersByUserId = new Map(state.players.map((p) => [p.userId, p]));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-26 text-ink-high">Classement</h1>
      <div className="flex flex-col gap-2">
        {entries.map((entry) => {
          const player = playersByUserId.get(entry.userId);
          if (!player) return null;
          return (
            <motion.div
              key={entry.userId}
              layout={!reducedMotion}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex items-center gap-3 rounded-md border border-border-soft bg-bg-surface px-4 py-3"
            >
              <span className="font-numeral w-6 text-16 text-ink-faint">{entry.rank}</span>
              <Avatar seed={player.avatarSeed} size="sm" />
              <span className="flex-1 truncate text-16 text-ink-high">{player.displayName}</span>
              {entry.streak >= 2 && <Badge tone="gold">série ×{entry.streak}</Badge>}
              <ScoreTicker value={entry.score} className="text-20 text-gold" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
