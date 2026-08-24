"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { useSoundEnabled } from "@/lib/sound/settings";
import { sfx } from "@/lib/sound/engine";

export function SoundToggle() {
  const [enabled, setEnabled] = useSoundEnabled();

  return (
    <div className="flex items-center gap-1.5">
      {enabled ? (
        <Volume2 aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-ink-mid" />
      ) : (
        <VolumeX aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-ink-mid" />
      )}
      <Toggle
        label="Son"
        labelHidden
        checked={enabled}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          // Play the confirmation cue directly: useSfx()'s enabled-gate still reflects the
          // pre-toggle (muted) state at this instant, so it would swallow the very sound meant
          // to confirm sound just got turned on.
          if (next) sfx.toggleOn();
        }}
      />
    </div>
  );
}
