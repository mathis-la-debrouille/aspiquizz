import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
}

/**
 * A larger structural container for a whole section (host config panel,
 * admin table wrapper, …) — heavier than Card, meant to hold other Cards.
 */
export function Panel({ title, eyebrow, action, className, children, ...props }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border-soft bg-bg-raised p-5 shadow-[var(--shadow-2)] sm:p-6",
        className,
      )}
      {...props}
    >
      {(title ?? action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="text-12 font-numeral tracking-[0.08em] text-ink-faint uppercase">
                {eyebrow}
              </p>
            )}
            {title && <h2 className="font-display text-20 text-ink-high">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
