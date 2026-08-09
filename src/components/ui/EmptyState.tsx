import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { CompassRose } from "@/components/ui/HandDrawn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-soft px-6 py-12 text-center",
        className,
      )}
    >
      <span className="text-ink-faint" aria-hidden="true">
        {icon ?? <CompassRose className="h-12 w-12" />}
      </span>
      <h3 className="font-display text-20 text-ink-high">{title}</h3>
      {description && <p className="max-w-sm text-14 text-ink-mid">{description}</p>}
      {action}
    </div>
  );
}
