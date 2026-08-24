import { cn } from "@/lib/utils/cn";

export interface SpinnerProps {
  className?: string;
}

/** A spinning ring built from a border, not an SVG/icon font — matches Button's inline loading
 *  state (kept here as a shared primitive so route-level loading.tsx files can use the same
 *  visual language without duplicating the markup). */
export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
