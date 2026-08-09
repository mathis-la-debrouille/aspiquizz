"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `prefers-reduced-motion`. Components that animate (ScoreTicker,
 * StreakMeter's ember flicker, reveal pulses, …) read this and skip or
 * shorten their animation instead of ignoring the preference — see brief §4.5.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}
