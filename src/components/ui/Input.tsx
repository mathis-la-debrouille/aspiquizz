import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-14 font-medium text-ink-mid">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 rounded-md border bg-bg-inset px-3 text-16 text-ink-high placeholder:text-ink-faint",
          "transition-colors duration-150 outline-none",
          "border-border-hard focus:border-gold",
          error && "border-clay focus:border-clay",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-12 text-clay-soft">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="text-12 text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
