"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { PodiumStage } from "@/components/room/PodiumStage";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useSfx } from "@/lib/sound/useSfx";
import type { RoomFinishedPayload, RoomStateView } from "@/server/socket/events";

export function Podium({ payload, state }: { payload: RoomFinishedPayload; state: RoomStateView }) {
  const router = useRouter();
  const playSfx = useSfx();
  const playersByUserId = new Map(state.players.map((p) => [p.userId, p]));
  // Nothing between questions shows scores any more (the run is uninterrupted, the correction
  // round rules one question at a time), so this is the one place to see the full per-question
  // record — one lookup per (question, player) cell rather than re-scanning answerLog per cell.
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

      <PodiumStage podium={payload.podium} />

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
