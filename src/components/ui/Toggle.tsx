import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** Hides the text label visually but keeps it for screen readers. */
  labelHidden?: boolean;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, labelHidden = false, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const toggleId = id ?? autoId;

  return (
    <label
      htmlFor={toggleId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          id={toggleId}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-bg-inset border border-border-hard transition-colors duration-150 peer-checked:border-moss-deep peer-checked:bg-moss peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold"
        />
        <span
          aria-hidden="true"
          className="relative h-4.5 w-4.5 translate-x-1 rounded-full bg-ink-mid shadow-[var(--shadow-1)] transition-transform duration-150 peer-checked:translate-x-[22px] peer-checked:bg-bg-void"
        />
      </span>
      <span className={cn("text-14 text-ink-high", labelHidden && "sr-only")}>{label}</span>
    </label>
  );
});
