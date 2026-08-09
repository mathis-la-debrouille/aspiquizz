import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type CardRadius = "sm" | "md" | "lg" | "xl";
export type CardElevation = "flat" | "raised" | "lifted";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  radius?: CardRadius;
  elevation?: CardElevation;
  /** Uneven rhythm per §4.4.5 — cards aren't a uniform grid by default. */
  inset?: boolean;
}

const radii: Record<CardRadius, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

const elevations: Record<CardElevation, string> = {
  flat: "shadow-none",
  raised: "shadow-[var(--shadow-1)]",
  lifted: "shadow-[var(--shadow-2)]",
};

/**
 * Card lip: 1px border-soft outline + the inset top highlight baked into the
 * --shadow-1/2 tokens, giving a beveled, physical edge — see §4.4.4.
 */
export function Card({
  radius = "lg",
  elevation = "raised",
  inset = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "border border-border-soft",
        inset ? "bg-bg-inset" : "bg-bg-surface",
        radii[radius],
        elevations[elevation],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
