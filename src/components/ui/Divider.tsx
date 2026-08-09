import { cn } from "@/lib/utils/cn";

export interface DividerProps {
  label?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({ label, orientation = "horizontal", className }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("w-px self-stretch bg-border-soft", className)}
      />
    );
  }

  if (!label) {
    return <hr className={cn("border-t border-border-soft", className)} />;
  }

  return (
    <div className={cn("flex items-center gap-3", className)} role="separator">
      <div className="h-px flex-1 bg-border-soft" />
      <span className="text-12 tracking-[0.08em] text-ink-faint uppercase">{label}</span>
      <div className="h-px flex-1 bg-border-soft" />
    </div>
  );
}
