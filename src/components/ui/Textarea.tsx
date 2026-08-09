import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, disabled, rows = 4, ...props },
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
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cn(
          "resize-y rounded-md border bg-bg-inset px-3 py-2 text-16 text-ink-high placeholder:text-ink-faint",
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
