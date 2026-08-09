"use client";

import { useEffect } from "react";
import { CompassRose } from "@/components/ui/HandDrawn";
import { useSfx } from "@/lib/sound/useSfx";

export function CountdownOverlay() {
  const playSfx = useSfx();
  // Fires once per mount (a fresh countdown starts each time this component appears — see
  // RoomClient's phase switch), not on every render.
  useEffect(() => {
    playSfx("countdown");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once-per-mount, see comment above
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <CompassRose className="ember-flicker h-16 w-16 text-gold" />
      <h1 className="font-display text-34 text-ink-high">Préparez-vous…</h1>
    </div>
  );
}
