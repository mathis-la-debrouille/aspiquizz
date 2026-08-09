"use client";

import { Toggle } from "@/components/ui/Toggle";
import { useSoundEnabled } from "@/lib/sound/settings";

export function SoundToggle() {
  const [enabled, setEnabled] = useSoundEnabled();

  return (
    <Toggle
      label="Son"
      labelHidden
      checked={enabled}
      onChange={(e) => setEnabled(e.target.checked)}
    />
  );
}
