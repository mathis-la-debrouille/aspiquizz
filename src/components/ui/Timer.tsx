"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface TimerProps {
  /** Epoch ms the question closes at — server-authoritative, see brief §11.3. */
  deadlineMs: number;
  /** Epoch ms the countdown started at (used to compute the ring's full sweep). */
  startedAtMs: number;
  size?: number;
  onExpire?: () => void;
  className?: string;
}

/** Ring + numeral countdown. Ticks locally from a server-provided deadline — never a local timer. */
export function Timer({ deadlineMs, startedAtMs, size = 72, onExpire, className }: TimerProps) {
  const total = Math.max(1, deadlineMs - startedAtMs);
  // Start from the full duration, not `deadlineMs - Date.now()`: the latter reads the clock
  // during render, which runs on both server and client and disagrees between the two,
  // producing a hydration mismatch. The real remaining time is corrected client-side on
  // mount, one animation frame later, via the effect below.
  const [remaining, setRemaining] = useState(total);
  const expiredRef = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    expiredRef.current = false;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, deadlineMs - Date.now());
      setRemaining(left);
      if (left <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpire?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadlineMs, onExpire]);

  const ratio = Math.max(0, Math.min(1, remaining / total));
  const seconds = Math.ceil(remaining / 1000);
  const urgent = seconds <= 5 && seconds > 0;
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-bg-inset)"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-clay)" : "var(--color-moss)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{
            transition: reducedMotion ? undefined : "stroke-dashoffset 200ms linear, stroke 200ms",
          }}
        />
      </svg>
      <span
        className={cn(
          "font-numeral absolute text-20 font-medium tabular-nums",
          urgent ? "text-clay-soft" : "text-ink-high",
          urgent && !reducedMotion && "animate-pulse",
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
