"use client";

import { useEffect, useRef, useState } from "react";
import type { GameSocket } from "@/lib/socket/client";

const SYNC_INTERVAL_MS = 30_000;
const SAMPLE_COUNT = 5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Server clock offset, sampled via time:sync on connect and every 30s,
 * median over the last 5 samples — brief §11.3. Countdown UIs should render
 * as `deadlineMs - (Date.now() + offset)`, never trust local elapsed time.
 */
export function useClockOffset(socket: GameSocket): number {
  const [offset, setOffset] = useState(0);
  const samplesRef = useRef<number[]>([]);

  useEffect(() => {
    function sample() {
      const clientTime = Date.now();
      socket.emit("time:sync", { clientTime }, ({ serverTime }: { serverTime: number }) => {
        const roundTrip = Date.now() - clientTime;
        const estimatedOffset = serverTime + roundTrip / 2 - Date.now();
        const samples = [...samplesRef.current, estimatedOffset].slice(-SAMPLE_COUNT);
        samplesRef.current = samples;
        setOffset(median(samples));
      });
    }

    sample();
    const interval = setInterval(sample, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [socket]);

  return offset;
}
