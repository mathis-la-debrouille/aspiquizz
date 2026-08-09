import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface RadioCardProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
  icon?: ReactNode;
}

/**
 * A card-sized radio option — used for the question-type picker (§10.1) and
 * similar "choose one of a few large options" moments.
 */
export const RadioCard = forwardRef<HTMLInputElement, RadioCardProps>(function RadioCard(
  { label, description, icon, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const radioId = id ?? autoId;

  return (
    <label
      htmlFor={radioId}
      className={cn(
        "group has-checked:border-moss has-checked:bg-moss-deep/15 relative flex cursor-pointer flex-col gap-2 rounded-lg border border-border-soft bg-bg-surface p-4 transition-colors duration-150 has-checked:shadow-[0_0_0_1px_var(--color-moss)]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        type="radio"
        id={radioId}
        disabled={disabled}
        className="peer sr-only"
        {...props}
      />
      {icon && <span className="text-ink-mid peer-checked:text-moss-glow">{icon}</span>}
      <span className="text-16 font-medium text-ink-high">{label}</span>
      {description && <span className="text-12 text-ink-mid">{description}</span>}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-transparent peer-focus-visible:ring-gold"
      />
    </label>
  );
});
