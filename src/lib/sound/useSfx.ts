"use client";

import { useCallback } from "react";
import { useSoundEnabled } from "@/lib/sound/settings";
import { sfx, type SfxKey } from "@/lib/sound/engine";

/** `play("correct")` etc. — a no-op whenever the user has sound muted (the default). */
export function useSfx(): (key: SfxKey) => void {
  const [enabled] = useSoundEnabled();
  return useCallback((key: SfxKey) => {
    if (enabled) sfx[key]();
  }, [enabled]);
}
