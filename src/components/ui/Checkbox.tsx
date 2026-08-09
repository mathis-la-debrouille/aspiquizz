import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const checkboxId = id ?? autoId;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        "group flex cursor-pointer items-start gap-3",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          disabled={disabled}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[6px] border border-border-hard bg-bg-inset transition-colors duration-150 checked:border-moss checked:bg-moss focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          {...props}
        />
        <Check
          aria-hidden="true"
          strokeWidth={2.5}
          className="pointer-events-none relative h-3.5 w-3.5 scale-0 text-bg-void transition-transform duration-150 peer-checked:scale-100"
        />
      </span>
      <span className="flex flex-col">
        <span className="text-14 text-ink-high">{label}</span>
        {description && <span className="text-12 text-ink-faint">{description}</span>}
      </span>
    </label>
  );
});
