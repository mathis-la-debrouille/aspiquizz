import { CompassRose } from "@/components/ui/HandDrawn";

export function CountdownOverlay() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <CompassRose className="ember-flicker h-16 w-16 text-gold" />
      <h1 className="font-display text-34 text-ink-high">Préparez-vous…</h1>
    </div>
  );
}
