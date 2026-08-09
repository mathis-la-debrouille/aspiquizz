import { cn } from "@/lib/utils/cn";

export interface SkeletonProps {
  className?: string;
  /** Renders as a circle instead of a rounded rectangle — for avatar placeholders. */
  circle?: boolean;
}

export function Skeleton({ className, circle = false }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse bg-bg-inset", circle ? "rounded-full" : "rounded-md", className)}
    />
  );
}
