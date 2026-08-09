import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/**
 * Native <select> — keeps full keyboard/screen-reader behaviour for free
 * instead of reimplementing a listbox. Styled to match the token set.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, disabled, children, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-14 font-medium text-ink-mid">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full appearance-none rounded-md border bg-bg-inset px-3 pr-9 text-16 text-ink-high",
            "transition-colors duration-150 outline-none",
            "border-border-hard focus:border-gold",
            error && "border-clay focus:border-clay",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.5}
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-low"
        />
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="text-12 text-clay-soft">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${selectId}-hint`} className="text-12 text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
