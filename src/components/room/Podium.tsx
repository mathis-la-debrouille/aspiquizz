"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { RoomFinishedPayload, RoomStateView } from "@/server/socket/events";

const PLATFORM_HEIGHTS: Record<number, string> = { 1: "h-32", 2: "h-24", 3: "h-16" };
const PLATFORM_ORDER = [2, 1, 3]; // visual left-to-right: 2nd, 1st, 3rd
const STAGGER_ORDER: Record<number, number> = { 3: 0, 2: 1, 1: 2 }; // rise 3rd -> 2nd -> 1st

export function Podium({ payload }: { payload: RoomFinishedPayload; state: RoomStateView }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const podiumByRank = new Map(payload.podium.map((p) => [p.rank, p]));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-center font-display text-34 text-ink-high">Partie terminée</h1>

      <div className="flex items-end justify-center gap-4">
        {PLATFORM_ORDER.map((rank) => {
          const entry = podiumByRank.get(rank);
          if (!entry) return null;
          return (
            <motion.div
              key={rank}
              initial={reducedMotion ? undefined : { y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: STAGGER_ORDER[rank]! * 0.15,
                duration: 0.3,
                ease: [0.2, 0.8, 0.2, 1],
              }}
              className="flex flex-col items-center gap-2"
            >
              <Avatar seed={entry.avatarSeed} size={rank === 1 ? "xl" : "lg"} />
              <p className="max-w-[8rem] truncate text-14 font-medium text-ink-high">
                {entry.displayName}
              </p>
              <p className="font-numeral text-16 tabular-nums text-gold">{entry.score}</p>
              <div
                className={`flex w-24 items-start justify-center rounded-t-md border border-border-hard bg-bg-raised pt-2 ${PLATFORM_HEIGHTS[rank]}`}
              >
                <span className="font-display text-26 text-gold">{rank}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {payload.fullScoreboard.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center gap-3 rounded-md border border-border-soft bg-bg-surface px-4 py-2"
          >
            <span className="font-numeral w-6 text-14 text-ink-faint">{entry.rank}</span>
            <span className="font-numeral text-14 tabular-nums text-gold">{entry.score} pts</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <Button onClick={() => router.push("/accueil")}>Retour à l&apos;accueil</Button>
      </div>
    </div>
  );
}
