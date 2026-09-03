"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion";
import { motion } from "motion/react";
import { Crown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSfx } from "@/lib/sound/useSfx";
import { cn } from "@/lib/utils/cn";
import type { PodiumEntry } from "@/server/socket/events";

/** Left-to-right on screen: 2nd, 1st, 3rd — the shape a podium actually has. */
const VISUAL_ORDER = [2, 1, 3];
const PLATFORM_HEIGHT: Record<number, string> = { 1: "h-32", 2: "h-24", 3: "h-16" };

/** Each place appears this long after the previous one, counting up from 3rd. */
const POP_GAP_MS = 450;
/** How long after the last place appears the first reel stops. */
const FIRST_LOCK_MS = 1300;
/** And the gap between one reel stopping and the next. */
const LOCK_GAP_MS = 700;

/**
 * The end-of-game podium, staged rather than simply rendered.
 *
 * Places pop in one at a time from third to first. Every score starts rolling the moment its
 * place appears and they all roll together, then stop one at a time in the same order — so the
 * winner's number is the last thing to land, and a one-point margin is revealed at the last
 * possible moment instead of being printed on arrival. That was the whole request, and it's also
 * just how you'd read out a result out loud.
 *
 * Tied players share one wider platform, side by side, with the tie named on it. Ranking is the
 * server's (`assignRanks`), so "two firsts and a third" arrives as data, not as a layout trick.
 *
 * `prefers-reduced-motion` skips the entire sequence and renders the final state immediately —
 * every place popped, every score locked, crown in place.
 */
export function PodiumStage({ podium }: { podium: PodiumEntry[] }) {
  const reducedMotion = useReducedMotion();
  const playSfx = useSfx();

  // rank -> everyone on that rank. Ranks are the server's, so a two-way tie for first leaves
  // rank 2 genuinely absent and the map simply has no entry for it.
  const groups = useMemo(() => {
    const byRank = new Map<number, PodiumEntry[]>();
    for (const entry of podium) {
      const bucket = byRank.get(entry.rank);
      if (bucket) bucket.push(entry);
      else byRank.set(entry.rank, [entry]);
    }
    return byRank;
  }, [podium]);

  /** Present ranks, worst first — the order everything is staged in. */
  const stageOrder = useMemo(() => [...groups.keys()].sort((a, b) => b - a), [groups]);

  const [popped, setPopped] = useState<Set<number>>(new Set());
  const [locked, setLocked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (reducedMotion) {
      setPopped(new Set(stageOrder));
      setLocked(new Set(stageOrder));
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const lastPopAt = (stageOrder.length - 1) * POP_GAP_MS;

    stageOrder.forEach((rank, i) => {
      timers.push(setTimeout(() => setPopped((prev) => new Set(prev).add(rank)), i * POP_GAP_MS));
      timers.push(
        setTimeout(
          () => {
            setLocked((prev) => new Set(prev).add(rank));
            playSfx(rank === 1 ? "podiumCrown" : "podiumLock");
          },
          lastPopAt + FIRST_LOCK_MS + i * LOCK_GAP_MS,
        ),
      );
    });

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staged once per finished game
  }, [reducedMotion]);

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-4">
      {VISUAL_ORDER.filter((rank) => groups.has(rank)).map((rank) => {
        const entries = groups.get(rank)!;
        const isPopped = popped.has(rank);
        const isLocked = locked.has(rank);
        const tied = entries.length > 1;

        return (
          <motion.div
            key={rank}
            initial={reducedMotion ? undefined : { y: 56, opacity: 0, scale: 0.85 }}
            animate={isPopped ? { y: 0, opacity: 1, scale: 1 } : undefined}
            transition={{ type: "spring", stiffness: 520, damping: 24, mass: 0.7 }}
            className="flex flex-col items-center gap-2"
          >
            {rank === 1 && (
              <motion.div
                aria-hidden="true"
                initial={reducedMotion ? undefined : { y: -22, opacity: 0, rotate: -12 }}
                animate={isLocked ? { y: 0, opacity: 1, rotate: 0 } : undefined}
                transition={{ type: "spring", stiffness: 420, damping: 14 }}
                className="text-gold"
              >
                <Crown className="h-7 w-7" strokeWidth={1.5} />
              </motion.div>
            )}

            <div className="flex items-end gap-2">
              {entries.map((entry) => (
                <div key={entry.userId} className="flex flex-col items-center gap-1.5">
                  <Avatar seed={entry.avatarSeed} size={rank === 1 && !tied ? "xl" : "lg"} />
                  <p className="max-w-[7rem] truncate text-14 font-medium text-ink-high">
                    {entry.displayName}
                  </p>
                  <SlotScore
                    value={entry.score}
                    rolling={isPopped && !isLocked}
                    locked={isLocked}
                  />
                </div>
              ))}
            </div>

            <div
              className={cn(
                "flex flex-col items-center justify-start gap-1 rounded-t-md border border-border-hard bg-bg-raised pt-2",
                PLATFORM_HEIGHT[rank],
                tied ? "w-auto min-w-32 px-3" : "w-24",
              )}
            >
              <span className="font-display text-26 text-gold">{rank}</span>
              {tied && (
                <span className="text-12 tracking-[0.14em] text-gold-soft uppercase">ex æquo</span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * A score that rolls before it lands, like a fairground punch machine.
 *
 * While `rolling` it cycles numbers around the eventual value's magnitude, so the digits move
 * without ever sitting on the real score early. On `locked` it runs up to the value and punches
 * once — the run-up is what makes the last digit legible rather than just a snap.
 *
 * The ceiling is derived from the value rather than fixed: scores are single or double digits
 * now, and a reel spinning through 900 for a 13-point game would read as a different game.
 */
function SlotScore({
  value,
  rolling,
  locked,
}: {
  value: number;
  rolling: boolean;
  locked: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(reducedMotion || locked ? value : 0);
  const displayRef = useRef(display);
  displayRef.current = display;

  // Spin. One interval, cleared the moment rolling stops — the cleanup is what guarantees a
  // stray tick can't overwrite the locked value afterwards.
  useEffect(() => {
    if (reducedMotion || !rolling) return;
    const ceiling = Math.max(9, Math.ceil(value * 1.4));
    const id = setInterval(() => {
      setDisplay(Math.floor(Math.random() * (ceiling + 1)));
    }, 55);
    return () => clearInterval(id);
  }, [rolling, value, reducedMotion]);

  // Land.
  useEffect(() => {
    if (!locked) return;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(displayRef.current, value, {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [locked, value, reducedMotion]);

  return (
    <motion.span
      animate={locked && !reducedMotion ? { scale: [1, 1.35, 1] } : undefined}
      transition={{ duration: 0.4, times: [0, 0.35, 1] }}
      className={cn(
        "font-numeral text-18 tabular-nums",
        locked ? "text-gold" : "text-gold-soft/60",
      )}
    >
      {display}
    </motion.span>
  );
}
