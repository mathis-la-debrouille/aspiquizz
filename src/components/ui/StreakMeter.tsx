import { Flame } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface StreakMeterProps {
  /** Consecutive correct answers. Bonus caps at 5 per §12, the meter reflects that cap. */
  streak: number;
  className?: string;
}

const MAX_PIPS = 5;

/** Small flame/ember bar — fills with streak, gains a slow ember flicker at 3+. */
export function StreakMeter({ streak, className }: StreakMeterProps) {
  const filled = Math.min(streak, MAX_PIPS);
  const isHot = streak >= 3;

  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={`Série de ${streak}`}>
      <div className="flex gap-0.5">
        {Array.from({ length: MAX_PIPS }, (_, i) => {
          const on = i < filled;
          return (
            <Flame
              key={i}
              aria-hidden="true"
              strokeWidth={1.5}
              className={cn(
                "h-4 w-4 transition-colors duration-150",
                on ? "fill-gold text-gold-deep" : "fill-transparent text-border-hard",
                on && isHot && "ember-flicker",
              )}
            />
          );
        })}
      </div>
      <span className="font-numeral text-14 tabular-nums text-ink-mid">×{streak}</span>
    </div>
  );
}
