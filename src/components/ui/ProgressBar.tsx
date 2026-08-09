import { cn } from "@/lib/utils/cn";

export interface ProgressBarProps {
  /** 0–1 */
  value: number;
  label?: string;
  tone?: "moss" | "gold" | "clay";
  className?: string;
}

const toneClasses: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  moss: "bg-moss",
  gold: "bg-gold",
  clay: "bg-clay",
};

export function ProgressBar({ value, label, tone = "moss", className }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <div className="flex justify-between text-12 text-ink-mid">
          <span>{label}</span>
          <span className="font-numeral tabular-nums">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-bg-inset"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-200", toneClasses[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
