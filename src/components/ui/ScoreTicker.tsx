"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface ScoreTickerProps {
  value: number;
  className?: string;
}

/** Tweens between score values instead of snapping — see brief §4.5. */
export function ScoreTicker({ value, className }: ScoreTickerProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) return;

    if (reducedMotion) {
      setDisplay(to);
      return;
    }

    const controls = animate(from, to, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, reducedMotion]);

  return (
    <span className={cn("font-numeral tabular-nums", className)}>
      {display.toLocaleString("fr-FR")}
    </span>
  );
}
