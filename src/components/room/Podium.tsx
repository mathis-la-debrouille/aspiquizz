"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSfx } from "@/lib/sound/useSfx";
import type { RoomFinishedPayload, RoomStateView } from "@/server/socket/events";

const PLATFORM_HEIGHTS: Record<number, string> = { 1: "h-32", 2: "h-24", 3: "h-16" };
const PLATFORM_ORDER = [2, 1, 3]; // visual left-to-right: 2nd, 1st, 3rd
const STAGGER_ORDER: Record<number, number> = { 3: 0, 2: 1, 1: 2 }; // rise 3rd -> 2nd -> 1st

export function Podium({
  payload,
  state,
}: {
  payload: RoomFinishedPayload;
  state: RoomStateView;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const playSfx = useSfx();
  const podiumByRank = new Map(payload.podium.map((p) => [p.rank, p]));
  const playersByUserId = new Map(state.players.map((p) => [p.userId, p]));
  // The between-questions scoreboard only shows every SCOREBOARD_INTERVAL-th question now, so
  // this is the one place left to see the full per-question record — one lookup per (question,
  // player) cell rather than re-scanning answerLog per cell render.
  const answerByCell = useMemo(() => {
    const map = new Map<string, RoomFinishedPayload["answerLog"][number]>();
    for (const a of payload.answerLog) map.set(`${a.position}-${a.userId}`, a);
    return map;
  }, [payload.answerLog]);

  useEffect(() => {
    playSfx("podium");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per Podium mount, i.e. once per finished game
  }, []);

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

      {payload.highlights.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-gold-deep/60 bg-gold-deep/10 p-4">
          <p className="flex items-center gap-2 text-12 tracking-[0.08em] text-gold-soft uppercase">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            Faits marquants
          </p>
          {payload.highlights.map((h, i) => (
            <p key={i} className="text-14 text-ink-high">
              {h}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {payload.fullScoreboard.map((entry) => {
          const player = playersByUserId.get(entry.userId);
          return (
            <div
              key={entry.userId}
              className="flex items-center gap-3 rounded-md border border-border-soft bg-bg-surface px-4 py-2"
            >
              <span className="font-numeral w-6 text-14 text-ink-faint">{entry.rank}</span>
              {player && <Avatar seed={player.avatarSeed} size="xs" />}
              <span className="flex-1 truncate text-14 text-ink-high">
                {player?.displayName ?? "?"}
              </span>
              <span className="font-numeral text-14 tabular-nums text-gold">{entry.score} pts</span>
            </div>
          );
        })}
      </div>

      {payload.questionHistory.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Détail par question</p>
          <div className="overflow-x-auto rounded-md border border-border-soft">
            <table className="w-full border-collapse text-14">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="sticky left-0 z-10 bg-bg-surface px-3 py-2 text-left text-12 font-medium text-ink-faint">
                    Question
                  </th>
                  {payload.fullScoreboard.map((entry) => {
                    const player = playersByUserId.get(entry.userId);
                    return (
                      <th
                        key={entry.userId}
                        scope="col"
                        className="px-2 py-2 text-center text-12 font-medium text-ink-faint"
                      >
                        <div className="flex flex-col items-center gap-1">
                          {player && <Avatar seed={player.avatarSeed} size="xs" />}
                          <span className="max-w-[4.5rem] truncate">
                            {player?.displayName ?? "?"}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {payload.questionHistory.map((q) => (
                  <tr key={q.position} className="border-t border-border-soft">
                    <td className="sticky left-0 z-10 max-w-[16rem] truncate bg-bg-base px-3 py-2 text-left text-ink-mid">
                      <span className="text-ink-faint">{q.position + 1}.</span> {q.prompt}
                    </td>
                    {payload.fullScoreboard.map((entry) => {
                      const a = answerByCell.get(`${q.position}-${entry.userId}`);
                      return (
                        <td key={entry.userId} className="px-2 py-2 text-center">
                          {a ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {a.isCorrect ? (
                                <CheckCircle2
                                  aria-label="Correct"
                                  strokeWidth={1.5}
                                  className="h-4 w-4 text-moss-glow"
                                />
                              ) : (
                                <XCircle
                                  aria-label="Incorrect"
                                  strokeWidth={1.5}
                                  className="h-4 w-4 text-clay-soft"
                                />
                              )}
                              <span className="font-numeral text-12 tabular-nums text-ink-faint">
                                {a.pointsAwarded > 0 ? `+${a.pointsAwarded}` : "0"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button onClick={() => router.push("/accueil")}>Retour à l&apos;accueil</Button>
      </div>
    </div>
  );
}
